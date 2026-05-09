import { db } from './db'
import type { ClimbMilestone, AgentProfile } from '@/generated/prisma/client'

// ─── Lifetime points ──────────────────────────────────────────────────────────
//
// Points are summed live from NewBusinessSubmission rows — the same source
// of truth the leaderboard uses (src/app/api/agents/leaderboard/production
// /route.ts pointsValues()) but with no time filter. AFF's split-credit
// rule applies: a split-partner submission credits BOTH agents the full
// point value. Mirrors the existing leaderboard math; do not duplicate.

export async function lifetimePointsForAgent(agentProfileId: string): Promise<number> {
  const subs = await db.newBusinessSubmission.findMany({
    where: {
      OR: [
        { agentProfileId },
        { splitWithAgentId: agentProfileId },
      ],
    },
    select: { agentProfileId: true, splitWithAgentId: true, points: true },
  })
  let total = 0
  for (const s of subs) {
    const pts = s.points ?? 0
    if (s.agentProfileId === agentProfileId) total += pts
    if (s.splitWithAgentId === agentProfileId && s.agentProfileId !== agentProfileId) total += pts
  }
  return Math.round(total)
}

// Batched: sum lifetime points for every active agent in one pass.
// Used by the admin recompute-all sweep so we don't N+1 the database.
export async function lifetimePointsForAllAgents(): Promise<Map<string, number>> {
  const subs = await db.newBusinessSubmission.findMany({
    select: { agentProfileId: true, splitWithAgentId: true, points: true },
  })
  const m = new Map<string, number>()
  for (const s of subs) {
    const pts = s.points ?? 0
    if (s.agentProfileId) m.set(s.agentProfileId, (m.get(s.agentProfileId) ?? 0) + pts)
    if (s.splitWithAgentId && s.splitWithAgentId !== s.agentProfileId) {
      m.set(s.splitWithAgentId, (m.get(s.splitWithAgentId) ?? 0) + pts)
    }
  }
  // Round to whole points for stable threshold comparisons.
  for (const [k, v] of m) m.set(k, Math.round(v))
  return m
}

// ─── Recompute orchestrator ───────────────────────────────────────────────────
//
// Called after any event that could change an agent's lifetime points
// (new policy logged, points edited, split partner added). Idempotent —
// running it twice is a no-op because ClimbAchievement has a unique
// (agentProfileId, milestoneId) constraint.
//
// Returns the list of NEW achievements awarded by this call so the
// caller can drive client-side celebration UX (confetti on next page
// load, push notification, whatever).

export interface NewAchievement {
  milestoneId: string
  milestone: ClimbMilestone
  pointsAtAchievement: number
}

export async function recomputeClimbAchievements(
  agentProfileId: string,
  options: { skipRewardSideEffects?: boolean } = {}
): Promise<NewAchievement[]> {
  const total = await lifetimePointsForAgent(agentProfileId)

  const [achieved, milestones] = await Promise.all([
    db.climbAchievement.findMany({
      where: { agentProfileId },
      select: { milestoneId: true },
    }),
    db.climbMilestone.findMany({
      where: { active: true, pointThreshold: { lte: total } },
      orderBy: { pointThreshold: 'asc' },
    }),
  ])

  const achievedSet = new Set(achieved.map(a => a.milestoneId))
  const toAward = milestones.filter(m => !achievedSet.has(m.id))
  if (toAward.length === 0) return []

  const newAchievements: NewAchievement[] = []
  for (const m of toAward) {
    // Use upsert so a concurrent recompute can't double-insert. The
    // unique index on (agentProfileId, milestoneId) is the safety net.
    await db.climbAchievement.upsert({
      where: {
        agentProfileId_milestoneId: { agentProfileId, milestoneId: m.id },
      },
      update: {},
      create: {
        agentProfileId,
        milestoneId: m.id,
        pointsAtAchievement: total,
      },
    })
    newAchievements.push({ milestoneId: m.id, milestone: m, pointsAtAchievement: total })
  }

  if (options.skipRewardSideEffects) return newAchievements

  // Apply each reward type. Side-effects are non-blocking by design:
  // an outage in the Discord API or Anthropic API should not stop the
  // achievement from being recorded. The achievement row IS the
  // source of truth; reward delivery is best-effort.
  for (const a of newAchievements) {
    void applyRewardSideEffect(agentProfileId, a.milestone, a.pointsAtAchievement)
  }

  return newAchievements
}

