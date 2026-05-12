import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/admin/leaderboard/discord-snapshot
// Returns monthly production snapshot for the Discord leaderboard bot post.
// Auth: x-cron-secret header only (no session required).

interface AgentRow {
  firstName: string
  lastName: string
  value: number
  phase: number
}

interface SnapshotResponse {
  monthLabel: string
  submissions: AgentRow[]
  recruits: AgentRow[]
  agents: Array<{ agentCode: string; firstName: string; lastName: string; phase: number }>
  totalSubmissions: number
  activeSubmitters: number
}

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || !process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthLabel = formatMonthLabel(now)

  // Roster includes leadership so we can resolve their recruits to
  // them, but we filter them out of the production results below.
  // isLeadership flag lives on AgentProfile; flip it from the
  // tracker edit drawer.
  const roster = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true, agentCode: true, firstName: true, lastName: true, phase: true, isLeadership: true },
  })
  const rosterIds = roster.map(r => r.id)
  const idSet = new Set(rosterIds)
  const leadershipIds = new Set(roster.filter(r => r.isLeadership).map(r => r.id))
  const leadershipCodes = new Set(roster.filter(r => r.isLeadership).map(r => r.agentCode))

  if (rosterIds.length === 0) {
    return NextResponse.json({
      monthLabel, submissions: [], recruits: [],
      agents: [], totalSubmissions: 0, activeSubmitters: 0,
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

  const subCounts = new Map<string, number>()
  for (const s of subs) {
    if (idSet.has(s.agentProfileId)) subCounts.set(s.agentProfileId, (subCounts.get(s.agentProfileId) ?? 0) + 1)
    if (s.splitWithAgentId && idSet.has(s.splitWithAgentId)) subCounts.set(s.splitWithAgentId, (subCounts.get(s.splitWithAgentId) ?? 0) + 1)
  }

  // Recruits this month — agents whose profile was created this
  // month. Two paths:
  //   1. recruiterId is set and points to a roster agent → count
  //      under that agent. If the recruiter is flagged
  //      isLeadership, the count rolls up to the leadership bucket.
  //   2. recruiterId is null OR points to a non-roster agentCode →
  //      treated as a leadership-attributed recruit (mirrors how
  //      the org tree renders those under the Vick & Melinee
  //      synthetic node).
  const newAgents = await db.agentProfile.findMany({
    where: {
      isTest: false,
      createdAt: { gte: monthStart, lte: now },
    },
    select: { recruiterId: true },
  })

  const codeToId = new Map(roster.map(r => [r.agentCode, r.id]))
  const recruitCounts = new Map<string, number>()
  let leadershipRecruits = 0
  for (const a of newAgents) {
    if (a.recruiterId) {
      const id = codeToId.get(a.recruiterId)
      if (id) {
        if (leadershipIds.has(id)) {
          leadershipRecruits++
        } else {
          recruitCounts.set(id, (recruitCounts.get(id) ?? 0) + 1)
        }
        continue
      }
      // recruiterId points outside the active roster (e.g. inactive
      // alumni) — also fall into the leadership bucket.
    }
    leadershipRecruits++
  }

  const toRow = (id: string, value: number): AgentRow => {
    const agent = roster.find(r => r.id === id)!
    return { firstName: agent.firstName, lastName: agent.lastName, value, phase: agent.phase }
  }

  const TOP_N = 10
  // Production: leadership filtered out — they're staff, not on the
  // producer board.
  const submissions = [...subCounts.entries()]
    .filter(([id]) => !leadershipIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, value]) => toRow(id, value))

  // Recruits: build the per-agent list, then prepend the synthetic
  // 'Vick & Melinee · Minhas' row when there are leadership-
  // attributed recruits this month. Sorted so the leadership row
  // appears wherever its count places it (top medal if highest,
  // mid-list if not).
  const perAgentRecruits = [...recruitCounts.entries()]
    .map(([id, value]) => toRow(id, value))
  const recruitRows: AgentRow[] = [...perAgentRecruits]
  if (leadershipRecruits > 0) {
    recruitRows.push({
      firstName: 'Vick & Melinee',
      lastName: 'Minhas',
      value: leadershipRecruits,
      phase: 6,
    })
  }
  const recruits = recruitRows.sort((a, b) => b.value - a.value).slice(0, TOP_N)

  const totalSubmissions = [...subCounts.entries()]
    .filter(([id]) => !leadershipIds.has(id))
    .reduce((sum, [, v]) => sum + v, 0)
  const activeSubmitters = [...subCounts.keys()].filter(id => !leadershipIds.has(id)).length
  // Suppress unused-var lint on leadershipCodes (kept for clarity /
  // future use if we need to filter by code instead of id).
  void leadershipCodes

  // Phase movers stream: drop leadership so Vick / Melinee don't
  // surface as 'phase movers' when their AgentProfiles get edited.
  const agents = roster
    .filter(r => !r.isLeadership)
    .map(r => ({
      agentCode: r.agentCode,
      firstName: r.firstName,
      lastName: r.lastName,
      phase: r.phase,
    }))

  return NextResponse.json({
    monthLabel, submissions, recruits, agents, totalSubmissions, activeSubmitters,
  } satisfies SnapshotResponse)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' })
}
