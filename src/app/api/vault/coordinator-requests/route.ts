import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole, getStaffRole } from '@/lib/permissions'

// GET /api/vault/coordinator-requests
// Filters: ?status=OPEN,IN_PROGRESS&assignedTo=me|unassigned|<id>&phaseItemKey=xxx
// Admins see everything; Licensing Coordinators see everything too (so they
// know what's in the queue), but the UI defaults them to "my requests".
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const selfId = (session!.user as { id?: string }).id

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const assignedTo = searchParams.get('assignedTo')
  const phaseItemKey = searchParams.get('phaseItemKey')

  const where: Record<string, unknown> = {}

  if (statusParam) {
    const statuses = statusParam.split(',').filter(Boolean)
    if (statuses.length > 0) where.status = { in: statuses }
  }

  if (assignedTo === 'me') {
    where.assignedToId = selfId
  } else if (assignedTo === 'unassigned') {
    where.assignedToId = null
  } else if (assignedTo) {
    where.assignedToId = assignedTo
  }

  if (phaseItemKey) where.phaseItemKey = phaseItemKey

  const requests = await db.coordinatorRequest.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      agentProfile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          agentCode: true,
          phone: true,
          phase: true,
          licenseNumber: true,
          npn: true,
          agentUser: { select: { email: true } },
        },
      },
      assignedTo: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  })

  return NextResponse.json({
    requests,
    viewerId: selfId,
    viewerRole: getStaffRole(session),
  })
}