// Side-effect dispatcher. Imported lazily to keep the module tree
// from pulling Anthropic + Discord helpers into every module that
// just wants to compute totals.
async function applyRewardSideEffect(
  agentProfileId: string,
  milestone: ClimbMilestone,
  pointsAtAchievement: number,
): Promise<void> {
  try {
    // Test accounts must never trigger external side-effects:
    // no Discord posts, no DMs, no role grants, no AI article spend.
    // The achievement row is still recorded so QA can verify the
    // logic ran; everything user-visible is suppressed.
    const profile = await db.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { isTest: true },
    })
    if (profile?.isTest) {
      return
    }

    switch (milestone.rewardType) {
      case 'BADGE': {
        const payload = (milestone.rewardPayload ?? {}) as { key?: string; discordRoleId?: string }
        if (!payload.key) break
        const profile = await db.agentProfile.findUnique({
          where: { id: agentProfileId },
          select: { badges: true, discordUserId: true },
        })
        if (!profile) break
        if (!profile.badges.includes(payload.key)) {
          await db.agentProfile.update({
            where: { id: agentProfileId },
            data: { badges: { set: [...profile.badges, payload.key] } },
          })
        }
        // Discord role tied to the badge: makes the recognition
        // visible inside Discord (member list, chat color), not just
        // in the agent portal. Optional per-milestone via
        // rewardPayload.discordRoleId.
        if (payload.discordRoleId && profile.discordUserId) {
          const { assignDiscordRole } = await import('./discord-roles')
          await assignDiscordRole(profile.discordUserId, payload.discordRoleId)
        }
        // Badge rewards also get a Discord callout for visibility.
        const { celebrateClimbAchievement } = await import('./climb-celebrate')
        await celebrateClimbAchievement(agentProfileId, milestone, pointsAtAchievement)
        break
      }
      case 'DISCORD_CALLOUT': {
        const { celebrateClimbAchievement } = await import('./climb-celebrate')
        await celebrateClimbAchievement(agentProfileId, milestone, pointsAtAchievement)
        break
      }
      case 'ARTICLE': {
        const { generateClimbArticle } = await import('./climb-article')
        await generateClimbArticle(agentProfileId, milestone, pointsAtAchievement)
        // Articles also Discord-announce so the team sees the moment.
        const { celebrateClimbAchievement } = await import('./climb-celebrate')
        await celebrateClimbAchievement(agentProfileId, milestone, pointsAtAchievement)
        break
      }
      case 'CUSTOM': {
        // Custom rewards (e.g. "AFF jacket") are admin-fulfilled. We
        // still post to Discord so the agent and team see the moment.
        const { celebrateClimbAchievement } = await import('./climb-celebrate')
        await celebrateClimbAchievement(agentProfileId, milestone, pointsAtAchievement)
        break
      }
    }
  } catch (err) {
    console.error('[climb] reward side-effect failed:', { milestoneId: milestone.id, agentProfileId, err })
  }
}

// ─── Helper: agent context for article + Discord copy ────────────────────────

export type AgentClimbContext = Pick<AgentProfile, 'id' | 'firstName' | 'lastName' | 'agentCode' | 'phase' | 'discordUserId'>

export async function getAgentClimbContext(agentProfileId: string): Promise<AgentClimbContext | null> {
  return db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { id: true, firstName: true, lastName: true, agentCode: true, phase: true, discordUserId: true },
  })
}
