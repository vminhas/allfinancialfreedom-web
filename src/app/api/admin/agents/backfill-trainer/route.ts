import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/agents/backfill-trainer
//
// Finds every active agent whose `cft` field is null or blank, resolves
// their trainer by walking up the AgentProfile.recruiterId chain to the
// first CFT-qualified agent (phase >= 3 + not a referral partner, or
// isLeadership), and writes that name back to the `cft` column.
//
// Safe to run multiple times — only touches agents who still have no
// trainer set. Returns counts so the caller can show a summary.

async function resolveTrainerForCode(
  agentMap: Map<string, { agentCode: string; firstName: string; lastName: string; phase: number; isReferralPartner: boolean; isLeadership: boolean; recruiterId: string | null }>,
  recruiterCode: string,
  depth = 0,
): Promise<string | null> {
  if (depth > 15 || !recruiterCode) return null
  const agent = agentMap.get(recruiterCode.toLowerCase())
  if (!agent) return null
  const isCft = agent.isLeadership || (agent.phase >= 3 && !agent.isReferralPartner)
  if (isCft) return `${agent.firstName} ${agent.lastName}`
  if (!agent.recruiterId) return null
  return resolveTrainerForCode(agentMap, agent.recruiterId, depth + 1)
}

export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  // Load all active agents into a map keyed by lowercase agentCode for
  // fast chain-walking without N+1 queries.
  const all = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      phase: true,
      isReferralPartner: true,
      isLeadership: true,
      recruiterId: true,
      cft: true,
    },
  })

  const agentMap = new Map(all.map(a => [a.agentCode.toLowerCase(), a]))

  const missing = all.filter(a => !a.cft?.trim())
  let filled = 0
  let skipped = 0

  for (const agent of missing) {
    if (!agent.recruiterId) { skipped++; continue }
    const trainerName = await resolveTrainerForCode(agentMap, agent.recruiterId)
    if (!trainerName) { skipped++; continue }
    await db.agentProfile.update({ where: { id: agent.id }, data: { cft: trainerName } })
    filled++
  }

  return NextResponse.json({ filled, skipped, total: missing.length })
}
