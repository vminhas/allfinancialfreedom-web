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

// Label for the agent's current FOCUS PHASE (onboarding / field
// training / CFT / MD focus / EMD focus / NVP focus). This is NOT
// the rank title -- rank is now resolved from completed promotion
// items via @/lib/agent-title and surfaced separately on the card.
const PHASE_TITLES: Record<number, string> = {
  1: 'Onboarding',
  2: 'Field Training',
  3: 'CFT',
  4: 'MD Focus',
  5: 'EMD Focus',
  6: 'NVP Focus',
}

interface CardPayload {
  // Identity. firstName/lastName are the legal name on file; the
  // trading card UI renders preferredName (when set) in place of
  // firstName so cards match what teammates see on Discord and the
  // leaderboard.
  agentCode: string
  firstName: string
  lastName: string
  preferredName: string | null
  state: string | null
  avatarUrl: string | null
  phase: number
  phaseLabel: string
  trainerName: string | null
  // Contact (admin/lc only -- peer agents don't see other agents' phone)
  phone: string | null
  email: string | null
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
  // Regulatory identifiers — safe to surface to all card scopes
  // (public via NIPR). Pulled up on the card so the agent can copy
  // them when filling out applications without bouncing to /agents
  // profile editor each time.
  npn: string | null
  licenseNumber: string | null
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
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      state: true,
      avatarUrl: true,
      phase: true,
      phaseStartedAt: true,
      icaDate: true,
      createdAt: true,
      cft: true,
      phone: true,
      // Mercedes (D2161) flagged: agents need quick NPN + license-number
      // lookup when filling out applications, especially right after
      // they get licensed and don't have it memorized. Surface both on
      // the trading card so it's one click from their dashboard.
      npn: true,
      licenseNumber: true,
      agentUser: { select: { email: true } },
      milestones: {
        where: { status: 'AWARDED' },
        select: { milestone: true, completedAt: true },
        orderBy: { completedAt: 'asc' },
      },
      carrierAppointments: { where: { status: 'APPOINTED' }, select: { id: true } },
      submissions: { select: { id: true, status: true, points: true, splitWithAgentId: true } },
    },
  })
  if (!profile) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Fetch submissions where this agent is the split partner (not the writer).
  // These don't appear in profile.submissions (which is writer-only).
  const splitPartnerSubs = await db.newBusinessSubmission.findMany({
    where: { splitWithAgentId: profile.id },
    select: { id: true, status: true, points: true },
  })

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

  // Combine writer submissions + split-partner submissions for accurate totals.
  // Split submissions give each agent half the points.
  const allSubs = [
    ...profile.submissions.map(s => ({
      status: s.status,
      points: s.splitWithAgentId ? (s.points ?? 0) / 2 : (s.points ?? 0),
    })),
    ...splitPartnerSubs.map(s => ({
      status: s.status,
      points: (s.points ?? 0) / 2,
    })),
  ]

  const totalSubmissions = allSubs.length
  const issuedClients = allSubs.filter(s => s.status === 'ISSUED').length
  const totalTargetPremium = allSubs.reduce((sum, s) => sum + s.points, 0)

  const milestoneBadges = profile.milestones
    .map(m => ({ key: m.milestone, label: MILESTONE_BY_KEY[m.milestone]?.label ?? m.milestone }))

  const payload: CardPayload = {
    agentCode: profile.agentCode,
    firstName: profile.firstName,
    lastName: profile.lastName,
    preferredName: profile.preferredName,
    state: profile.state,
    avatarUrl: profile.avatarUrl,
    phase: profile.phase,
    phaseLabel: PHASE_TITLES[profile.phase] ?? 'Onboarding',
    trainerName: profile.cft,
    // Phone + email leak agents' personal contact info, so we only
    // surface them to admin/lc -- peer agents looking at teammates
    // should DM them instead.
    phone: scope === 'peer_agent' ? null : profile.phone,
    email: scope === 'peer_agent' ? null : (profile.agentUser?.email ?? null),
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
    // NPN + license number are public regulatory identifiers (lookable
    // in NIPR), so safe to surface to all card-viewing scopes.
    npn: profile.npn,
    licenseNumber: profile.licenseNumber,
    milestoneBadges,
    scope,
  }

  return NextResponse.json(payload)
}
