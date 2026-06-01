// Shared dedup + merge helpers for NewBusinessSubmission.
//
// Used in two places:
//   1. tevah-sync — to match an incoming Tevah row against an existing
//      manual entry so we update in place instead of creating a dup.
//   2. The admin "Find duplicates" tool in /vault/new-business — to
//      sweep for any existing pairs that pre-date the strengthened
//      match and merge them cleanly.
//
// The merge itself is destructive (deletes the loser row), so it
// always runs inside db.$transaction with a dry-run path that returns
// a preview without writing.

import { db } from '@/lib/db'
import type { NewBusinessStatus } from '@/generated/prisma/client'

// ─── Normalization ─────────────────────────────────────────────────

export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Drop common carrier-name suffixes that vary between manual entry
// and the Tevah feed ("Ethos" vs "Ethos Life Insurance Company" etc.)
// so a fuzzy carrier match doesn't fail on cosmetic differences. The
// policyType field already distinguishes IUL from Annuity, so stripping
// "Life"/"Annuity" off the carrier doesn't conflate distinct products.
export function normCarrier(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\b(life|annuity|insurance|insurer|inc|llc|co|company|corp|of|north|american)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Status priority for picking the winning status ────────────────
// When merging, the keeper inherits the most-progressed status of the
// two rows. ISSUED beats PENDING, CONDITIONALLY_ISSUED beats
// PENDING_CARRIER, etc. Terminal-but-bad statuses (DECLINED / LAPSED /
// NOT_TAKEN) rank below ISSUED so a stale ISSUED row never loses to a
// newer DECLINED unless we explicitly want to. Tevah is authoritative
// when present, so a tevahClientId-bearing row's status wins ties.
const STATUS_RANK: Record<NewBusinessStatus, number> = {
  PENDING: 1,
  HOLD: 2,
  PENDING_CARRIER: 3,
  NOT_TAKEN: 4,
  LAPSED: 5,
  DECLINED: 6,
  CONDITIONALLY_ISSUED: 7,
  ISSUED: 8,
}

export function preferStatus(
  a: { status: NewBusinessStatus; tevahClientId: number | null },
  b: { status: NewBusinessStatus; tevahClientId: number | null },
): NewBusinessStatus {
  const ra = STATUS_RANK[a.status] ?? 0
  const rb = STATUS_RANK[b.status] ?? 0
  if (ra !== rb) return ra > rb ? a.status : b.status
  // Tie break: prefer the Tevah-sourced row's status.
  if ((a.tevahClientId != null) !== (b.tevahClientId != null)) {
    return a.tevahClientId != null ? a.status : b.status
  }
  return a.status
}

// ─── Candidate finder (admin "Find duplicates") ────────────────────

export interface DuplicatePairCandidate {
  keepId: string   // older row, becomes the keeper on merge
  mergeId: string  // newer row, gets merged into keeper
  agentProfileId: string
  // 'distinct' = surface-attributes match BUT the two rows carry
  // different carrier policy numbers, so they are almost certainly two
  // real policies. Shown for manual review, excluded from bulk merge.
  confidence: 'high' | 'medium' | 'low' | 'distinct'
  reason: string
  keep: PairSide
  merge: PairSide
}

export interface PairSide {
  id: string
  clientFirstName: string
  clientLastName: string
  carrier: string
  policyType: string
  status: NewBusinessStatus
  points: number | null
  policyNumber: string | null
  applicationDate: Date
  createdAt: Date
  tevahClientId: number | null
  notesCount: number
}

// Sweep all submissions for likely-duplicate pairs. Conservative:
//   * Same writer (agentProfileId)
//   * Same policyType
//   * Same normalized client name
//   * Carrier normalizations match
//   * applicationDate within ±60 days
// Then assign confidence:
//   * HIGH:   matching non-null policyNumber OR exactly one side has
//             tevahClientId (the manual-then-Tevah pattern)
//   * MEDIUM: name + carrier + policyType + points all match
//   * LOW:    name + carrier + policyType match, points differ
export async function findDuplicatePairs(): Promise<DuplicatePairCandidate[]> {
  const rows = await db.newBusinessSubmission.findMany({
    select: {
      id: true,
      agentProfileId: true,
      clientFirstName: true,
      clientLastName: true,
      carrier: true,
      policyType: true,
      status: true,
      points: true,
      policyNumber: true,
      applicationDate: true,
      createdAt: true,
      tevahClientId: true,
      _count: { select: { notes: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  type R = typeof rows[number]
  const buckets = new Map<string, R[]>()
  for (const r of rows) {
    const key = `${r.agentProfileId}|${normName(`${r.clientFirstName} ${r.clientLastName}`)}|${r.policyType}`
    const arr = buckets.get(key) ?? []
    arr.push(r)
    buckets.set(key, arr)
  }

  const WINDOW_MS = 60 * 24 * 60 * 60 * 1000
  const pairs: DuplicatePairCandidate[] = []
  const seen = new Set<string>() // pair-id to avoid duplicates when N > 2 in a bucket

  for (const group of buckets.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (normCarrier(a.carrier) !== normCarrier(b.carrier)) continue
        if (Math.abs(a.applicationDate.getTime() - b.applicationDate.getTime()) > WINDOW_MS) continue

        // Keeper = older row (preserves note timeline + original id).
        const [keep, merge] = a.createdAt <= b.createdAt ? [a, b] : [b, a]
        const pairId = `${keep.id}::${merge.id}`
        if (seen.has(pairId)) continue
        seen.add(pairId)

        let confidence: DuplicatePairCandidate['confidence'] = 'low'
        let reason = ''

        const kpn = keep.policyNumber?.trim() || null
        const mpn = merge.policyNumber?.trim() || null
        const havePolicyNumberMatch = kpn != null && mpn != null && kpn === mpn
        // Two DIFFERENT non-null policy numbers is the carrier saying
        // "these are two separate policies." That is disqualifying
        // evidence: never auto-merge, even if name + points + carrier
        // all match (people buy two identical small IULs all the time,
        // and carriers issue sequential numbers). These surface as a
        // "distinct" bucket the admin can still merge manually after a
        // human confirms, but they are excluded from bulk merge.
        const haveDistinctPolicyNumbers = kpn != null && mpn != null && kpn !== mpn
        const exactlyOneTevah =
          (keep.tevahClientId != null) !== (merge.tevahClientId != null)
        const samePoints =
          keep.points != null && merge.points != null && Math.abs(keep.points - merge.points) < 0.5

        if (havePolicyNumberMatch) {
          // Same policy number on both rows = genuinely the same policy.
          confidence = 'high'
          reason = 'matching policy number'
        } else if (haveDistinctPolicyNumbers) {
          // Different policy numbers = carrier says these are separate.
          // Demote regardless of name/points so they never bulk-merge.
          confidence = 'distinct'
          reason = `different policy numbers (${kpn} vs ${mpn}) · likely two real policies, verify before merging`
        } else if (exactlyOneTevah) {
          // The original problem: one manual row (no policy #, no Tevah
          // id) and one Tevah row. Safe to collapse.
          confidence = 'high'
          reason = 'manual + Tevah pattern (one row has tevahClientId)'
        } else if (samePoints) {
          confidence = 'medium'
          reason = 'name + carrier + product + points match, no policy numbers to compare'
        } else {
          confidence = 'low'
          reason = 'name + carrier + product match, points differ'
        }

        const sideOf = (r: R): PairSide => ({
          id: r.id,
          clientFirstName: r.clientFirstName,
          clientLastName: r.clientLastName,
          carrier: r.carrier,
          policyType: r.policyType,
          status: r.status,
          points: r.points,
          policyNumber: r.policyNumber,
          applicationDate: r.applicationDate,
          createdAt: r.createdAt,
          tevahClientId: r.tevahClientId,
          notesCount: r._count.notes,
        })
        pairs.push({
          keepId: keep.id,
          mergeId: merge.id,
          agentProfileId: keep.agentProfileId,
          confidence,
          reason,
          keep: sideOf(keep),
          merge: sideOf(merge),
        })
      }
    }
  }

  // Sort: high confidence first, then medium, then low.
  const order = { high: 0, medium: 1, low: 2, distinct: 3 }
  pairs.sort((a, b) => order[a.confidence] - order[b.confidence])
  return pairs
}

// ─── Merge mechanics ───────────────────────────────────────────────

export interface MergeOptions {
  keepId: string
  mergeId: string
  dryRun?: boolean
}

export interface MergePreview {
  keepId: string
  mergeId: string
  applied: Record<string, { from: unknown; to: unknown }>
  movedChildren: {
    notes: number
    activity: number
    renewalReminders: number
    mutes: number
  }
}

// Merge two submissions in one transaction. The keeper retains its id
// and createdAt. The loser's authoritative fields are applied to the
// keeper (Tevah-sourced fields win when present), all child rows are
// re-pointed, then the loser is deleted. Returns a preview describing
// the changes; with dryRun:true, no DB writes happen.
export async function mergeSubmissions(opts: MergeOptions): Promise<MergePreview> {
  return db.$transaction(async tx => {
    const [keep, merge] = await Promise.all([
      tx.newBusinessSubmission.findUnique({ where: { id: opts.keepId } }),
      tx.newBusinessSubmission.findUnique({ where: { id: opts.mergeId } }),
    ])
    if (!keep || !merge) throw new Error('One or both submissions not found')
    if (keep.agentProfileId !== merge.agentProfileId) {
      throw new Error('Cannot merge across different writers')
    }
    if (keep.id === merge.id) throw new Error('Cannot merge a submission with itself')

    // Apply authoritative fields from merge → keep. Tevah-sourced fields
    // (when the merge row has tevahClientId) override; otherwise we
    // only fill nulls.
    const tevahWins = merge.tevahClientId != null && keep.tevahClientId == null
    const applied: Record<string, { from: unknown; to: unknown }> = {}
    const setField = <K extends keyof typeof keep>(
      key: K, newValue: typeof keep[K],
    ) => {
      if (keep[key] === newValue) return
      applied[String(key)] = { from: keep[key], to: newValue }
    }

    const newStatus = preferStatus(keep, merge)
    setField('status', newStatus)

    if (tevahWins) {
      setField('policyNumber', merge.policyNumber ?? keep.policyNumber)
      setField('issuedDate', merge.issuedDate ?? keep.issuedDate)
      setField('declinedReason', merge.declinedReason ?? keep.declinedReason)
      setField('tevahClientId', merge.tevahClientId ?? keep.tevahClientId)
    } else {
      if (keep.policyNumber == null && merge.policyNumber != null) setField('policyNumber', merge.policyNumber)
      if (keep.issuedDate == null && merge.issuedDate != null) setField('issuedDate', merge.issuedDate)
      if (keep.declinedReason == null && merge.declinedReason != null) setField('declinedReason', merge.declinedReason)
      if (keep.tevahClientId == null && merge.tevahClientId != null) setField('tevahClientId', merge.tevahClientId)
    }

    // points: take the larger of the two (defensive — premium underreporting is more common than overreporting).
    const maxPoints = Math.max(keep.points ?? 0, merge.points ?? 0) || null
    if (maxPoints !== keep.points) setField('points', maxPoints)

    // Fill-only fields (never overwrite a non-null on keep)
    const fillOnly: (keyof typeof keep)[] = [
      'clientPhone', 'clientEmail', 'clientBirthday',
      'clientAddressLine1', 'clientAddressLine2', 'clientCity', 'clientState', 'clientZip',
      'ownerFirstName', 'ownerLastName',
      'splitWithAgentId',
    ]
    for (const k of fillOnly) {
      if (keep[k] == null && merge[k] != null) setField(k, merge[k] as never)
    }

    // illustrationUrls: concat + dedupe
    const mergedIllustrations = Array.from(new Set([...(keep.illustrationUrls ?? []), ...(merge.illustrationUrls ?? [])]))
    if (mergedIllustrations.length !== keep.illustrationUrls.length) {
      setField('illustrationUrls', mergedIllustrations as never)
    }

    // Count child rows for the preview, regardless of dry-run.
    const [notesCount, activityCount, remindersCount, mutesCount] = await Promise.all([
      tx.newBusinessNote.count({ where: { submissionId: merge.id } }),
      tx.newBusinessSubmissionActivity.count({ where: { submissionId: merge.id } }),
      tx.renewalReminder.count({ where: { submissionId: merge.id } }),
      tx.newBusinessSubmissionMute.count({ where: { submissionId: merge.id } }),
    ])

    const movedChildren = {
      notes: notesCount,
      activity: activityCount,
      renewalReminders: remindersCount,
      mutes: mutesCount,
    }

    if (opts.dryRun) {
      return { keepId: keep.id, mergeId: merge.id, applied, movedChildren }
    }

    // Apply the field changes.
    if (Object.keys(applied).length > 0) {
      const data: Record<string, unknown> = {}
      for (const k of Object.keys(applied)) data[k] = applied[k].to
      await tx.newBusinessSubmission.update({ where: { id: keep.id }, data })
    }

    // Re-point child rows. RenewalReminder has a (submissionId, stage,
    // anniversaryYear) unique constraint, so we have to handle
    // collisions: if the keeper already has a reminder for the same
    // (stage, year), keep the keeper's (older) row and delete the
    // merge's. Same for mutes (unique on submissionId + agentProfileId).
    await tx.newBusinessNote.updateMany({
      where: { submissionId: merge.id },
      data: { submissionId: keep.id },
    })
    await tx.newBusinessSubmissionActivity.updateMany({
      where: { submissionId: merge.id },
      data: { submissionId: keep.id },
    })

    const mergeReminders = await tx.renewalReminder.findMany({
      where: { submissionId: merge.id },
      select: { id: true, stage: true, anniversaryYear: true },
    })
    const keepRemKeys = new Set(
      (await tx.renewalReminder.findMany({
        where: { submissionId: keep.id },
        select: { stage: true, anniversaryYear: true },
      })).map(r => `${r.stage}|${r.anniversaryYear}`),
    )
    for (const r of mergeReminders) {
      const k = `${r.stage}|${r.anniversaryYear}`
      if (keepRemKeys.has(k)) {
        await tx.renewalReminder.delete({ where: { id: r.id } })
      } else {
        await tx.renewalReminder.update({ where: { id: r.id }, data: { submissionId: keep.id } })
        keepRemKeys.add(k)
      }
    }

    const mergeMutes = await tx.newBusinessSubmissionMute.findMany({
      where: { submissionId: merge.id },
      select: { id: true, agentProfileId: true },
    })
    const keepMuteAgents = new Set(
      (await tx.newBusinessSubmissionMute.findMany({
        where: { submissionId: keep.id },
        select: { agentProfileId: true },
      })).map(m => m.agentProfileId),
    )
    for (const m of mergeMutes) {
      if (keepMuteAgents.has(m.agentProfileId)) {
        await tx.newBusinessSubmissionMute.delete({ where: { id: m.id } })
      } else {
        await tx.newBusinessSubmissionMute.update({ where: { id: m.id }, data: { submissionId: keep.id } })
        keepMuteAgents.add(m.agentProfileId)
      }
    }

    // Finally, delete the loser. Cascade handles any straggler children.
    await tx.newBusinessSubmission.delete({ where: { id: merge.id } })

    return { keepId: keep.id, mergeId: merge.id, applied, movedChildren }
  })
}
