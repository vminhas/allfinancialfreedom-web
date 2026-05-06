import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// PATCH /api/agents/notifications/[id]   — mark a single notification read
// DELETE /api/agents/notifications/[id]  — dismiss
//
// Auth: notification must belong to the calling agent's profile.
// We don't trust the incoming id alone — the where-clause includes
// recipientAgentProfileId so an agent can't read or delete someone
// else's notifications by guessing IDs.

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = (session.user as { email?: string } | undefined)?.email
  if (typeof email !== 'string') return NextResponse.json({ error: 'Bad session' }, { status: 401 })

  const me = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!me?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id } = await params
  await db.notification.updateMany({
    where: { id, recipientAgentProfileId: me.profile.id },
    data: { readAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = (session.user as { email?: string } | undefined)?.email
  if (typeof email !== 'string') return NextResponse.json({ error: 'Bad session' }, { status: 401 })

  const me = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!me?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id } = await params
  await db.notification.deleteMany({
    where: { id, recipientAgentProfileId: me.profile.id },
  })
  return NextResponse.json({ ok: true })
}
