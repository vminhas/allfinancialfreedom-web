import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveAgentTitle, TITLE_OVERRIDE_ITEM_KEYS } from '@/lib/agent-title'

// GET /api/agents/leaderboard/production
//
// Production leaderboard for the agent portal. Three rankings (submissions,
// recruits, points) across two scopes (whole company, viewer's downline)
// over four timeframes (week, month, quarter, ytd, all). Returns ranked
// rows + the viewer's standing including a delta vs the previous
// equivalent period so the UI can render "▲5 from last month".
//
// Premium $ is intentionally not yet a metric: NewBusinessSubmission has
// `points` but no `premium` field, and reading premium from the legacy
// PolicyEntry table would mix submitted-vs-issued semantics. We'll add
// it as a fourth metric once the data model gains a clean source.

export type Metric = 'submissions' | 'recruits' | 'points'
export type Scope = 'company' | 'downline'
export type Timeframe = 'week' | 'month' | 'quarter' | 'ytd' | 'all'

interface Row {
  agentProfileId: string
  agentCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  phase: number
  title: string
  upline: string | null
  value: number
  rank: number
  badges: string[]
}

interface Response {
  rows: Row[]
  viewer: {
    agentProfileId: string
    rank: number | null
    value: number
    previousValue: number
    inVisibleRows: boolean
  }
  totalCount: number
  activeCount: number
  metric: Metric
  scope: Scope
  timeframe: Timeframe
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const metric = parseMetric(searchParams.get('metric'))
  const scope = parseScope(searchParams.get('scope'))
  const timeframe = parseTimeframe(searchParams.get('timeframe'))

  // Resolve the viewing agent. Supports three paths:
  //   1. Admin preview via ?preview=<token> — used when staff opens
  //      an agent's portal through the eyes of that agent. Token
  //      maps to a specific agentProfileId.
  //   2. Staff session (admin / licensing_coordinator) — leaderboard
  //      is fine to show; the downline scope falls back to whole-
  //      company since staff don't have their own downline.
  //   3. Agent session — viewing their own leaderboard.
  let me: { id: string; agentCode: string } | null = null

