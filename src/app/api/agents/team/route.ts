import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/settings'
import { PHASE_ITEMS } from '@/lib/agent-constants'
import { resolveAgentTitle } from '@/lib/agent-title'
import { loadTrainerContext, findTraineeProfiles } from '@/lib/trainer-trainees'

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

// memberStatus distinguishes lifecycle states a referred agent passes
// through. The UI sorts ACTIVE → INVITED → PENDING → INACTIVE and renders
// a status pill on each row.
//   ACTIVE   — accepted invite, password set, can log in, status=ACTIVE
//   INVITED  — admin approved the referral, welcome email sent, hasn't
//              activated the portal yet (agentUser.passwordHash is null)
//   PENDING  — referral submitted by the agent, awaiting admin approval;
//              no AgentUser/AgentProfile row exists yet
//   INACTIVE — profile.status flipped to INACTIVE. Only surfaces in the
//              response when ?includeInactive=1 is passed (the "See full
//              team" toggle on the portal).
type MemberStatus = 'ACTIVE' | 'INVITED' | 'PENDING' | 'INACTIVE'

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
  // The specific items in the current phase, with their completion
  // state. Lets the upline see exactly where the recruit is stuck so
  // they can DM them with targeted help.
  currentPhaseChecklist: Array<{ key: string; label: string; completed: boolean }>
  lastActivityAt: string | null   // ISO of most recent checklist completion
}

// PFR (Personal Financial Review) completion, surfaced on the team
// card so the upline can see at a glance who still needs to do it and
// nudge them. 'not_started' = no PersonalFinancialReview row at all;
// 'in_progress' = row exists but the agent hasn't filled income yet;
// 'completed' = row exists with real numbers.
type PfrStatus = 'not_started' | 'in_progress' | 'completed'

interface TeamNode {
  id: string
  agentUserId: string | null   // null for PENDING; needed for resend-invite
  referralId: string | null    // populated for PENDING/INVITED rows
  agentCode: string
  firstName: string
  lastName: string
  preferredName: string | null
  phase: number
  title: string
  state: string | null
  avatarUrl: string | null
  memberStatus: MemberStatus
  progress: TeamProgress | null
  // null for non-ACTIVE members (they haven't logged in to start it).
  pfrStatus: PfrStatus | null
  // Invite metadata for INVITED rows. Lets the detail panel show "invite
  // sent on X, expires Y" so the upline knows whether to nudge the
  // recruit or just wait for them to activate.
  inviteEmail: string | null
  inviteSentAt: string | null
  inviteExpiresAt: string | null
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

