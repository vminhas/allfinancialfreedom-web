import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { agentAuthOptions } from '@/lib/agent-auth'
import { db } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/settings'
import { PHASE_ITEMS } from '@/lib/agent-constants'

const PHASE_TITLES: Record<number, string> = {
  1: 'Agent',
  2: 'Associate',
  3: 'Certified Field Trainer',
  4: 'Marketing Director',
  5: 'Executive Marketing Director',
}

// Static checklist totals per phase. Used to compute "X / Y complete"
// for each team member without an extra DB query. If the checklist is
// later DB-driven we can swap this for a PhaseItemDefinition.count().
const PHASE_ITEM_TOTALS: Record<number, number> = {
  1: PHASE_ITEMS[1]?.length ?? 0,
  2: PHASE_ITEMS[2]?.length ?? 0,
  3: PHASE_ITEMS[3]?.length ?? 0,
  4: PHASE_ITEMS[4]?.length ?? 0,
  5: PHASE_ITEMS[5]?.length ?? 0,
}

// memberStatus distinguishes the three lifecycle states a referred agent
// passes through. The UI sorts ACTIVE → INVITED → PENDING and renders a
// status pill on each row.
//   ACTIVE  — accepted invite, password set, can log in
//   INVITED — admin approved the referral, welcome email sent, hasn't
//             activated the portal yet (agentUser.passwordHash is null)
//   PENDING — referral submitted by the agent, awaiting admin approval;
//             no AgentUser/AgentProfile row exists yet
type MemberStatus = 'ACTIVE' | 'INVITED' | 'PENDING'

// Per-phase progress block. Populated only for ACTIVE members (the
// upline is here to coach the people who already activated their portal,
// not to peek at INVITED agents who haven't logged in yet).
interface TeamProgress {
  phase: number             // current phase
  daysInPhase: number | null
  currentPhaseCompleted: number
  currentPhaseTotal: number
  // Per-phase completion across the whole tracker, so the upline can
  // see (e.g.) "Phase 1 done, halfway through Phase 2."
  perPhase: Array<{ phase: number; completed: number; total: number }>
  lastActivityAt: string | null   // ISO of most recent checklist completion
}

interface TeamNode {
  id: string
  agentUserId: string | null   // null for PENDING; needed for resend-invite
  referralId: string | null    // populated for PENDING/INVITED rows
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  title: string
  state: string | null
  avatarUrl: string | null
  memberStatus: MemberStatus
  progress: TeamProgress | null
  children: TeamNode[]
}

