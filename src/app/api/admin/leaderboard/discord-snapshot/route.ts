import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TITLE_OVERRIDE_ITEM_KEYS, titleForPromotionItem } from '@/lib/agent-title'

// GET /api/admin/leaderboard/discord-snapshot
// Returns monthly production snapshot for the Discord leaderboard bot post.
// Auth: x-cron-secret header only (no session required).

interface AgentRow {
  firstName: string
  lastName: string
  value: number
  phase: number
  avatarUrl?: string | null
  // Couple flag for the bot's renderer — when true, the firstName
  // field already carries the combined display name (e.g.
  // 'Joey & Jen' or 'The Garcias') and lastName is empty.
  isCouple?: boolean
}

interface PromotionRow {
  firstName: string
  lastName: string
  title: string
  isCouple?: boolean
}

interface SnapshotResponse {
  monthLabel: string
  submissions: AgentRow[]
  recruits: AgentRow[]
  agents: Array<{
    agentCode: string
    firstName: string
    lastName: string
    phase: number
    // When this agent is part of a configured couple, displayName
    // is the joint label ('Vick & Melinee Minhas'); the phase-mover
    // line on the Discord embed uses it instead of first+last so
    // the celebration honors both partners.
    displayName?: string
    isCouple?: boolean
  }>
  totalSubmissions: number
  activeSubmitters: number
  totalRecruits: number
  activeRecruiters: number
  promotions: PromotionRow[]
}

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || !process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthLabel = formatMonthLabel(now)

  const roster = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: {
      id: true, agentCode: true, firstName: true, lastName: true, phase: true,
      avatarUrl: true,
      isLeadership: true,
      // Couples: an agent is part of a couple when (a) two-sided: their
      // partnerAgentProfileId is set and the partner reciprocally points
      // back, or (b) one-sided: partnerDisplayName + coupleDisplayName
      // are set on this profile.
      partnerAgentProfileId: true,
      partnerDisplayName: true,
      coupleDisplayName: true,
      coupleAvatarUrl: true,
    },
  })
  const rosterIds = roster.map(r => r.id)
  const idSet = new Set(rosterIds)
  const leadershipIds = new Set(roster.filter(r => r.isLeadership).map(r => r.id))
  const profileById = new Map(roster.map(r => [r.id, r]))

  // Couple resolution. Build a function that maps any agentProfileId
  // to a 'couple key' — either the canonical couple id (deterministic
  // min of two profile ids for two-sided) or just the profile id
  // (when no couple is configured). Two-sided is recognized only when
  // BOTH profiles point reciprocally; otherwise treat as solo so
  // half-configured couples don't accidentally combine.
  type CoupleMeta = { key: string; displayName: string; avatarUrl: string | null; isCouple: boolean; primary: typeof roster[number] }
  const coupleMetaCache = new Map<string, CoupleMeta>()
  const resolveCouple = (id: string): CoupleMeta => {
    const cached = coupleMetaCache.get(id)
    if (cached) return cached
    const me = profileById.get(id)
    if (!me) {
      const fallback: CoupleMeta = { key: id, displayName: '', avatarUrl: null, isCouple: false, primary: { id } as never }
      coupleMetaCache.set(id, fallback)
      return fallback
    }
    // Two-sided check: partner exists in roster and points back.
    const partner = me.partnerAgentProfileId ? profileById.get(me.partnerAgentProfileId) : null
    const twoSided = !!partner && partner.partnerAgentProfileId === me.id
    if (twoSided && partner) {
      const [a, b] = me.id < partner.id ? [me, partner] : [partner, me]
      // Prefer the explicitly-set coupleDisplayName on either side.
      const displayName = a.coupleDisplayName ?? b.coupleDisplayName
        ?? `${a.firstName} & ${b.firstName}`
      const avatarUrl = a.coupleAvatarUrl ?? b.coupleAvatarUrl ?? a.avatarUrl ?? b.avatarUrl ?? null
      const meta: CoupleMeta = { key: a.id, displayName, avatarUrl, isCouple: true, primary: a }
      coupleMetaCache.set(a.id, meta)
      coupleMetaCache.set(b.id, meta)
      return meta
    }
    // One-sided: partnerDisplayName + coupleDisplayName on this row,
    // partner is admin-only or off-platform.
    if (me.coupleDisplayName && me.partnerDisplayName) {
      const meta: CoupleMeta = {
        key: me.id,
        displayName: me.coupleDisplayName,
        avatarUrl: me.coupleAvatarUrl ?? me.avatarUrl ?? null,
        isCouple: true,
        primary: me,
      }
      coupleMetaCache.set(id, meta)
      return meta
    }
    // Solo.
    const meta: CoupleMeta = {
      key: id,
      displayName: `${me.firstName} ${me.lastName}`,
      avatarUrl: me.avatarUrl ?? null,
      isCouple: false,
      primary: me,
    }
    coupleMetaCache.set(id, meta)
    return meta
  }

  if (rosterIds.length === 0) {
    return NextResponse.json({
      monthLabel, submissions: [], recruits: [],
      agents: [], totalSubmissions: 0, activeSubmitters: 0,
      totalRecruits: 0, activeRecruiters: 0, promotions: [],
    } satisfies SnapshotResponse)
  }

  // Submissions this month — writing agent and split partner each get full credit
  const subs = await db.newBusinessSubmission.findMany({
    where: {
      applicationDate: { gte: monthStart, lte: now },
      OR: [
        { agentProfileId: { in: rosterIds } },
        { splitWithAgentId: { in: rosterIds } },
      ],
    },
    select: { agentProfileId: true, splitWithAgentId: true },
  })

  // Bucket by couple key. Solo agents bucket on their own id.
  const subCounts = new Map<string, number>()
  const bump = (id: string) => {
    if (!idSet.has(id)) return
    const key = resolveCouple(id).key
    subCounts.set(key, (subCounts.get(key) ?? 0) + 1)
  }
  for (const s of subs) {
    bump(s.agentProfileId)
    if (s.splitWithAgentId) bump(s.splitWithAgentId)
  }

  // Recruits this month. Same couple-keyed grouping. Leadership-
  // attributed recruits (null recruiterId, or recruiterId pointing
  // to a flagged leader) bundle into one synthetic 'leadership'
  // bucket.
  const newAgents = await db.agentProfile.findMany({
    where: {
      isTest: false,
      icaDate: { gte: monthStart, lte: now },
    },
    select: { recruiterId: true },
  })

  const codeToId = new Map(roster.map(r => [r.agentCode, r.id]))
  const recruitCounts = new Map<string, number>()
  for (const a of newAgents) {
    if (!a.recruiterId) continue
    const id = codeToId.get(a.recruiterId)
    if (!id) continue
    const key = resolveCouple(id).key
    recruitCounts.set(key, (recruitCounts.get(key) ?? 0) + 1)
  }

  const toRow = (key: string, value: number): AgentRow => {
    const meta = resolveCouple(key)
    if (meta.isCouple) {
      return {
        firstName: meta.displayName,
        lastName: '',
        value,
        phase: meta.primary.phase,
        avatarUrl: meta.avatarUrl,
        isCouple: true,
      }
    }
    const a = profileById.get(key)!
    return {
      firstName: a.firstName,
      lastName: a.lastName,
      value,
      phase: a.phase,
      avatarUrl: a.avatarUrl,
    }
  }

  const TOP_N = 10
  const submissions = [...subCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([key, value]) => toRow(key, value))

  const recruits = [...recruitCounts.entries()]
    .map(([k, v]) => toRow(k, v))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)

  const totalSubmissions = [...subCounts.values()].reduce((sum, v) => sum + v, 0)
  const activeSubmitters = subCounts.size

  const totalRecruits = [...recruitCounts.values()].reduce((sum, v) => sum + v, 0)
  const activeRecruiters = recruitCounts.size

  // Promotions this month — admin-gated title items completed in the current month
  const promoItems = await db.phaseItem.findMany({
    where: {
      itemKey: { in: TITLE_OVERRIDE_ITEM_KEYS },
      completed: true,
      completedAt: { gte: monthStart, lte: now },
      agentProfile: { isLeadership: false },
    },
    select: {
      itemKey: true,
      agentProfile: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  })
  // Deduplicate by couple key and include title label
  const promoSeen = new Set<string>()
  const promotions: PromotionRow[] = []
  for (const item of promoItems) {
    const title = titleForPromotionItem(item.itemKey)
    if (!title) continue
    const meta = resolveCouple(item.agentProfile.id)
    if (promoSeen.has(meta.key + item.itemKey)) continue
    promoSeen.add(meta.key + item.itemKey)
    promotions.push(
      meta.isCouple
        ? { firstName: meta.displayName, lastName: '', title, isCouple: true }
        : { firstName: item.agentProfile.firstName, lastName: item.agentProfile.lastName, title }
    )
  }

  const agents = roster
    .filter(r => !r.isLeadership)
    .map(r => {
      const meta = resolveCouple(r.id)
      return {
        agentCode: r.agentCode,
        firstName: r.firstName,
        lastName: r.lastName,
        phase: r.phase,
        // Phase-movers line on the bot reads displayName when set so
        // couples celebrate as a unit ('🎉 Vick & Melinee Minhas
        // moved from Phase 5 to Phase 6').
        ...(meta.isCouple ? { displayName: meta.displayName, isCouple: true } : {}),
      }
    })

  return NextResponse.json({
    monthLabel, submissions, recruits, agents,
    totalSubmissions, activeSubmitters, totalRecruits, activeRecruiters, promotions,
  } satisfies SnapshotResponse)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' })
}
