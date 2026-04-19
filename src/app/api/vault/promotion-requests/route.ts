import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const requests = await db.coordinatorRequest.findMany({
    where: {
      phaseItemKey: 'associate_promotion',
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
    include: {
      agentProfile: {
        select: { id: true, firstName: true, lastName: true, agentCode: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    requests: requests.map(r => ({
      id: r.id,
      agentName: `${r.agentProfile.firstName} ${r.agentProfile.lastName}`,
      agentCode: r.agentProfile.agentCode,
      agentId: r.agentProfile.id,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
    })),
  })
}
