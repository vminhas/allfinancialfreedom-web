import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/vault/licensing-agents/[id]/tevah
//   body: { subscribed: boolean }
//
// Flips AgentProfile.subscribedToTevahAt for the row identified by
// agentProfileId. This is the only checkbox the LC interacts with on
// the progress matrix; everything else there mirrors phase-item state
// the LC doesn't own.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { subscribed?: boolean }
  const subscribed = !!body.subscribed

  const updated = await db.agentProfile.update({
    where: { id },
    data: { subscribedToTevahAt: subscribed ? new Date() : null },
    select: { id: true, subscribedToTevahAt: true },
  })

  return NextResponse.json({
    id: updated.id,
    subscribedToTevahAt: updated.subscribedToTevahAt?.toISOString() ?? null,
  })
}