  const previewToken = searchParams.get('preview')
  if (previewToken) {
    const { getSetting } = await import('@/lib/settings')
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        const profile = await db.agentProfile.findUnique({
          where: { id: data.agentProfileId },
          select: { id: true, agentCode: true },
        })
        if (profile) me = profile
      }
    }
  }

  if (!me) {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string } | undefined)?.role
    if (!session || (role !== 'agent' && role !== 'admin' && role !== 'licensing_coordinator')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const email = session.user!.email
    if (typeof email === 'string' && email.trim().length > 0) {
      const u = await db.agentUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: { profile: { select: { id: true, agentCode: true } } },
      })
      if (u?.profile) me = u.profile
    }
  }

  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { start: currentStart, end: currentEnd, prevStart, prevEnd } = boundsFor(timeframe)

  // Roster the leaderboard ranks from. Whole-company is the entire active
  // non-test roster; downline is just the viewer's recursive descendants
  // (plus the viewer themselves so they see their own row).
  const roster = scope === 'company'
    ? await rosterAll()
    : await rosterDownline(me.agentCode, me.id)

  const rosterIds = roster.map(r => r.id)
  if (rosterIds.length === 0) {
    return NextResponse.json({
      rows: [],
      viewer: {
        agentProfileId: me.id,
        rank: null, value: 0, previousValue: 0,
        inVisibleRows: false,
      },
      totalCount: 0, activeCount: 0,
      metric, scope, timeframe,
    } satisfies Response)
  }

  // Compute the metric value per agent in the current period and the
  // viewer's value in the previous period (for the delta banner).
  const [currentValues, previousValues] = await Promise.all([
    valuesFor(metric, rosterIds, roster, currentStart, currentEnd),
    valuesFor(metric, [me.id], roster, prevStart, prevEnd),
  ])

  // Build upline lookup (recruiter's display name) keyed by agentCode.
  const recruiterCodes = Array.from(new Set(roster.map(r => r.recruiterId).filter((c): c is string => !!c)))
  const recruiters = recruiterCodes.length > 0
    ? await db.agentProfile.findMany({
      where: { agentCode: { in: recruiterCodes } },
      select: { agentCode: true, firstName: true, lastName: true },
    })
    : []
  const recruiterByCode = new Map(recruiters.map(r => [r.agentCode, `${r.firstName} ${r.lastName}`.trim()]))

  // Resolve DB-driven titles for all roster agents in one batch query.
  const promoItems = await db.phaseItem.findMany({
    where: { agentProfileId: { in: rosterIds }, itemKey: { in: TITLE_OVERRIDE_ITEM_KEYS }, completed: true },
    select: { agentProfileId: true, itemKey: true },
  })
  const promoKeysByAgent = new Map<string, string[]>()
  for (const item of promoItems) {
    const keys = promoKeysByAgent.get(item.agentProfileId) ?? []
    keys.push(item.itemKey)
    promoKeysByAgent.set(item.agentProfileId, keys)
  }

  // Sort by value desc; tie-break by lastName then firstName so order is
  // stable across reloads (otherwise random Map iteration order shows up
  // in ties and the UI looks like it's shuffling). Dense-rank ties: two
  // agents with the same value share a rank, the next agent gets +1
  // (matches the GFI screenshot's behavior at ranks 4 and 9).
  const ranked = [...roster]
    .map(a => ({ ...a, value: currentValues.get(a.id) ?? 0 }))
    .sort((a, b) => {
      if (a.value !== b.value) return b.value - a.value
      return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
    })

  let lastValue: number | null = null
  let lastRank = 0
  // Compute ranks across ALL roster members first so dense-rank ties are
  // calculated correctly (rank #1 is whoever did most this period; an
  // agent with value 0 is rank N+1 if everyone else has value > 0).
  // Then drop the zero-value rows from the response — they didn't
  // compete in this period and ranking 30 agents at "T-15 with zero
  // submissions" is noise that crowds out the people who did. The
  // viewer's standing banner still shows their rank/total via separate
  // fields, so a zero-value viewer isn't left disoriented.
  const allRankedRows: Row[] = ranked.map((a, idx) => {
    const rank = a.value === lastValue ? lastRank : idx + 1
    lastValue = a.value
    lastRank = rank
    return {
      agentProfileId: a.id,
      agentCode: a.agentCode,
      firstName: a.firstName,
      lastName: a.lastName,
      avatarUrl: a.avatarUrl,
      phase: a.phase,
      title: resolveAgentTitle({ completedItemKeys: promoKeysByAgent.get(a.id) ?? [] }),
      upline: a.recruiterId ? (recruiterByCode.get(a.recruiterId) ?? null) : null,
      value: a.value,
      rank,
      badges: a.badges ?? [],
    }
  })
  const rows = allRankedRows.filter(r => r.value > 0)

  // Surface the viewer separately when their value is zero (and thus
  // dropped from `rows`). Lets the UI render a pinned "you" row at the
  // bottom of the table with their real rank in the full roster, so
  // they can see what they're competing against without being forced
  // to scroll past 40 zeros.
  const viewerInRows = rows.find(r => r.agentProfileId === me.id) ?? null
  const viewerFullRow = allRankedRows.find(r => r.agentProfileId === me.id) ?? null
  const viewerRow = viewerInRows ?? viewerFullRow

  return NextResponse.json({
    rows,
    viewer: {
      agentProfileId: me.id,
      // Real rank in the full roster, NOT the filtered list — so a
      // viewer at rank 43 with zero submissions still reads as "#43 of
      // 57" not "unranked." rank stays null only when the viewer
      // wasn't found in the roster at all (downline-empty edge case).
      rank: viewerRow?.rank ?? null,
      value: viewerRow?.value ?? 0,
      previousValue: previousValues.get(me.id) ?? 0,
      // Whether the viewer's own row appears in the visible (non-zero)
      // list. Lets the UI decide whether to pin a "your row" sticky at
      // the bottom of the table.
      inVisibleRows: !!viewerInRows,
    },
    // totalCount = all roster members in scope (the size of the field).
    // activeCount = those with non-zero value in the period (the people
    // who actually competed). UI shows 'You're #5 of {totalCount}' for
    // aspirational framing, while the visible-rows list only contains
    // activeCount entries.
    totalCount: allRankedRows.length,
    activeCount: rows.length,
    metric, scope, timeframe,
  } satisfies Response)
}

