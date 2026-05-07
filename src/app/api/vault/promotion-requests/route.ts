import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// Admin-approval-gated phase items. Each entry maps the phaseItemKey
// the agent submits to the phase number it lives on. Adding a new
// gate is one row here + the matching `adminOnly + promotion-request`
// action in agent-constants.
//
// associate_promotion (Phase 1 → 2): the original CFT-Associate gate.
// emd_signoff (Phase 3 → 4): EMD reviews and signs off the agent's
//   CFT designation before they advance to MD focus. Added 2026-05-07
//   after Tracy's self-tick highlighted the missing gate.
const GATED_ITEMS: Record<string, number> = {
  associate_promotion: 2,
  emd_signoff: 3,
}
const GATED_KEYS = Object.keys(GATED_ITEMS)

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const requests = await db.coordinatorRequest.findMany({
    where: {
      phaseItemKey: { in: GATED_KEYS },
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
      // phaseItemKey lets the admin UI label the row by the SPECIFIC
      // gate (e.g. "EMD Sign-Off for Tracy" vs "Associate Promotion
      // for Tracy") instead of generic "promotion request."
      phaseItemKey: r.phaseItemKey,
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

  // Validate the request is for one of our gated items. Catches stale
  // CoordinatorRequest rows pointed at item keys we no longer recognize.
  const itemKey = request.phaseItemKey
  if (!itemKey || !(itemKey in GATED_ITEMS)) {
    return NextResponse.json({
      error: `Request is not for a gated promotion item (key: ${itemKey ?? 'null'})`,
    }, { status: 400 })
  }
  const phase = GATED_ITEMS[itemKey]

  if (action === 'approve') {
    await db.$transaction([
      db.coordinatorRequest.update({
        where: { id: requestId },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'Approved' },
      }),
      db.phaseItem.upsert({
        where: {
          agentProfileId_phase_itemKey: {
            agentProfileId: request.agentProfileId,
            phase,
            itemKey,
          },
        },
        create: {
          agentProfileId: request.agentProfileId,
          phase,
          itemKey,
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
    data: { status: 'CLOSED', resolvedAt: new Date(), resolutionNote: 'Declined' },
  })

  return NextResponse.json({ ok: true, status: 'rejected' })
}
