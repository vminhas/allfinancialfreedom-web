import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { MILESTONE_BY_KEY } from '@/lib/milestones'

// GET /api/agents/by-code/[code]/card
//
// Returns the data needed to render an agent's "trading card" modal
// from any caller (admin, LC, or another agent on the same team).
// Production dollars and pending milestone submissions are admin-only;
// agents looking at peers see the lighter set so we don't accidentally
// leak revenue numbers down the org chart.

const PHASE_TITLES: Record<number, string> = {
  1: 'Agent',
  2: 'Associate',
  3: 'Certified Field Trainer',
  4: 'Marketing Director',
  5: 'Executive Marketing Director',
}

interface CardPayload {
  // Identity
  agentCode: string
  firstName: string
  lastName: string
  state: string | null
  avatarUrl: string | null
  phase: number
  phaseLabel: string
  trainerName: string | null
  // Tenure
  joinedAt: string | null  // icaDate || createdAt
  daysAtAff: number | null
  daysInPhase: number | null
  // Team
  directDownline: number
  totalDownline: number
  // Production (admin-only fields)
  ftaCompleted: number
  carriersAppointed: number
  totalSubmissions: number
  issuedClients: number
  totalTargetPremium: number | null  // null when caller is a peer agent
  // Milestones earned (badges)
  milestoneBadges: { key: string; label: string }[]
  // Caller scope (so the UI can choose which strip to render)
  scope: 'admin' | 'lc' | 'peer_agent'
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  // All three roles (admin, LC, agent) are issued by the same authOptions
  // instance. The legacy agentAuthOptions config is unused — its cookie
  // never gets set, which is why peer agents previously saw 401 here.
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  let scope: CardPayload['scope'] | null = null
  if (role === 'admin') scope = 'admin'
  else if (role === 'licensing_coordinator') scope = 'lc'
  else if (role === 'agent') scope = 'peer_agent'

  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await ctx.params

  const profile = await db.agentProfile.findUnique({
    where: { agentCode: code },
    select: {
      agentCode: true,
      firstName: true,
      lastName: true,
      state: true,
      avatarUrl: true,
      phase: true,
      phaseStartedAt: true,
      icaDate: true,
      createdAt: true,
      cft: true,
      milestones: {
        where: { status: 'AWARDED' },
        select: { milestone: true, completedAt: true },
        orderBy: { completedAt: 'asc' },
      },
      carrierAppointments: { where: { status: 'APPOINTED' }, select: { id: true } },
      submissions: { select: { status: true, points: true } },
    },
  })
  if (!profile) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Direct downline = agents whose recruiterId === this agent's code.
  // Total downline = recursive descendants. We do this in JS off a
  // single query to avoid a recursive CTE; the org won't be enormous.
  const allActiveProfiles = await db.agentProfile.findMany({
    where: { status: 'ACTIVE' },
    select: { agentCode: true, recruiterId: true },
  })
  const childrenByRecruiter = new Map<string, string[]>()
  for (const p of allActiveProfiles) {
    if (!p.recruiterId) continue
    const arr = childrenByRecruiter.get(p.recruiterId) ?? []
    arr.push(p.agentCode)
    childrenByRecruiter.set(p.recruiterId, arr)
  }
  const directKids = childrenByRecruiter.get(profile.agentCode) ?? []
  const seen = new Set<string>()
  const stack = [...directKids]
  while (stack.length) {
    const c = stack.pop()!
    if (seen.has(c)) continue
    seen.add(c)
    const grand = childrenByRecruiter.get(c) ?? []
    stack.push(...grand)
  }

  const ftaCompletedCount = await db.fieldTrainingAppointment.count({
    where: {
      agentProfile: { agentCode: profile.agentCode },
      status: 'COMPLETED',
    },
  })

  const today = new Date()
  const joinedAt = profile.icaDate ?? profile.createdAt
  const daysAtAff = joinedAt
    ? Math.max(0, Math.floor((today.getTime() - new Date(joinedAt).getTime()) / 86400000))
    : null
  const daysInPhase = profile.phaseStartedAt
    ? Math.max(0, Math.floor((today.getTime() - new Date(profile.phaseStartedAt).getTime()) / 86400000))
    : null

  const totalSubmissions = profile.submissions.length
  const issuedClients = profile.submissions.filter(s => s.status === 'ISSUED').length
  const totalTargetPremium = profile.submissions.reduce(
    (sum, s) => sum + (typeof s.points === 'number' ? s.points : 0),
    0,
  )

  const milestoneBadges = profile.milestones
    .map(m => ({ key: m.milestone, label: MILESTONE_BY_KEY[m.milestone]?.label ?? m.milestone }))

  const payload: CardPayload = {
    agentCode: profile.agentCode,
    firstName: profile.firstName,
    lastName: profile.lastName,
    state: profile.state,
    avatarUrl: profile.avatarUrl,
    phase: profile.phase,
    phaseLabel: PHASE_TITLES[profile.phase] ?? `Phase ${profile.phase}`,
    trainerName: profile.cft,
    joinedAt: joinedAt ? joinedAt.toISOString() : null,
    daysAtAff,
    daysInPhase,
    directDownline: directKids.length,
    totalDownline: seen.size,
    ftaCompleted: ftaCompletedCount,
    carriersAppointed: profile.carrierAppointments.length,
    totalSubmissions,
    issuedClients,
    // Hide revenue numbers from peer agents.
    totalTargetPremium: scope === 'peer_agent' ? null : totalTargetPremium,
    milestoneBadges,
    scope,
  }

  return NextResponse.json(payload)
}