// ─── Roster helpers ───────────────────────────────────────────────────

interface RosterAgent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  phase: number
  recruiterId: string | null
  badges: string[]
}

async function rosterAll(): Promise<RosterAgent[]> {
  const rows = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true, agentCode: true, firstName: true, lastName: true, avatarUrl: true, phase: true, recruiterId: true, badges: true },
  })
  return rows.map(r => ({ ...r, badges: r.badges ?? [] }))
}

// Recursive descendants of `rootCode`, keyed by agent_profiles.recruiterId
// (which stores the recruiter's agentCode, not a real FK). Includes the
// viewer themselves so the page always shows their own row even when the
// downline is empty. Bounded to 10 levels of depth as a safety belt
// against any cyclic data; AFF's tree is realistically <6 levels deep.
async function rosterDownline(rootCode: string, viewerId: string): Promise<RosterAgent[]> {
  const rows = await db.$queryRaw<Array<RosterAgent & { is_test: boolean; status: string; badges: string[] | null }>>`
    WITH RECURSIVE downline AS (
      SELECT id, "agentCode", "firstName", "lastName", "avatarUrl", phase, "recruiterId", badges, "is_test", status, 0 AS depth
        FROM agent_profiles WHERE id = ${viewerId}
      UNION ALL
      SELECT a.id, a."agentCode", a."firstName", a."lastName", a."avatarUrl", a.phase, a."recruiterId", a.badges, a."is_test", a.status, d.depth + 1
        FROM agent_profiles a
        JOIN downline d ON a."recruiterId" = d."agentCode"
       WHERE d.depth < 10
    )
    SELECT id, "agentCode", "firstName", "lastName", "avatarUrl", phase, "recruiterId", badges, "is_test", status FROM downline
  `
  return rows
    .filter(r => r.status === 'ACTIVE' && !r.is_test)
    .map(r => ({
      id: r.id, agentCode: r.agentCode, firstName: r.firstName, lastName: r.lastName,
      avatarUrl: r.avatarUrl, phase: r.phase, recruiterId: r.recruiterId,
      badges: r.badges ?? [],
    }))
}

// ─── Metric value computation ─────────────────────────────────────────

async function valuesFor(
  metric: Metric,
  agentIds: string[],
  roster: RosterAgent[],
  start: Date | null,
  end: Date,
): Promise<Map<string, number>> {
  if (agentIds.length === 0) return new Map()
  if (metric === 'submissions') return submissionsValues(agentIds, start, end)
  if (metric === 'points') return pointsValues(agentIds, start, end)
  return recruitsValues(roster, agentIds, start, end)
}

async function submissionsValues(agentIds: string[], start: Date | null, end: Date) {
  // Each submission credits the writing agent and the split partner each
  // with a full +1. Half-credit splits would be more "accurate" but worse
  // for morale, and AFF's split policy on real comp is also full-credit
  // for points so this keeps the leaderboard consistent with payouts.
  const subs = await db.newBusinessSubmission.findMany({
    where: {
      applicationDate: start ? { gte: start, lte: end } : { lte: end },
      OR: [
        { agentProfileId: { in: agentIds } },
        { splitWithAgentId: { in: agentIds } },
      ],
    },
    select: { agentProfileId: true, splitWithAgentId: true },
  })
  const m = new Map<string, number>()
  const idSet = new Set(agentIds)
  for (const s of subs) {
    if (idSet.has(s.agentProfileId)) m.set(s.agentProfileId, (m.get(s.agentProfileId) ?? 0) + 1)
    if (s.splitWithAgentId && idSet.has(s.splitWithAgentId)) m.set(s.splitWithAgentId, (m.get(s.splitWithAgentId) ?? 0) + 1)
  }
  return m
}

