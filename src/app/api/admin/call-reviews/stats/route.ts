import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/call-reviews/stats
// Team-wide rollup: avg score, flagged count, top improvers (30d vs prior 30d).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  const [recent, prior, flaggedCount, totalCount] = await Promise.all([
    db.callReview.findMany({
      where: { reviewedAt: { gte: thirtyDaysAgo } },
      select: { overallScore: true, agentProfileId: true },
    }),
    db.callReview.findMany({
      where: { reviewedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      select: { overallScore: true, agentProfileId: true },
    }),
    db.callReview.count({
      where: { flaggedForCoaching: true, discussedAt: null },
    }),
    db.callReview.count(),
  ])

  const avg = (arr: { overallScore: number }[]) =>
    arr.length === 0 ? null : Math.round(arr.reduce((s, r) => s + r.overallScore, 0) / arr.length)

  const teamAvg30d = avg(recent)
  const teamAvgPrior30d = avg(prior)
  const delta = teamAvg30d != null && teamAvgPrior30d != null ? teamAvg30d - teamAvgPrior30d : null

  // Per-agent averages over last 30d
  const perAgent30d = new Map<string, number[]>()
  for (const r of recent) {
    const arr = perAgent30d.get(r.agentProfileId) ?? []
    arr.push(r.overallScore)
    perAgent30d.set(r.agentProfileId, arr)
  }

  return NextResponse.json({
    teamAvg30d,
    teamAvgPrior30d,
    delta,
    flaggedOpenCount: flaggedCount,
    totalReviews: totalCount,
    reviewedAgents30d: perAgent30d.size,
  })
}
