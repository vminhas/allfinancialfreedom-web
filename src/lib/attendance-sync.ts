// Attendance sync: takes a TrainingEvent that streamed via Zoom, pulls
// the participant report, matches each participant to an AgentProfile,
// and writes/updates one TrainingAttendance row per active agent.
// Runs on demand (manual button on the event) and from the hourly cron.
//
// Match order:
//   1. Zoom registrant/user email -> AgentUser.email (case-insensitive)
//   2. Zoom display name -> AgentProfile fullName (normalized)
//   3. Drop into TrainingAttendanceOrphan for the admin queue
//
// Status rules:
//   - Active agent + matched in report + duration >= threshold -> PRESENT
//   - Active agent + matched in report + duration < threshold  -> PRESENT
//     (we still count them; threshold only governs the *default* "Yes
//     they showed up" verdict. A 30-second join is honest about
//     duration in the cell tooltip but doesn't get demoted to Absent.)
//   - Active agent + NOT in report -> ABSENT
//   - Agent.status === INACTIVE                      -> NOT_TRACKING
//   - Agent.icaDate > training.startsAt              -> NOT_JOINED_YET
//   - Admin-set manualStatus wins on subsequent syncs (we never
//     clobber EXCUSED / NOT_TRACKING overrides on re-sync).

import type { TrainingEvent, TrainingAttendanceStatus } from '@/generated/prisma/client'
import { db } from './db'
import { fetchPastMeetingParticipants, ZoomApiError, type ZoomParticipant } from './zoom'
import { getSetting } from './settings'

const DEFAULT_PRESENT_THRESHOLD_PCT = 50

export interface SyncResult {
  trainingEventId: string
  totalAgents: number
  present: number
  absent: number
  excused: number
  notTracking: number
  notJoinedYet: number
  orphans: number
  participantsFetched: number
}

function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normEmail(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim()
}

// Sum durations across rejoins, but key by the strongest identifier we
// have for each person. Zoom assigns user_id per-meeting per-join, so
// we coalesce on (registrant_id || email || normalized name) instead.
interface AggregatedParticipant {
  key: string
  displayName: string
  email: string | null
  zoomUserId: string | null
  totalDurationSeconds: number
  earliestJoin: Date
  latestLeave: Date
}

function aggregateParticipants(participants: ZoomParticipant[]): AggregatedParticipant[] {
  const map = new Map<string, AggregatedParticipant>()
  for (const p of participants) {
    const key = (p.registrant_id && `r:${p.registrant_id}`)
      || (p.user_email && `e:${normEmail(p.user_email)}`)
      || `n:${normName(p.name)}`
    const join = new Date(p.join_time)
    const leave = new Date(p.leave_time)
    const existing = map.get(key)
    if (existing) {
      existing.totalDurationSeconds += p.duration
      if (join < existing.earliestJoin) existing.earliestJoin = join
      if (leave > existing.latestLeave) existing.latestLeave = leave
      // Prefer a non-null email/userId if we get one on a later segment
      if (!existing.email && p.user_email) existing.email = p.user_email
      if (!existing.zoomUserId && p.id) existing.zoomUserId = p.id
    } else {
      map.set(key, {
        key,
        displayName: p.name,
        email: p.user_email,
        zoomUserId: p.id,
        totalDurationSeconds: p.duration,
        earliestJoin: join,
        latestLeave: leave,
      })
    }
  }
  return Array.from(map.values())
}

interface AgentLookup {
  byEmail: Map<string, { profileId: string }>
  byName: Map<string, { profileId: string }>
}

async function buildAgentLookup(): Promise<AgentLookup> {
  // We pull both ACTIVE + INACTIVE so we can match retired agents too
  // (their attendance still tells a story for historical drilldowns).
  const profiles = await db.agentProfile.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      agentUser: { select: { email: true } },
    },
  })
  const byEmail = new Map<string, { profileId: string }>()
  const byName = new Map<string, { profileId: string }>()
  for (const p of profiles) {
    const email = normEmail(p.agentUser?.email)
    if (email) byEmail.set(email, { profileId: p.id })
    const name = normName(`${p.firstName} ${p.lastName}`)
    if (name) byName.set(name, { profileId: p.id })
  }
  // Layer in admin-resolved aliases. These take precedence over the
  // automatic fullName/email match because they encode an admin
  // decision -- e.g. "Sadie's iPhone" is Sadie Grubb. Aliases
  // accumulate over time as orphans get resolved, so this lookup
  // gets smarter every sync cycle without the admin doing anything.
  const aliases = await db.agentZoomAlias.findMany({
    select: { agentProfileId: true, nameKey: true, email: true },
  })
  for (const a of aliases) {
    if (a.email) byEmail.set(a.email, { profileId: a.agentProfileId })
    if (a.nameKey) byName.set(a.nameKey, { profileId: a.agentProfileId })
  }
  return { byEmail, byName }
}