  // Fall back to agent session. Uses the same authOptions instance the
  // rest of the agent API uses (so credentials AND google sign-ins work)
  // and gates on role === 'agent'.
  if (!myAgentCode) {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as { role?: string }).role !== 'agent') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Bug we hit in prod: a stale/odd session can have session.user.email
    // be undefined. Plain {email: undefined} in a nested findFirst is
    // silently treated as "no filter" by Prisma, so the query returns
    // the first arbitrary agent and the team renders empty. Validate
    // the email string before we touch the DB.
    const email = session.user.email
    if (typeof email !== 'string' || email.trim().length === 0) {
      return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
    }
    // Case-insensitive lookup. Postgres string equality is case-sensitive
    // by default; if the agent was stored with one casing and the
    // session reports another, the exact match fails and the UI lands
    // on the empty "Build Your Team" state.
    const me = await db.agentProfile.findFirst({
      where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
      select: { id: true, agentCode: true },
    })
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    myAgentCode = me.agentCode
    myProfileId = me.id
  }

  // ?includeInactive=1 unlocks the "See full team" toggle on the agent
  // portal. Default behavior (no flag) stays as today: only ACTIVE
  // agents come back. Inactive recruits show as a separate visually
  // de-emphasized group when the agent opts into the full view.
  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === '1'

  const allAgents = await db.agentProfile.findMany({
    where: includeInactive ? {} : { status: 'ACTIVE' },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      phase: true,
      phaseStartedAt: true,
      state: true,
      avatarUrl: true,
      recruiterId: true,
      status: true,
      // passwordHash drives the ACTIVE vs INVITED distinction. If null,
      // the agent was approved + emailed but never set their password.
      // email + inviteExpires let the upline see the invite status panel
      // for INVITED members (when did the invite go out, has it expired).
      agentUser: { select: {
        id: true, passwordHash: true, email: true,
        inviteExpires: true, lastLoginAt: true, createdAt: true,
      } },
    },
  })

  // Bulk-fetch completed phase items for everyone in one query. This is
  // a small table per agent (~30 items × team size) so this scales
  // comfortably to a few hundred agents before we'd want to paginate.
  // We pull itemKey too so we can build a per-item completion map for
  // the upline detail panel ("which of these 9 items has Doug
  // actually finished?").
  const allCompleted = await db.phaseItem.findMany({
    where: {
      agentProfileId: { in: allAgents.map(a => a.id) },
      completed: true,
    },
    select: { agentProfileId: true, phase: true, itemKey: true, completedAt: true },
  })

  // PFR status per agent. One row per agent (agentProfileId is unique
  // on PersonalFinancialReview), so a single bulk query keyed into a
  // map is enough — no row means the agent never opened the tool.
  const pfrRows = await db.personalFinancialReview.findMany({
    where: { agentProfileId: { in: allAgents.map(a => a.id) } },
    select: { agentProfileId: true, monthlyIncome: true },
  })
  const pfrByAgent = new Map<string, PfrStatus>()
  for (const r of pfrRows) {
    pfrByAgent.set(r.agentProfileId, r.monthlyIncome > 0 ? 'completed' : 'in_progress')
  }

  // agentProfileId → { perPhase counts, completedKeys per phase, lastActivityAt }
  const progressByAgent = new Map<string, {
    perPhase: Map<number, number>
    completedKeysByPhase: Map<number, Set<string>>
    lastActivityAt: Date | null
  }>()
  for (const item of allCompleted) {
    let entry = progressByAgent.get(item.agentProfileId)
    if (!entry) {
      entry = { perPhase: new Map(), completedKeysByPhase: new Map(), lastActivityAt: null }
      progressByAgent.set(item.agentProfileId, entry)
    }
    entry.perPhase.set(item.phase, (entry.perPhase.get(item.phase) ?? 0) + 1)
    let keySet = entry.completedKeysByPhase.get(item.phase)
    if (!keySet) {
      keySet = new Set()
      entry.completedKeysByPhase.set(item.phase, keySet)
    }
    keySet.add(item.itemKey)
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
    const perPhase = [1, 2, 3, 4, 5, 6].map(p => ({
      phase: p,
      completed: entry?.perPhase.get(p) ?? 0,
      total: PHASE_ITEM_TOTALS[p] ?? 0,
    }))
    const current = perPhase.find(p => p.phase === a.phase) ?? { completed: 0, total: 0 }
    const daysInPhase = a.phaseStartedAt
      ? Math.max(0, Math.floor((Date.now() - a.phaseStartedAt.getTime()) / 86_400_000))
      : null

    // Build the current-phase checklist with completion state. Order
    // follows PHASE_ITEMS so the upline sees the same sequence the
    // recruit sees in their portal.
    const completedKeys = entry?.completedKeysByPhase.get(a.phase) ?? new Set<string>()
    const items = PHASE_ITEMS[a.phase] ?? []
    const currentPhaseChecklist = items.map(item => ({
      key: item.key,
      label: item.label,
      completed: completedKeys.has(item.key),
    }))

    return {
      phase: a.phase,
      daysInPhase,
      currentPhaseCompleted: current.completed,
      currentPhaseTotal: current.total,
      perPhase,
      currentPhaseChecklist,
      lastActivityAt: entry?.lastActivityAt?.toISOString() ?? null,
    }
  }

  function buildNode(a: typeof allAgents[0]): TeamNode {
    const kids = childrenOf.get(a.agentCode) ?? []
    // INACTIVE profiles take precedence over the password-hash check; we
    // care more that they're no longer producing than that they once
    // logged in. Without this guard an inactive agent who set a password
    // would still render as ACTIVE in the team view, which is wrong.
    let memberStatus: MemberStatus
    if (a.status === 'INACTIVE') memberStatus = 'INACTIVE'
    else if (a.agentUser?.passwordHash || a.agentUser?.lastLoginAt) memberStatus = 'ACTIVE'
    else memberStatus = 'INVITED'
    return {
      id: a.id,
      agentUserId: a.agentUser?.id ?? null,
      referralId: null,
      agentCode: a.agentCode,
      firstName: a.firstName,
      lastName: a.lastName,
      preferredName: a.preferredName,
      phase: a.phase,
      title: resolveAgentTitle({
        phase: a.phase,
        completedItemKeys: Array.from(
          progressByAgent.get(a.id)?.completedKeysByPhase.values() ?? [],
        ).flatMap(set => Array.from(set)),
      }),
      state: a.state,
      avatarUrl: a.avatarUrl,
      memberStatus,
      // Only ACTIVE members get progress: INVITED agents haven't logged
      // in to start their checklist, so the numbers would all be zero.
      // Their detail panel shows the invite status instead.
      progress: memberStatus === 'ACTIVE' ? computeProgress(a) : null,
      pfrStatus: memberStatus === 'ACTIVE'
        ? (pfrByAgent.get(a.id) ?? 'not_started')
        : null,
      inviteEmail:    memberStatus === 'INVITED' ? (a.agentUser?.email ?? null) : null,
      inviteSentAt:   memberStatus === 'INVITED' ? (a.agentUser?.createdAt?.toISOString() ?? null) : null,
      inviteExpiresAt: memberStatus === 'INVITED' ? (a.agentUser?.inviteExpires?.toISOString() ?? null) : null,
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
    preferredName: null,
    phase: 0,
    title: 'Pending Review',
    state: r.state,
    avatarUrl: null,
    memberStatus: 'PENDING',
    progress: null,
    pfrStatus: null,
    inviteEmail: null,
    inviteSentAt: r.createdAt.toISOString(),
    inviteExpiresAt: null,
    children: [],
  }))

  // Sort top-level: ACTIVE → INVITED → PENDING. Children stay in their
  // existing tree order (they're always ACTIVE — nobody can recruit while
  // their own profile is still inactive).
  const STATUS_ORDER: Record<MemberStatus, number> = { ACTIVE: 0, INVITED: 1, PENDING: 2, INACTIVE: 3 }
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

  // "Also training" — agents whose cft (trainer) field normalizes to
  // me, but who aren't already in my downline tree (i.e. someone else
  // recruited them, I just got assigned as their trainer). These get
  // their own flat section in the UI under the main team tree, with
  // BP/FTA drill-down auth granted via the trainee-endpoint match.
  let cftOnlyMembers: Array<{
    id: string
    agentCode: string
    firstName: string
    lastName: string
    preferredName: string | null
    avatarUrl: string | null
    phase: number
    state: string | null
    status: string
    // Same on-portal signal the recruited tree shows, so a CFT who
    // didn't recruit the agent can still see whether they're actually
    // using the portal (ACTIVE) or only invited (INVITED).
    memberStatus: MemberStatus
    partnerCount: number
    ftaCount: number
  }> = []
  if (myProfileId) {
    const ctx = await loadTrainerContext(myProfileId)
    if (ctx) {
      const trainees = await findTraineeProfiles(ctx)
      // Exclude anyone already in the recruited tree so we don't show
      // them in two places. We keep the recruited-tree entry as the
      // primary surface since it carries phase progress + invite
      // status; cft-only members are listed flat with just the
      // contact-list drill-down.
      const inTreeCodes = new Set<string>()
      function collect(nodes: TeamNode[]) {
        for (const n of nodes) {
          if (n.agentCode) inTreeCodes.add(n.agentCode)
          collect(n.children)
        }
      }
      collect(team)

      const cftOnly = trainees.filter(t => !inTreeCodes.has(t.agentCode))
      if (cftOnly.length > 0) {
        const ids = cftOnly.map(t => t.id)
        const [bp, fta] = await Promise.all([
          db.businessPartner.groupBy({
            by: ['agentProfileId'],
            where: { agentProfileId: { in: ids } },
            _count: { _all: true },
          }),
          db.fieldTrainingAppointment.groupBy({
            by: ['agentProfileId'],
            where: { agentProfileId: { in: ids } },
            _count: { _all: true },
          }),
        ])
        const bpByAgent = new Map(bp.map(r => [r.agentProfileId, r._count._all]))
        const ftaByAgent = new Map(fta.map(r => [r.agentProfileId, r._count._all]))
        cftOnlyMembers = cftOnly.map(t => {
          // Mirror the recruited-tree memberStatus rule: INACTIVE wins,
          // else a set password means they have logged into the portal
          // (ACTIVE), else they were created but never activated
          // (INVITED). This is the "on the portal yet" answer.
          let memberStatus: MemberStatus
          if (t.status === 'INACTIVE') memberStatus = 'INACTIVE'
          else if (t.agentUser?.passwordHash || t.agentUser?.lastLoginAt) memberStatus = 'ACTIVE'
          else memberStatus = 'INVITED'
          return {
            id: t.id,
            agentCode: t.agentCode,
            firstName: t.firstName,
            lastName: t.lastName,
            preferredName: t.preferredName,
            avatarUrl: t.avatarUrl,
            phase: t.phase,
            state: t.state,
            status: t.status,
            memberStatus,
            partnerCount: bpByAgent.get(t.id) ?? 0,
            ftaCount: ftaByAgent.get(t.id) ?? 0,
          }
        })
      }
    }
  }

  return NextResponse.json({ team, totalTeamSize, activeTeamSize, cftOnlyMembers })
}
