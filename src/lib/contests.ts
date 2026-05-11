// Contest computation. Eligibility, window resolution, and
// requirement evaluation all live here. Per-agent state is computed
// on demand from existing data; only MANUAL checks persist a row.

import { db } from './db'
import type { Contest, ContestRequirement, AgentProfile, ContestAnchor } from '@/generated/prisma/client'

export interface RequirementStatus {
  requirementId: string
  label: string
  type: ContestRequirement['type']
  completed: boolean
  // Numeric requirements (RECRUITS / POLICIES) report progress:
  current?: number
  target?: number
}

export interface AgentContestStatus {
  contestId: string
  title: string
  description: string | null
  rewardAmount: number | null
  rewardLabel: string | null
  startsAt: Date
  endsAt: Date
  // Convenience derivations:
  daysRemaining: number
  millisRemaining: number
  expired: boolean
  notStartedYet: boolean
  // Requirement breakdown:
  requirements: RequirementStatus[]
  completedCount: number
  totalCount: number
  qualified: boolean
}

// Returns the [start, end] window for an agent in this contest.
// Anchor types ICA_DATE / ONBOARDING / PHASE_START anchor on a
// per-agent column + durationDays. FIXED uses contest-wide dates.
// Returns null when the agent doesn't have the anchor field set
// (e.g. no icaDate yet) — agent isn't eligible until they do.
export function resolveWindow(
  contest: Pick<Contest, 'anchor' | 'durationDays' | 'fixedStartAt' | 'fixedEndAt'>,
  profile: Pick<AgentProfile, 'icaDate' | 'createdAt' | 'phaseStartedAt'>,
): { start: Date; end: Date } | null {
  if (contest.anchor === 'FIXED') {
    if (!contest.fixedStartAt || !contest.fixedEndAt) return null
    return { start: contest.fixedStartAt, end: contest.fixedEndAt }
  }
  if (!contest.durationDays) return null
  const anchorDate = anchorDateFor(contest.anchor, profile)
  if (!anchorDate) return null
  const end = new Date(anchorDate)
  end.setDate(end.getDate() + contest.durationDays)
  return { start: anchorDate, end }
}

function anchorDateFor(anchor: ContestAnchor, p: Pick<AgentProfile, 'icaDate' | 'createdAt' | 'phaseStartedAt'>): Date | null {
  switch (anchor) {
    case 'ICA_DATE':    return p.icaDate ?? null
    case 'ONBOARDING':  return p.createdAt ?? null
    case 'PHASE_START': return p.phaseStartedAt ?? null
    default:            return null
  }
}

// Eligibility filter: contest's eligibleFromAt/eligibleToAt cutoffs
// are evaluated against the agent's anchor date. Lets you scope a
// contest to "agents whose ICA falls in 2026 H1" without affecting
// older or newer cohorts.
export function isEligible(
  contest: Pick<Contest, 'anchor' | 'eligibleFromAt' | 'eligibleToAt'>,
  profile: Pick<AgentProfile, 'icaDate' | 'createdAt' | 'phaseStartedAt'>,
): boolean {
  const anchorDate = anchorDateFor(contest.anchor, profile)
  if (!anchorDate) return contest.anchor === 'FIXED'
  if (contest.eligibleFromAt && anchorDate < contest.eligibleFromAt) return false
  if (contest.eligibleToAt && anchorDate > contest.eligibleToAt) return false
  return true
}

// Evaluate a single requirement against an agent. Pulls the supporting
// data from the right table per requirement type. Window-bounded
// (e.g. RECRUITS counts only business_partners created in the
// contest window, not historical totals).
export async function evaluateRequirement(
  req: ContestRequirement,
  agentProfileId: string,
  window: { start: Date; end: Date },
): Promise<RequirementStatus> {
  const base = { requirementId: req.id, label: req.label, type: req.type }

  switch (req.type) {
    case 'PHASE_ITEM': {
      if (!req.phaseItemKey) return { ...base, completed: false }
      const item = await db.phaseItem.findFirst({
        where: { agentProfileId, itemKey: req.phaseItemKey, completed: true },
        select: { completedAt: true },
      })
      // Phase items can be completed any time (even before window
      // start) — we count any completed flag as satisfied. Most
      // contests only care that the work is done, not when.
      return { ...base, completed: !!item }
    }
    case 'MILESTONE': {
      if (!req.milestoneKey) return { ...base, completed: false }
      const m = await db.recognitionMilestone.findFirst({
        where: { agentProfileId, milestone: req.milestoneKey, status: 'AWARDED' },
        select: { id: true },
      })
      return { ...base, completed: !!m }
    }
    case 'RECRUITS': {
      const target = req.count ?? 1
      const count = await db.businessPartner.count({
        where: {
          agentProfileId,
          category: 'PROSPECT_AGENT',
          createdAt: { gte: window.start, lte: window.end },
        },
      })
      return { ...base, current: count, target, completed: count >= target }
    }
    case 'POLICIES': {
      const target = req.count ?? 1
      const count = await db.newBusinessSubmission.count({
        where: {
          agentProfileId,
          applicationDate: { gte: window.start, lte: window.end },
        },
      })
      return { ...base, current: count, target, completed: count >= target }
    }
    case 'MANUAL': {
      const check = await db.contestManualCheck.findUnique({
        where: { requirementId_agentProfileId: { requirementId: req.id, agentProfileId } },
        select: { completed: true },
      })
      // No explicit check row → fall back to the requirement's
      // defaultCompleted flag. Lets admins mark a requirement as
      // 'implicitly true for everyone' (e.g. 'Get GFI Code' for any
      // portal user) without having to bulk-tick every future joiner.
      const completed = check?.completed ?? req.defaultCompleted ?? false
      return { ...base, completed }
    }
    case 'CUSTOM_TEXT': {
      // Display-only. Never auto-completes.
      return { ...base, completed: false }
    }
  }
}