interface MatchedRow {
  profileId: string
  participant: AggregatedParticipant
}

function matchParticipants(
  agg: AggregatedParticipant[],
  lookup: AgentLookup,
): { matched: MatchedRow[]; orphans: AggregatedParticipant[] } {
  const matched: MatchedRow[] = []
  const orphans: AggregatedParticipant[] = []
  const usedProfileIds = new Set<string>()
  for (const a of agg) {
    const emailHit = a.email ? lookup.byEmail.get(normEmail(a.email)) : undefined
    const nameHit = !emailHit ? lookup.byName.get(normName(a.displayName)) : undefined
    const hit = emailHit ?? nameHit
    if (hit && !usedProfileIds.has(hit.profileId)) {
      matched.push({ profileId: hit.profileId, participant: a })
      usedProfileIds.add(hit.profileId)
    } else {
      orphans.push(a)
    }
  }
  return { matched, orphans }
}

async function getPresentThresholdPct(): Promise<number> {
  const raw = await getSetting('ATTENDANCE_PRESENT_THRESHOLD_PCT')
  const n = parseInt(raw, 10)
  if (Number.isFinite(n) && n >= 0 && n <= 100) return n
  return DEFAULT_PRESENT_THRESHOLD_PCT
}

// Compute the "computed" status for a given agent + (optional) match.
// Manual overrides are applied separately by the caller.
function computeStatus(opts: {
  matched: MatchedRow | undefined
  agentStatus: 'ACTIVE' | 'INACTIVE'
  agentIcaDate: Date | null
  trainingStartsAt: Date
  thresholdSeconds: number
}): TrainingAttendanceStatus {
  if (opts.agentStatus === 'INACTIVE') return 'NOT_TRACKING'
  if (opts.agentIcaDate && opts.agentIcaDate > opts.trainingStartsAt) return 'NOT_JOINED_YET'
  if (opts.matched) return 'PRESENT'
  return 'ABSENT'
}

