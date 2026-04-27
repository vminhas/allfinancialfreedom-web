import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/agents/[id]/call-reviews
// Returns recent reviews + aggregate stats for an agent.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const reviews = await db.callReview.findMany({
    where: { agentProfileId: id },
    orderBy: { reviewedAt: 'desc' },
    take: 30,
    include: {
      callLog: {
        select: {
          id: true,
          callDate: true,
          contactName: true,
          subject: true,
          transcriptText: true,
        },
      },
    },
  })

  if (reviews.length === 0) {
    return NextResponse.json({
      reviews: [],
      aggregate: null,
    })
  }

  // Aggregate stats
  const avgOverall = Math.round(reviews.reduce((s, r) => s + r.overallScore, 0) / reviews.length)
  const flaggedCount = reviews.filter(r => r.flaggedForCoaching).length
  const dims = ['opening', 'discovery', 'product', 'objections', 'closing', 'tone'] as const
  const avgRubric: Record<string, number> = {}
  for (const d of dims) {
    const vals = reviews.map(r => {
      const s = r.rubricScores as Record<string, number>
      return s[d] ?? 0
    })
    avgRubric[d] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  // 30-day trend: reviews within last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recent = reviews.filter(r => r.reviewedAt >= thirtyDaysAgo)
  const recentAvg = recent.length > 0
    ? Math.round(recent.reduce((s, r) => s + r.overallScore, 0) / recent.length)
    : null

  return NextResponse.json({
    reviews,
    aggregate: {
      totalReviews: reviews.length,
      avgOverall,
      avgRubric,
      flaggedCount,
      recentAvg,
    },
  })
}