// Full per-agent contest status. Pulls active contests, eligibility-
// filters, evaluates each requirement, and returns ready-to-render
// rows. Heavy on DB queries when there are many contests + many
// requirements; in practice <5 contests x <8 requirements is fine.
export async function getAgentContestStatuses(agentProfileId: string): Promise<AgentContestStatus[]> {
  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { icaDate: true, createdAt: true, phaseStartedAt: true },
  })
  if (!profile) return []

  const contests = await db.contest.findMany({
    where: { active: true },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })

  const out: AgentContestStatus[] = []
  const now = Date.now()
  for (const c of contests) {
    if (!isEligible(c, profile)) continue
    const window = resolveWindow(c, profile)
    if (!window) continue
    const requirements = await Promise.all(
      c.requirements.map(r => evaluateRequirement(r, agentProfileId, window))
    )
    const completedCount = requirements.filter(r => r.completed).length
    const totalCount = requirements.length
    out.push({
      contestId: c.id,
      title: c.title,
      description: c.description,
      rewardAmount: c.rewardAmount,
      rewardLabel: c.rewardLabel,
      startsAt: window.start,
      endsAt: window.end,
      daysRemaining: Math.max(0, Math.ceil((window.end.getTime() - now) / (1000 * 60 * 60 * 24))),
      millisRemaining: Math.max(0, window.end.getTime() - now),
      expired: now > window.end.getTime(),
      notStartedYet: now < window.start.getTime(),
      requirements,
      completedCount,
      totalCount,
      qualified: completedCount === totalCount && totalCount > 0,
    })
  }
  // Sort: active in-window first by days-remaining ascending; then
  // not-yet-started; then expired.
  out.sort((a, b) => {
    const score = (s: AgentContestStatus) =>
      s.expired ? 2 : s.notStartedYet ? 1 : 0
    const sa = score(a), sb = score(b)
    if (sa !== sb) return sa - sb
    return a.daysRemaining - b.daysRemaining
  })
  return out
}

// Admin view: per-contest, list every eligible agent's status. Used
// for the at-risk Discord post generator and the participation
// matrix on /vault/contests.
export async function getContestParticipants(contestId: string): Promise<Array<{
  agentProfileId: string
  firstName: string
  lastName: string
  agentCode: string
  startsAt: Date
  endsAt: Date
  daysRemaining: number
  expired: boolean
  completedCount: number
  totalCount: number
  qualified: boolean
}>> {
  const contest = await db.contest.findUnique({
    where: { id: contestId },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })
  if (!contest || !contest.active) return []

  // Pull every active agent + relevant anchor field; we filter
  // eligibility in memory.
  const profiles = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: {
      id: true, firstName: true, lastName: true, agentCode: true,
      icaDate: true, createdAt: true, phaseStartedAt: true,
    },
  })

  const now = Date.now()
  const rows: Awaited<ReturnType<typeof getContestParticipants>> = []
  for (const p of profiles) {
    if (!isEligible(contest, p)) continue
    const window = resolveWindow(contest, p)
    if (!window) continue
    const requirements = await Promise.all(
      contest.requirements.map(r => evaluateRequirement(r, p.id, window))
    )
    const completedCount = requirements.filter(r => r.completed).length
    rows.push({
      agentProfileId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      agentCode: p.agentCode,
      startsAt: window.start,
      endsAt: window.end,
      daysRemaining: Math.max(0, Math.ceil((window.end.getTime() - now) / (1000 * 60 * 60 * 24))),
      expired: now > window.end.getTime(),
      completedCount,
      totalCount: contest.requirements.length,
      qualified: completedCount === contest.requirements.length && contest.requirements.length > 0,
    })
  }
  return rows
}
