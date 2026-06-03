import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

// PATCH /api/agents/notifications/[id]   — mark a single notification read
// DELETE /api/agents/notifications/[id]  — dismiss
//
// Auth: notification must belong to the calling agent's profile.
// We don't trust the incoming id alone — the where-clause includes
// recipientAgentProfileId so an agent can't read or delete someone
// else's notifications by guessing IDs.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error

  const { id } = await params
  await db.notification.updateMany({
    where: { id, recipientAgentProfileId: identity.profileId },
    data: { readAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error

  const { id } = await params
  await db.notification.deleteMany({
    where: { id, recipientAgentProfileId: identity.profileId },
  })
  return NextResponse.json({ ok: true })
}