export async function GET(req: NextRequest) {
  let myAgentCode: string | null = null
  let myProfileId: string | null = null

  // Check for admin preview token
  const previewToken = new URL(req.url).searchParams.get('preview')
  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        const profile = await db.agentProfile.findUnique({
          where: { id: data.agentProfileId },
          select: { id: true, agentCode: true },
        })
        if (profile) { myAgentCode = profile.agentCode; myProfileId = profile.id }
      }
    }
  }

  // Fall back to agent session
  if (!myAgentCode) {
    const session = await getServerSession(agentAuthOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const me = await db.agentProfile.findFirst({
      where: { agentUser: { email: session.user.email! } },
      select: { id: true, agentCode: true },
    })
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    myAgentCode = me.agentCode
    myProfileId = me.id
  }

  const allAgents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      phase: true,
      phaseStartedAt: true,
      state: true,
      avatarUrl: true,
      recruiterId: true,
      // passwordHash drives the ACTIVE vs INVITED distinction. If null,
      // the agent was approved + emailed but never set their password.
      agentUser: { select: { id: true, passwordHash: true } },
    },
  })

  // Bulk-fetch completed phase items for everyone in one query. This is
  // a small table per agent (~30 items × team size) so this scales
  // comfortably to a few hundred agents before we'd want to paginate.
  const allCompleted = await db.phaseItem.findMany({
    where: {
      agentProfileId: { in: allAgents.map(a => a.id) },
      completed: true,
    },
    select: { agentProfileId: true, phase: true, completedAt: true },
  })

  // agentProfileId → { phase → completedCount, lastActivityAt }
  const progressByAgent = new Map<string, { perPhase: Map<number, number>; lastActivityAt: Date | null }>()
  for (const item of allCompleted) {
    let entry = progressByAgent.get(item.agentProfileId)
    if (!entry) {
      entry = { perPhase: new Map(), lastActivityAt: null }
      progressByAgent.set(item.agentProfileId, entry)
    }
    entry.perPhase.set(item.phase, (entry.perPhase.get(item.phase) ?? 0) + 1)
    if (item.completedAt && (!entry.lastActivityAt || item.completedAt > entry.lastActivityAt)) {
      entry.lastActivityAt = item.completedAt
    }
  }

  const childrenOf = new Map<string, typeof allAgents>()
  for (const a of allAgents) {
    if (a.recruiterId) {
      const arr = childrenOf.get(a.recruiterId) ?? []
      arr.push(a)
      childrenOf.set(a.recruiterId, arr)
    }
  }

  function computeProgress(a: typeof allAgents[0]): TeamProgress {
    const entry = progressByAgent.get(a.id)
    const perPhase = [1, 2, 3, 4, 5].map(p => ({
      phase: p,
      completed: entry?.perPhase.get(p) ?? 0,
      total: PHASE_ITEM_TOTALS[p] ?? 0,
    }))
    const current = perPhase.find(p => p.phase === a.phase) ?? { completed: 0, total: 0 }
    const daysInPhase = a.phaseStartedAt
      ? Math.max(0, Math.floor((Date.now() - a.phaseStartedAt.getTime()) / 86_400_000))
      : null
    return {
      phase: a.phase,
      daysInPhase,
      currentPhaseCompleted: current.completed,
      currentPhaseTotal: current.total,
      perPhase,
      lastActivityAt: entry?.lastActivityAt?.toISOString() ?? null,
    }
  }

  function buildNode(a: typeof allAgents[0]): TeamNode {
    const kids = childrenOf.get(a.agentCode) ?? []
    const memberStatus: MemberStatus = a.agentUser?.passwordHash ? 'ACTIVE' : 'INVITED'
    return {
      id: a.id,
      agentUserId: a.agentUser?.id ?? null,
      referralId: null,
      agentCode: a.agentCode,
      firstName: a.firstName,
      lastName: a.lastName,
      phase: a.phase,
      title: PHASE_TITLES[a.phase] ?? `Phase ${a.phase}`,
      state: a.state,
      avatarUrl: a.avatarUrl,
      memberStatus,
      // Only ACTIVE members get progress — INVITED agents haven't logged
      // in to start their checklist, so the numbers would all be zero
      // and would visually clutter the row with nothing actionable.
      progress: memberStatus === 'ACTIVE' ? computeProgress(a) : null,
      children: kids.map(buildNode),
    }
  }

  const myRecruits = childrenOf.get(myAgentCode) ?? []
  const directNodes = myRecruits.map(buildNode)

  // Pending referrals: submitted by this agent, not yet approved by admin.
  // No AgentProfile/AgentUser exists yet, so these become synthetic top-
  // level nodes with no children and no portal-actionable links.
  const pendingReferrals = myProfileId
    ? await db.agentReferral.findMany({
        where: { referringAgentId: myProfileId, status: 'PENDING' },
        select: { id: true, firstName: true, lastName: true, state: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : []

  const pendingNodes: TeamNode[] = pendingReferrals.map(r => ({
    id: `pending-${r.id}`,
    agentUserId: null,
    referralId: r.id,
    agentCode: '',
    firstName: r.firstName,
    lastName: r.lastName,
    phase: 0,
    title: 'Pending Review',
    state: r.state,
    avatarUrl: null,
    memberStatus: 'PENDING',
    progress: null,
    children: [],
  }))

  // Sort top-level: ACTIVE → INVITED → PENDING. Children stay in their
  // existing tree order (they're always ACTIVE — nobody can recruit while
  // their own profile is still inactive).
  const STATUS_ORDER: Record<MemberStatus, number> = { ACTIVE: 0, INVITED: 1, PENDING: 2 }
  const team: TeamNode[] = [...directNodes, ...pendingNodes].sort(
    (a, b) => STATUS_ORDER[a.memberStatus] - STATUS_ORDER[b.memberStatus]
  )

  // Count stats — totalTeamSize counts every node regardless of status so
  // the agent sees the size of their pipeline; activeTeamSize is the
  // already-onboarded subset.
  let totalTeamSize = 0
  let activeTeamSize = 0
  function count(nodes: TeamNode[]) {
    for (const n of nodes) {
      totalTeamSize++
      if (n.memberStatus === 'ACTIVE') activeTeamSize++
      count(n.children)
    }
  }
  count(team)

  return NextResponse.json({ team, totalTeamSize, activeTeamSize })
}
