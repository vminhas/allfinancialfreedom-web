import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { AT_RISK_THRESHOLDS, PHASE_ITEMS } from '@/lib/agent-constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [profiles, phaseItemCounts, recentLogins, phaseDefs] = await Promise.all([
    db.agentProfile.findMany({
      select: {
        phase: true,
        status: true,
        phaseStartedAt: true,
        icaDate: true,
        phaseItems: { select: { phase: true, completed: true, itemKey: true } },
      },
    }),
    db.phaseItem.groupBy({
      by: ['phase', 'completed'],
      _count: true,
    }),
    db.agentUser.count({
      where: { lastLoginAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    // Live checklist definitions — the source of truth for phase totals
    // (mirrors the agent portal + trainer view). Fall back to static only
    // for a phase with no definitions yet.
    db.phaseItemDefinition.findMany({ select: { phase: true, itemKey: true } }),
  ])

  const liveKeysByPhase = new Map<number, Set<string>>()
  for (const d of phaseDefs) {
    let ks = liveKeysByPhase.get(d.phase)
    if (!ks) { ks = new Set(); liveKeysByPhase.set(d.phase, ks) }
    ks.add(d.itemKey)
  }
  // Total + completed for an agent's phase, counted against the live
  // checklist (deleted items can't inflate; static only as fallback).
  const phaseTotals = (phase: number, items: { phase: number; completed: boolean; itemKey: string }[]) => {
    const liveKeys = liveKeysByPhase.get(phase)
    const total = liveKeys ? liveKeys.size : (PHASE_ITEMS[phase]?.length ?? 0)
    const completed = items.filter(i => i.phase === phase && i.completed && (!liveKeys || liveKeys.has(i.itemKey))).length
    return { total, completed }
  }

  const totalAgents = profiles.length
  const activeAgents = profiles.filter(p => p.status === 'ACTIVE').length
  const inactiveAgents = totalAgents - activeAgents

  // Phase distribution
  const phaseDistribution = [1, 2, 3, 4, 5, 6].map(phase => {
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
    const { total: totalItems, completed: completedItems } = phaseTotals(p.phase, p.phaseItems)
    const pct = totalItems > 0 ? completedItems / totalItems : 0
    const daysInPhase = Math.floor((Date.now() - p.phaseStartedAt.getTime()) / 86400000)
    if (daysInPhase > threshold.days * 1.5 && pct < threshold.minPct) atRiskCount++
    else if (daysInPhase > threshold.days && pct < threshold.minPct) behindCount++
  }

  // Ready to promote count
  let readyToPromoteCount = 0
  for (const p of profiles) {
    // Cap at phase 6 — beyond that there's no 'next' phase to
    // promote to (Phase 6 is the terminal EMD-titled level until
    // higher ranks are added).
    if (p.status !== 'ACTIVE' || p.phase >= 6) continue
    const { total: totalItems, completed: completedItems } = phaseTotals(p.phase, p.phaseItems)
    if (totalItems > 0 && completedItems >= totalItems) readyToPromoteCount++
  }

  // New in the last 30 days. Rolling window because calendar-month
  // counts read 0 on the 1st (and were causing 'click the card, get
  // empty table' confusion). The label on the dashboard was updated
  // from 'NEW THIS MONTH' -> 'NEW (30 DAYS)' to match this window
  // honestly.
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const newThisMonth = profiles.filter(p => p.icaDate && p.icaDate >= thirtyDaysAgo).length

  return NextResponse.json({
    totalAgents,
    activeAgents,
    inactiveAgents,
    phaseDistribution,
    atRiskCount,
    behindCount,
    newThisMonth,
    activeLoginsLast30d: recentLogins,
    readyToPromoteCount,
  })
}
