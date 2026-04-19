import { NextRequest, NextResponse } from 'next/server'
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
        select: { id: true, firstName: true, lastName: true, agentCode: true, phase: true },
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
      agentPhase: r.agentProfile.phase,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { requestId, action } = await req.json() as { requestId: string; action: 'approve' | 'reject' }

  if (!requestId || !action) {
    return NextResponse.json({ error: 'requestId and action required' }, { status: 400 })
  }

  const request = await db.coordinatorRequest.findUnique({
    where: { id: requestId },
    include: { agentProfile: { select: { id: true } } },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'approve') {
    await db.$transaction([
      db.coordinatorRequest.update({
        where: { id: requestId },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'Promotion approved' },
      }),
      db.phaseItem.upsert({
        where: {
          agentProfileId_phase_itemKey: {
            agentProfileId: request.agentProfileId,
            phase: 2,
            itemKey: 'associate_promotion',
          },
        },
        create: {
          agentProfileId: request.agentProfileId,
          phase: 2,
          itemKey: 'associate_promotion',
          completed: true,
          completedAt: new Date(),
        },
        update: { completed: true, completedAt: new Date() },
      }),
    ])

    return NextResponse.json({ ok: true, status: 'approved' })
  }

  await db.coordinatorRequest.update({
    where: { id: requestId },
    data: { status: 'CLOSED', resolvedAt: new Date(), resolutionNote: 'Promotion request declined' },
  })

  return NextResponse.json({ ok: true, status: 'rejected' })
}
