import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { parseRangeFromSearch, prismaDateClause } from '@/lib/time-range'
import type { Prisma } from '@/generated/prisma/client'

// KPIs for /vault/new-business. Pending / Assigned-to-me / Unassigned are
// "right now" snapshots and ignore the date range. Issued / Declined / Points
// filter by the selected range, anchored on issuedDate (or updatedAt for
// declined since we don't track a declinedAt column).
//
// All counts respect the optional `assignment` filter so the KPIs stay in
// sync with the table — except the assigned-counts themselves which are
// always relative to the current viewer.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const { from, to } = parseRangeFromSearch(searchParams)
  const dateClause = prismaDateClause(from, to)
  const assignment = searchParams.get('assignment')
  const selfId = (session!.user as { id?: string }).id

  const assignmentClause: Prisma.NewBusinessSubmissionWhereInput = {}
  if (assignment === 'me' && selfId) assignmentClause.assignedToId = selfId
  else if (assignment === 'unassigned') assignmentClause.assignedToId = null
  else if (assignment) assignmentClause.assignedToId = assignment

  const [pending, assignedToMe, unassigned, issued, declined, pointsAgg] = await Promise.all([
    db.newBusinessSubmission.count({ where: { status: 'PENDING', ...assignmentClause } }),
    selfId
      ? db.newBusinessSubmission.count({ where: { assignedToId: selfId, status: 'PENDING' } })
      : Promise.resolve(0),
    db.newBusinessSubmission.count({ where: { assignedToId: null, status: 'PENDING' } }),
    db.newBusinessSubmission.count({
      where: { status: 'ISSUED', ...assignmentClause, ...(dateClause ? { issuedDate: dateClause } : {}) },
    }),
    db.newBusinessSubmission.count({
      where: { status: 'DECLINED', ...assignmentClause, ...(dateClause ? { updatedAt: dateClause } : {}) },
    }),
    db.newBusinessSubmission.aggregate({
      where: { status: 'ISSUED', ...assignmentClause, ...(dateClause ? { issuedDate: dateClause } : {}) },
      _sum: { points: true },
    }),
  ])

  return NextResponse.json({
    pending,
    assignedToMe,
    unassigned,
    issued,
    declined,
    points: pointsAgg._sum.points ?? 0,
    range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
  })
}
