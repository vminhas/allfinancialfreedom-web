import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns the dense grid: rows = agents, columns = ZOOM training events
// in the date range, cells = effective status. We resolve "effective"
// here so the client doesn't have to know the manual-override rules.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  // Default range: last 60 days. Aligns with what the spreadsheet
  // typically shows and keeps the column count manageable.
  // Date inputs send YYYY-MM-DD which `new Date()` parses as midnight
  // UTC; for the `to` end of the range we want end-of-day instead so
  // a meeting at 8pm on the chosen day still falls inside.
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 60 * 86_400_000)
  const from = fromStr ? new Date(fromStr) : defaultFrom
  const to = toStr ? new Date(`${toStr}T23:59:59.999Z`) : now
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid from/to dates' }, { status: 400 })
  }

  const events = await db.trainingEvent.findMany({
    where: {
      startsAt: { gte: from, lte: to },
      // Tracked is the only filter -- streamType doesn't matter here.
      // Zoom events get auto-pulled from the API; non-Zoom events
      // (GFI Live, in-person, etc.) appear as columns for manual cell
      // marking via the override popover.
      trackAttendance: true,
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      attendanceSyncedAt: true,
      durationMinutes: true,
      flyerImageUrl: true,
      presenters: true,
      streamType: true,
      streamId: true,
    },
    orderBy: { startsAt: 'asc' },
  })

  const agents = await db.agentProfile.findMany({
    where: { isTest: false },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      icaDate: true,
      status: true,
      cft: true,
      phase: true,
      avatarUrl: true,
      // recruiterId stores the recruiter's agentCode (per CLAUDE.md),
      // resolved to a display name below for the hover card.
      recruiterId: true,
    },
  })

  // Resolve recruiter display names in one batch (same pattern as the
  // leaderboard route). Powers the "Reports to: X" hover card.
  const recruiterCodes = Array.from(
    new Set(agents.map(a => a.recruiterId).filter((c): c is string => !!c)),
  )
  const recruiters = recruiterCodes.length > 0
    ? await db.agentProfile.findMany({
        where: { agentCode: { in: recruiterCodes } },
        select: { agentCode: true, firstName: true, lastName: true, preferredName: true },
      })
    : []
  const recruiterByCode = new Map(
    recruiters.map(r => [
      r.agentCode,
      `${(r.preferredName?.trim() || r.firstName)} ${r.lastName}`.trim(),
    ]),
  )

  // Permanent do-not-track list. Agents on it render red across every
  // training unless an explicit per-event manualStatus override says
  // otherwise (so an unexpected reappearance can still be marked).
  const exclusions = await db.trainingAttendanceExclusion.findMany({
    select: { agentProfileId: true, reason: true },
  })
  const exclusionByAgent = new Map(exclusions.map(e => [e.agentProfileId, e.reason]))

  // Day-in-company computed from icaDate. Agents with no icaDate
  // sort to the bottom (no tenure stat to show).
  const agentsWithDay = agents.map(a => {
    const days = a.icaDate ? Math.floor((now.getTime() - a.icaDate.getTime()) / 86_400_000) : null
    return { ...a, daysInCompany: days }
  })
  agentsWithDay.sort((a, b) => {
    if (a.daysInCompany == null && b.daysInCompany == null) return 0
    if (a.daysInCompany == null) return 1
    if (b.daysInCompany == null) return -1
    return b.daysInCompany - a.daysInCompany
  })

  // Pull every attendance row for the events in scope; index in JS so
  // the response can stay flat. Quick at this scale (50 events x 200
  // agents = 10k rows max).
  const eventIds = events.map(e => e.id)
  const attendances = eventIds.length === 0 ? [] : await db.trainingAttendance.findMany({
    where: { trainingEventId: { in: eventIds } },
    select: {
      trainingEventId: true,
      agentProfileId: true,
      status: true,
      manualStatus: true,
      manualNote: true,
      durationSeconds: true,
      zoomDisplayName: true,
    },
  })
  const byEventAgent = new Map<string, typeof attendances[number]>()
  for (const a of attendances) {
    byEventAgent.set(`${a.trainingEventId}:${a.agentProfileId}`, a)
  }

  // Build cells. For events that haven't been synced yet we fall back
  // to a computed status so the column doesn't render as blank
  // ABSENTs that we can't trust.
  const rows = agentsWithDay.map(a => {
    const isExcluded = exclusionByAgent.has(a.id)
    const cells = events.map(ev => {
      const r = byEventAgent.get(`${ev.id}:${a.id}`)
      if (r) {
        // An explicit manual override always wins, even for excluded
        // agents (lets the admin mark a surprise reappearance present).
        if (r.manualStatus) {
          return {
            status: r.manualStatus,
            manual: true,
            manualNote: r.manualNote,
            durationSeconds: r.durationSeconds,
            zoomDisplayName: r.zoomDisplayName,
            synced: true,
          }
        }
        // No manual override: excluded agents are red regardless of
        // any Zoom-derived value.
        if (isExcluded) {
          return { status: 'NOT_TRACKING' as const, manual: false, manualNote: r.manualNote, synced: true }
        }
        return {
          status: r.status,
          manual: false,
          manualNote: r.manualNote,
          durationSeconds: r.durationSeconds,
          zoomDisplayName: r.zoomDisplayName,
          synced: true,
        }
      }
      // No row yet for this agent/event pair -- compute defaults.
      if (isExcluded || a.status === 'INACTIVE') {
        return { status: 'NOT_TRACKING' as const, manual: false, synced: false }
      }
      if (a.icaDate && a.icaDate > ev.startsAt) {
        return { status: 'NOT_JOINED_YET' as const, manual: false, synced: false }
      }
      // Event not yet synced -- show as pending rather than ABSENT so
      // the admin doesn't read accidental zeroes as truth.
      if (!ev.attendanceSyncedAt) {
        return { status: 'PENDING' as const, manual: false, synced: false }
      }
      return { status: 'ABSENT' as const, manual: false, synced: true }
    })
    // Per-agent attendance % over the range (excluding NOT_JOINED_YET / NOT_TRACKING / PENDING)
    let counted = 0, present = 0
    for (const c of cells) {
      if (c.status === 'PRESENT' || c.status === 'EXCUSED') { counted++; present++ }
      else if (c.status === 'ABSENT') counted++
    }
    return {
      agentProfileId: a.id,
      agentCode: a.agentCode,
      firstName: a.firstName,
      lastName: a.lastName,
      preferredName: a.preferredName,
      cft: a.cft,
      phase: a.phase,
      avatarUrl: a.avatarUrl,
      status: a.status,
      icaDate: a.icaDate?.toISOString() ?? null,
      daysInCompany: a.daysInCompany,
      attendancePct: counted > 0 ? Math.round((present / counted) * 100) : null,
      reportsTo: a.recruiterId ? (recruiterByCode.get(a.recruiterId) ?? null) : null,
      excluded: isExcluded,
      excludedReason: exclusionByAgent.get(a.id) ?? null,
      cells,
    }
  })

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    events: events.map(ev => ({
      id: ev.id,
      title: ev.title,
      startsAt: ev.startsAt.toISOString(),
      attendanceSyncedAt: ev.attendanceSyncedAt?.toISOString() ?? null,
      flyerImageUrl: ev.flyerImageUrl,
      presenters: Array.isArray(ev.presenters) ? ev.presenters : null,
      streamType: ev.streamType,
      streamId: ev.streamId,
    })),
    rows,
  })
}
