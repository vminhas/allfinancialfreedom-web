import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import {
  GATED_KEYS,
  approvePromotionRequest,
  rejectPromotionRequest,
} from '@/lib/promotion-approve'

// Admin-approval-gated phase items (the promotion queue). The
// phaseItemKey -> phase mapping + the approve/reject side effects live
// in lib/promotion-approve.ts so the LC inbox button and the Discord
// promo-approve button share one code path.
//
// associate_promotion (Phase 2): bumps title to Senior Associate.
// emd_signoff (Phase 3): EMD signs off CFT designation.
// md_promotion (Phase 4): Marketing Director.
// emd_promotion (Phase 5): EMD.
// nvp_promotion (Phase 6): NVP.

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
      phaseItemKey: r.phaseItemKey,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // Licensing coordinators work the inbox these requests land in, so
  // they can approve/decline promotions directly (not admin-only).
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { requestId, action } = await req.json() as {
    requestId: string
    action: 'approve' | 'reject'
  }
  if (!requestId || !action) {
    return NextResponse.json({ error: 'requestId and action required' }, { status: 400 })
  }

  const result = action === 'approve'
    ? await approvePromotionRequest(requestId)
    : await rejectPromotionRequest(requestId)

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 400 })
  }
  return NextResponse.json({
    ok: true,
    status: action === 'approve' ? 'approved' : 'rejected',
    agentName: result.agentName,
    label: result.label,
  })
}
