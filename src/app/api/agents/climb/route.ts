import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { lifetimePointsForAgent, recomputeClimbAchievements } from '@/lib/climb-points'
import { getSetting } from '@/lib/settings'
import { getAgentProfileIdFromEmail } from '@/lib/agent-identity'

// GET /api/agents/climb
//
// Returns everything the agent's Climb tab needs:
//   - their lifetime point total
//   - all active milestones (so the track can render)
//   - their achievement records (which markers are 'earned' + when)
//   - their AI-generated articles (for the marquee reward display)
//   - the org-wide recent activity ticker (last 10 achievements
//     across the whole company, anonymized to first name + agentCode)
//
// Supports the same admin-preview flow as /api/agents/me — admin
// passes ?preview=<token> and we resolve to the previewed agent.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const previewToken = url.searchParams.get('preview')

  let agentProfileId: string | null = null

  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        agentProfileId = data.agentProfileId
      }
    }
  }

  if (!agentProfileId) {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string } | undefined)?.role
    if (!session || role !== 'agent') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const email = session.user!.email
    if (typeof email !== 'string') {
      return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
    }
    const profileId = await getAgentProfileIdFromEmail(email)
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    agentProfileId = profileId
  }

  // Self-heal for legacy agents whose ClimbAchievement rows pre-date
  // the recompute hook in /api/agents/new-business. Without this an
  // agent with 115K lifetime points would still see "Starting Out"
  // because their earned milestones were never written. Cheap to run
  // (single COUNT + a SELECT of milestones lte points), and it's a
  // no-op for anyone already up to date. Skip rewards side-effects
  // here so we don't surprise an agent with a wave of Discord pings
  // for milestones they earned months ago.
  const existingCount = await db.climbAchievement.count({ where: { agentProfileId } })
  if (existingCount === 0) {
    const points = await lifetimePointsForAgent(agentProfileId)
    if (points > 0) {
      await recomputeClimbAchievements(agentProfileId, { skipRewardSideEffects: true })
        .catch(() => {})
    }
  }

  const [milestones, achievements, articles, recentActivity, totalPoints] = await Promise.all([
    db.climbMilestone.findMany({
      where: { active: true },
      orderBy: { pointThreshold: 'asc' },
    }),
    db.climbAchievement.findMany({
      where: { agentProfileId },
      orderBy: { achievedAt: 'asc' },
    }),
    // Only published articles surface on the agent portal. Drafts
    // sit in the vault review queue until an admin signs off; the
    // agent never sees the AI's first pass directly.
    db.agentArticle.findMany({
      where: { agentProfileId, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, milestoneId: true, title: true, body: true, generatedAt: true, publishedAt: true },
    }),
    // Org-wide ticker: last 10 achievements across all active agents.
    // Excludes test agents and the requesting agent's own (the agent
    // sees their own as the main UI; the ticker is for FOMO, not
    // self-reflection).
    db.climbAchievement.findMany({
      where: {
        NOT: { agentProfileId },
        agentProfile: { isTest: false, status: 'ACTIVE' },
      },
      orderBy: { achievedAt: 'desc' },
      take: 10,
      include: {
        agentProfile: { select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true } },
        milestone: { select: { title: true, pointThreshold: true, accentColor: true } },
      },
    }),
    lifetimePointsForAgent(agentProfileId),
  ])

  return NextResponse.json({
    totalPoints,
    milestones,
    achievements,
    articles,
    recentActivity: recentActivity.map(a => ({
      id: a.id,
      achievedAt: a.achievedAt,
      agentFirstName: a.agentProfile.firstName,
      agentLastName: a.agentProfile.lastName,
      agentCode: a.agentProfile.agentCode,
      avatarUrl: a.agentProfile.avatarUrl,
      milestoneTitle: a.milestone.title,
      pointThreshold: a.milestone.pointThreshold,
      accentColor: a.milestone.accentColor,
    })),
  })
}