export async function syncTrainingAttendance(
  trainingEvent: Pick<TrainingEvent, 'id' | 'startsAt' | 'durationMinutes' | 'streamId' | 'streamType'>,
): Promise<SyncResult> {
  if (trainingEvent.streamType !== 'ZOOM') {
    throw new Error(`Cannot sync attendance for non-Zoom training (streamType=${trainingEvent.streamType})`)
  }
  if (!trainingEvent.streamId) {
    throw new Error('Training event has no streamId; nothing to sync')
  }

  // 1. Fetch the participant report from Zoom (paginated). We pass
  //    startsAt so the helper picks the right instance UUID for
  //    recurring meetings -- otherwise Zoom returns only the most
  //    recent occurrence's data regardless of which date we wanted.
  //    Throws ZoomConfigError / ZoomApiError on auth or 404; caller
  //    decides whether to surface or retry.
  const participants = await fetchPastMeetingParticipants(trainingEvent.streamId, trainingEvent.startsAt)
  const agg = aggregateParticipants(participants)

  // 2. Build the agent lookup and match.
  const lookup = await buildAgentLookup()
  const { matched, orphans } = matchParticipants(agg, lookup)
  const matchedByProfile = new Map(matched.map(m => [m.profileId, m]))

  // 3. Pull every agent we want a row for. We write rows for all
  //    agents (ACTIVE + INACTIVE) so the grid renders dense and the
  //    historical filters work; status itself encodes whether they
  //    were tracked at the time.
  const agents = await db.agentProfile.findMany({
    select: { id: true, status: true, icaDate: true },
  })

  const thresholdPct = await getPresentThresholdPct()
  const thresholdSeconds = Math.round((trainingEvent.durationMinutes * 60 * thresholdPct) / 100)

  // 4. Read existing manualStatus values so we don't clobber them.
  const existing = await db.trainingAttendance.findMany({
    where: { trainingEventId: trainingEvent.id },
    select: { agentProfileId: true, manualStatus: true, manualNote: true },
  })
  const manualByProfile = new Map(existing.map(e => [
    e.agentProfileId,
    { manualStatus: e.manualStatus, manualNote: e.manualNote },
  ]))

  // 5. Upsert one row per agent. Effective status = manualStatus ?? computedStatus.
  let present = 0, absent = 0, excused = 0, notTracking = 0, notJoinedYet = 0
  for (const a of agents) {
    const m = matchedByProfile.get(a.id)
    const computed = computeStatus({
      matched: m,
      agentStatus: a.status,
      agentIcaDate: a.icaDate,
      trainingStartsAt: trainingEvent.startsAt,
      thresholdSeconds,
    })
    const manual = manualByProfile.get(a.id)
    const effective: TrainingAttendanceStatus = manual?.manualStatus ?? computed

    switch (effective) {
      case 'PRESENT': present++; break
      case 'ABSENT': absent++; break
      case 'EXCUSED': excused++; break
      case 'NOT_TRACKING': notTracking++; break
      case 'NOT_JOINED_YET': notJoinedYet++; break
    }

    await db.trainingAttendance.upsert({
      where: {
        trainingEventId_agentProfileId: {
          trainingEventId: trainingEvent.id,
          agentProfileId: a.id,
        },
      },
      create: {
        trainingEventId: trainingEvent.id,
        agentProfileId: a.id,
        status: effective,
        manualStatus: manual?.manualStatus ?? null,
        manualNote: manual?.manualNote ?? null,
        zoomDisplayName: m?.participant.displayName ?? null,
        zoomEmail: m?.participant.email ?? null,
        zoomUserId: m?.participant.zoomUserId ?? null,
        joinedAt: m?.participant.earliestJoin ?? null,
        leftAt: m?.participant.latestLeave ?? null,
        durationSeconds: m?.participant.totalDurationSeconds ?? null,
        source: 'zoom',
      },
      update: {
        // Re-compute status but never overwrite the manualStatus the
        // admin set. We DO refresh the duration/email fields so the
        // tooltip reflects the latest sync.
        status: effective,
        zoomDisplayName: m?.participant.displayName ?? null,
        zoomEmail: m?.participant.email ?? null,
        zoomUserId: m?.participant.zoomUserId ?? null,
        joinedAt: m?.participant.earliestJoin ?? null,
        leftAt: m?.participant.latestLeave ?? null,
        durationSeconds: m?.participant.totalDurationSeconds ?? null,
        source: 'zoom',
      },
    })
  }

  // 6. Replace the orphan list for this event. Re-syncs are idempotent:
  //    any orphan the admin already resolved keeps resolvedAt set, so
  //    we only delete unresolved ones before writing the fresh batch.
  //
  //    Permanently-dismissed guests (AttendanceDismissal) are filtered
  //    out so a confirmed non-agent does not reappear in the orphan
  //    queue every sync. Match on normalized display name OR email.
  const dismissals = await db.attendanceDismissal.findMany({
    select: { nameKey: true, email: true },
  })
  const dismissedNames = new Set(dismissals.map(d => d.nameKey))
  const dismissedEmails = new Set(
    dismissals.map(d => normEmail(d.email)).filter(e => e.length > 0),
  )
  const liveOrphans = orphans.filter(o => {
    if (dismissedNames.has(normName(o.displayName))) return false
    const e = normEmail(o.email)
    if (e && dismissedEmails.has(e)) return false
    return true
  })

  await db.trainingAttendanceOrphan.deleteMany({
    where: { trainingEventId: trainingEvent.id, resolvedAt: null },
  })
  for (const o of liveOrphans) {
    await db.trainingAttendanceOrphan.create({
      data: {
        trainingEventId: trainingEvent.id,
        zoomDisplayName: o.displayName,
        zoomEmail: o.email,
        zoomUserId: o.zoomUserId,
        joinedAt: o.earliestJoin,
        durationSeconds: o.totalDurationSeconds,
      },
    })
  }

  // 7. Stamp the event so the cron can skip it next time.
  await db.trainingEvent.update({
    where: { id: trainingEvent.id },
    data: { attendanceSyncedAt: new Date() },
  })

  return {
    trainingEventId: trainingEvent.id,
    totalAgents: agents.length,
    present,
    absent,
    excused,
    notTracking,
    notJoinedYet,
    orphans: liveOrphans.length,
    participantsFetched: agg.length,
  }
}

// Re-export so callers can `import { ZoomApiError } from '@/lib/attendance-sync'`
// without pulling the lower-level module directly.
export { ZoomApiError }
