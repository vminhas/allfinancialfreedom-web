import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveAgentTitle, TITLE_OVERRIDE_ITEM_KEYS } from '@/lib/agent-title'

type Metric = 'submissions' | 'recruits' | 'points'
type Timeframe = 'week' | 'month' | 'quarter' | 'ytd' | 'all'

// GET /api/admin/leaderboard
//
// Production leaderboard for vault admin view. Same metrics and timeframes
// as the agent-facing leaderboard but no viewer-context — admin sees all
// agents sorted by metric without a personal standing banner.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const metric = parseMetric(searchParams.get('metric'))
  const timeframe = parseTimeframe(searchParams.get('timeframe'))

  const roster = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true, agentCode: true, firstName: true, lastName: true, avatarUrl: true, phase: true, recruiterId: true },
  })

  const { start, end } = boundsFor(timeframe)
  const values = await valuesFor(metric, roster, start, end)

  const recruiterCodes = Array.from(new Set(roster.map(r => r.recruiterId).filter((c): c is string => !!c)))
  const recruiters = recruiterCodes.length > 0
    ? await db.agentProfile.findMany({
        where: { agentCode: { in: recruiterCodes } },
        select: { agentCode: true, firstName: true, lastName: true },
      })
    : []
  const recruiterByCode = new Map(recruiters.map(r => [r.agentCode, `${r.firstName} ${r.lastName}`.trim()]))

  const rosterIds = roster.map(r => r.id)
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

  const ranked = [...roster]
    .map(a => ({ ...a, value: values.get(a.id) ?? 0 }))
    .sort((a, b) => {
      if (a.value !== b.value) return b.value - a.value
      return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)
    })

  let lastValue: number | null = null
  let lastRank = 0
  const rows = ranked.map((a, idx) => {
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
    }
  }).filter(r => r.value > 0)

  return NextResponse.json({ rows, metric, timeframe, totalCount: ranked.length, activeCount: rows.length })
}

async function valuesFor(metric: Metric, roster: { id: string; agentCode: string; recruiterId: string | null }[], start: Date | null, end: Date) {
  const agentIds = roster.map(r => r.id)
  if (metric === 'submissions') return submissionsValues(agentIds, start, end)
  if (metric === 'points') return pointsValues(agentIds, start, end)
  return recruitsValues(roster, start, end)
}

async function submissionsValues(agentIds: string[], start: Date | null, end: Date) {
  const subs = await db.newBusinessSubmission.findMany({
    where: {
      applicationDate: start ? { gte: start, lte: end } : { lte: end },
      OR: [{ agentProfileId: { in: agentIds } }, { splitWithAgentId: { in: agentIds } }],
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
      OR: [{ agentProfileId: { in: agentIds } }, { splitWithAgentId: { in: agentIds } }],
    },
    select: { agentProfileId: true, splitWithAgentId: true, points: true },
  })
  const m = new Map<string, number>()
  const idSet = new Set(agentIds)
  for (const s of subs) {
    const pts = s.points ?? 0
    if (idSet.has(s.agentProfileId)) m.set(s.agentProfileId, (m.get(s.agentProfileId) ?? 0) + pts)
    if (s.splitWithAgentId && idSet.has(s.splitWithAgentId)) m.set(s.splitWithAgentId, (m.get(s.splitWithAgentId) ?? 0) + pts)
  }
  return m
}

async function recruitsValues(roster: { id: string; agentCode: string }[], start: Date | null, end: Date) {
  const codeToId = new Map(roster.map(r => [r.agentCode, r.id]))
  const codes = roster.map(r => r.agentCode)
  const recruits = await db.agentProfile.findMany({
    where: {
      isTest: false,
      // No status filter: agents who later go inactive still count toward
      // their recruiter's recruitment total — they were recruited.
      recruiterId: { in: codes },
      createdAt: start ? { gte: start, lte: end } : { lte: end },
    },
    select: { recruiterId: true },
  })
  const m = new Map<string, number>()
  for (const r of recruits) {
    if (!r.recruiterId) continue
    const id = codeToId.get(r.recruiterId)
    if (!id) continue
    m.set(id, (m.get(id) ?? 0) + 1)
  }
  return m
}

function parseMetric(v: string | null): Metric {
  return v === 'recruits' || v === 'points' ? v : 'submissions'
}
function parseTimeframe(v: string | null): Timeframe {
  if (v === 'month' || v === 'quarter' || v === 'ytd' || v === 'all' || v === 'week') return v
  return 'month'
}

function boundsFor(tf: Timeframe): { start: Date | null; end: Date } {
  const now = new Date()
  if (tf === 'all') return { start: null, end: now }
  if (tf === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    start.setDate(start.getDate() - start.getDay())
    start.setHours(0, 0, 0, 0)
    return { start, end: now }
  }
  if (tf === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
  if (tf === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    return { start: new Date(now.getFullYear(), q * 3, 1), end: now }
  }
  return { start: new Date(now.getFullYear(), 0, 1), end: now }
}
