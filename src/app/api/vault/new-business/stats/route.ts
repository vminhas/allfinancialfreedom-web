import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)

  const [pending, issuedThisMonth, declinedThisMonth, pointsAgg] = await Promise.all([
    db.newBusinessSubmission.count({ where: { status: 'PENDING' } }),
    db.newBusinessSubmission.count({
      where: { status: 'ISSUED', issuedDate: { gte: monthStart } },
    }),
    db.newBusinessSubmission.count({
      where: { status: 'DECLINED', updatedAt: { gte: monthStart } },
    }),
    db.newBusinessSubmission.aggregate({
      where: { status: 'ISSUED', issuedDate: { gte: yearStart } },
      _sum: { points: true },
    }),
  ])

  return NextResponse.json({
    pending,
    issuedThisMonth,
    declinedThisMonth,
    pointsYtd: pointsAgg._sum.points ?? 0,
  })
}
