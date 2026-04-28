import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import type { NewBusinessStatus, Prisma } from '@/generated/prisma/client'

const VALID_STATUSES: NewBusinessStatus[] = ['PENDING', 'ISSUED', 'DECLINED', 'LAPSED', 'NOT_TAKEN']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const agent = searchParams.get('agent')
  const carrier = searchParams.get('carrier')
  const search = searchParams.get('q')

  const where: Prisma.NewBusinessSubmissionWhereInput = {}
  if (statusParam) {
    const statuses = statusParam.split(',').filter(s => VALID_STATUSES.includes(s as NewBusinessStatus)) as NewBusinessStatus[]
    if (statuses.length > 0) where.status = { in: statuses }
  }
  if (agent) where.agentProfileId = agent
  if (carrier) where.carrier = { contains: carrier, mode: 'insensitive' }
  if (search) {
    where.OR = [
      { clientFirstName: { contains: search, mode: 'insensitive' } },
      { clientLastName: { contains: search, mode: 'insensitive' } },
      { policyNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  const submissions = await db.newBusinessSubmission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      agentProfile: { select: { id: true, firstName: true, lastName: true, agentCode: true } },
      splitWithAgent: { select: { firstName: true, lastName: true, agentCode: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { notes: true } },
    },
  })
  return NextResponse.json({ submissions })
}
