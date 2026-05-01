import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/call-review/history
// Returns the calling admin's own review history, newest first.
// Per-admin scope: each admin only sees their own reviews so the
// coaching history reflects their own calls.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const adminUserId = (session.user as { id?: string }).id
  if (!adminUserId) {
    return NextResponse.json({ error: 'Missing admin user id' }, { status: 401 })
  }

  const rows = await db.adminCallReview.findMany({
    where: { adminUserId },
    orderBy: { reviewedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      contactName: true,
      callDate: true,
      reviewedAt: true,
      overallScore: true,
      rubricScores: true,
      summary: true,
      notes: true,
    },
  })

  // Trend: average overallScore across the user's last N reviews
  // versus the older slice so the UI can flash "+/- N points" easily.
  // Only computed when there are at least 6 rows so we don't show
  // noisy comparisons on small samples.
  const last5 = rows.slice(0, 5)
  const prev5 = rows.slice(5, 10)
  const trend = last5.length === 5 && prev5.length >= 3
    ? Math.round(
        last5.reduce((s, r) => s + r.overallScore, 0) / last5.length
        - prev5.reduce((s, r) => s + r.overallScore, 0) / prev5.length,
      )
    : null

  return NextResponse.json({
    reviews: rows.map(r => ({
      id: r.id,
      contactName: r.contactName,
      callDate: r.callDate.toISOString(),
      reviewedAt: r.reviewedAt.toISOString(),
      overallScore: r.overallScore,
      rubricScores: r.rubricScores,
      summary: r.summary,
      notes: r.notes,
    })),
    trend,
  })
}
