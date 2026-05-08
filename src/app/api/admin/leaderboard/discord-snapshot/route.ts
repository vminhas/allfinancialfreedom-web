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

  const roster = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true, agentCode: true, firstName: true, lastName: true, phase: true },
  })
  const rosterIds = roster.map(r => r.id)
  const idSet = new Set(rosterIds)

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

  // Recruits this month — agents whose profile was created this month, keyed by recruiter
  const newAgents = await db.agentProfile.findMany({
    where: {
      isTest: false,
      recruiterId: { not: null },
      createdAt: { gte: monthStart, lte: now },
    },
    select: { recruiterId: true },
  })

  const codeToId = new Map(roster.map(r => [r.agentCode, r.id]))
  const recruitCounts = new Map<string, number>()
  for (const a of newAgents) {
    if (!a.recruiterId) continue
    const id = codeToId.get(a.recruiterId)
    if (id) recruitCounts.set(id, (recruitCounts.get(id) ?? 0) + 1)
  }

  const toRow = (id: string, value: number): AgentRow => {
    const agent = roster.find(r => r.id === id)!
    return { firstName: agent.firstName, lastName: agent.lastName, value, phase: agent.phase }
  }

  const TOP_N = 10
  const submissions = [...subCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, value]) => toRow(id, value))

  const recruits = [...recruitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, value]) => toRow(id, value))

  const totalSubmissions = [...subCounts.values()].reduce((a, b) => a + b, 0)
  const activeSubmitters = subCounts.size

  const agents = roster.map(r => ({
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
