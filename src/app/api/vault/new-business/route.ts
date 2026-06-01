import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { parseRangeFromSearch, prismaDateClause } from '@/lib/time-range'
import type { NewBusinessStatus, Prisma } from '@/generated/prisma/client'

const VALID_STATUSES: NewBusinessStatus[] = ['PENDING', 'PENDING_CARRIER', 'ISSUED', 'CONDITIONALLY_ISSUED', 'DECLINED', 'LAPSED', 'NOT_TAKEN', 'HOLD']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const agent = searchParams.get('agent')
  const carrier = searchParams.get('carrier')
  const policyType = searchParams.get('policyType')
  const search = searchParams.get('q')
  const assignment = searchParams.get('assignment') // 'me' | 'unassigned' | '<adminId>'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)))
  const { from, to } = parseRangeFromSearch(searchParams)
  const dateClause = prismaDateClause(from, to)
  const selfId = (session!.user as { id?: string }).id

  const where: Prisma.NewBusinessSubmissionWhereInput = {}
  if (statusParam) {
    const statuses = statusParam.split(',').filter(s => VALID_STATUSES.includes(s as NewBusinessStatus)) as NewBusinessStatus[]
    if (statuses.length > 0) where.status = { in: statuses }
  }
  if (agent) where.agentProfileId = agent
  if (carrier) where.carrier = { contains: carrier, mode: 'insensitive' }
  if (policyType) where.policyType = policyType as Prisma.NewBusinessSubmissionWhereInput['policyType']
  if (search) {
    where.OR = [
      { clientFirstName: { contains: search, mode: 'insensitive' } },
      { clientLastName: { contains: search, mode: 'insensitive' } },
      { policyNumber: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (assignment === 'me' && selfId) where.assignedToId = selfId
  else if (assignment === 'unassigned') where.assignedToId = null
  else if (assignment) where.assignedToId = assignment
  // Date range filters createdAt — i.e. when the submission was filed.
  if (dateClause) where.createdAt = dateClause

  const [total, submissions] = await Promise.all([
    db.newBusinessSubmission.count({ where }),
    db.newBusinessSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        agentProfile: { select: { id: true, firstName: true, lastName: true, agentCode: true } },
        splitWithAgent: { select: { firstName: true, lastName: true, agentCode: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { notes: true } },
      },
    }),
  ])
  return NextResponse.json({ submissions, total, page, pageSize })
}
