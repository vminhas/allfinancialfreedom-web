import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { AT_RISK_THRESHOLDS, PHASE_ITEMS } from '@/lib/agent-constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [profiles, phaseItemCounts, recentLogins] = await Promise.all([
    db.agentProfile.findMany({
      select: {
        phase: true,
        status: true,
        phaseStartedAt: true,
        icaDate: true,
        phaseItems: { select: { phase: true, completed: true } },
      },
    }),
    db.phaseItem.groupBy({
      by: ['phase', 'completed'],
      _count: true,
    }),
    db.agentUser.count({
      where: { lastLoginAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
  ])

  const totalAgents = profiles.length
  const activeAgents = profiles.filter(p => p.status === 'ACTIVE').length
  const inactiveAgents = totalAgents - activeAgents

  // Phase distribution
  const phaseDistribution = [1, 2, 3, 4, 5].map(phase => {
    const inPhase = profiles.filter(p => p.phase === phase)
    return {
      phase,
      count: inPhase.length,
      activeCount: inPhase.filter(p => p.status === 'ACTIVE').length,
    }
  })

  // At-risk count
  let atRiskCount = 0
  let behindCount = 0
  for (const p of profiles) {
    if (p.status !== 'ACTIVE' || !p.phaseStartedAt) continue
    const threshold = AT_RISK_THRESHOLDS[p.phase]
    if (!threshold) continue
    const totalItems = PHASE_ITEMS[p.phase]?.length ?? 0
    const completedItems = p.phaseItems.filter(i => i.phase === p.phase && i.completed).length
    const pct = totalItems > 0 ? completedItems / totalItems : 0
    const daysInPhase = Math.floor((Date.now() - p.phaseStartedAt.getTime()) / 86400000)
    if (daysInPhase > threshold.days * 1.5 && pct < threshold.minPct) atRiskCount++
    else if (daysInPhase > threshold.days && pct < threshold.minPct) behindCount++
  }

  // New this month
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const newThisMonth = profiles.filter(p => p.icaDate && p.icaDate >= oneMonthAgo).length

  return NextResponse.json({
    totalAgents,
    activeAgents,
    inactiveAgents,
    phaseDistribution,
    atRiskCount,
    behindCount,
    newThisMonth,
    activeLoginsLast30d: recentLogins,
  })
}