async function pointsValues(agentIds: string[], start: Date | null, end: Date) {
  const subs = await db.newBusinessSubmission.findMany({
    where: {
      applicationDate: start ? { gte: start, lte: end } : { lte: end },
      OR: [
        { agentProfileId: { in: agentIds } },
        { splitWithAgentId: { in: agentIds } },
      ],
    },
    select: { agentProfileId: true, splitWithAgentId: true, points: true },
  })
  const m = new Map<string, number>()
  const idSet = new Set(agentIds)
  for (const s of subs) {
    const fullPts = s.points ?? 0
    // Split submissions divide points equally between both agents.
    const pts = s.splitWithAgentId ? fullPts / 2 : fullPts
    if (idSet.has(s.agentProfileId)) m.set(s.agentProfileId, (m.get(s.agentProfileId) ?? 0) + pts)
    if (s.splitWithAgentId && idSet.has(s.splitWithAgentId)) m.set(s.splitWithAgentId, (m.get(s.splitWithAgentId) ?? 0) + pts)
  }
  return m
}

async function recruitsValues(roster: RosterAgent[], agentIds: string[], start: Date | null, end: Date) {
  // recruiterId stores the recruiter's agentCode, so we need to resolve
  // each candidate agentCode → id once. The roster we already have
  // covers every code we care about, so build the map locally instead
  // of issuing a second query.
  const codeToId = new Map<string, string>()
  for (const a of roster) codeToId.set(a.agentCode, a.id)

  const codesOfInterest = agentIds.map(id => roster.find(r => r.id === id)?.agentCode).filter((c): c is string => !!c)
  if (codesOfInterest.length === 0) return new Map()

  const recruits = await db.agentProfile.findMany({
    where: {
      isTest: false,
      // No status filter: agents who later go inactive still count toward
      // their recruiter's recruitment total — they were recruited.
      recruiterId: { in: codesOfInterest },
      OR: [
        { icaDate: start ? { gte: start, lte: end } : { lte: end } },
        { icaDate: null, createdAt: start ? { gte: start, lte: end } : { lte: end } },
      ],
    },
    select: { recruiterId: true },
  })
  const m = new Map<string, number>()
  for (const r of recruits) {
    if (!r.recruiterId) continue
    const recruiterDbId = codeToId.get(r.recruiterId)
    if (!recruiterDbId) continue
    m.set(recruiterDbId, (m.get(recruiterDbId) ?? 0) + 1)
  }
  return m
}

// ─── Param parsing + timeframe boundaries ─────────────────────────────

function parseMetric(v: string | null): Metric {
  return v === 'recruits' || v === 'points' ? v : 'submissions'
}
function parseScope(v: string | null): Scope {
  return v === 'downline' ? 'downline' : 'company'
}
function parseTimeframe(v: string | null): Timeframe {
  if (v === 'month' || v === 'quarter' || v === 'ytd' || v === 'all') return v
  return 'week'
}

function boundsFor(tf: Timeframe): { start: Date | null; end: Date; prevStart: Date | null; prevEnd: Date } {
  const now = new Date()
  const end = now
  if (tf === 'all') {
    return { start: null, end, prevStart: null, prevEnd: end }
  }
  if (tf === 'week') {
    const start = startOfWeek(now)
    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = startOfWeek(prevEnd)
    return { start, end, prevStart, prevEnd }
  }
  if (tf === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1)
    return { start, end, prevStart, prevEnd }
  }
  if (tf === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const start = new Date(now.getFullYear(), q * 3, 1)
    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getFullYear(), Math.floor(prevEnd.getMonth() / 3) * 3, 1)
    return { start, end, prevStart, prevEnd }
  }
  // ytd
  const start = new Date(now.getFullYear(), 0, 1)
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getFullYear(), 0, 1)
  return { start, end, prevStart, prevEnd }
}

function startOfWeek(d: Date): Date {
  // Sunday-anchored week. AFF reporting elsewhere uses Sunday weeks
  // (see scripts/weekly-summary). Keep consistent so a "this week"
  // submissions count here matches the weekly digest's coverage.
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - x.getDay())
  x.setHours(0, 0, 0, 0)
  return x
}
