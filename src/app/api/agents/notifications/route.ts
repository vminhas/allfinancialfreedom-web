import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET  /api/agents/notifications        — recent notifications + unread count
// POST /api/agents/notifications/read   — mark all unread as read
//
// Per-row mark-as-read lives at /api/agents/notifications/[id].
// The SSE stream at /stream is the live channel; this endpoint
// serves the inbox bell-icon dropdown's initial render.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = (session.user as { email?: string } | undefined)?.email
  if (typeof email !== 'string' || email.length === 0) {
    return NextResponse.json({ error: 'Bad session' }, { status: 401 })
  }
  const me = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!me?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200)

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { recipientAgentProfileId: me.profile.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    db.notification.count({
      where: { recipientAgentProfileId: me.profile.id, readAt: null },
    }),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

// POST /api/agents/notifications  → mark-all-as-read.
// Body is empty; this is a "Mark all read" button action.
export async function POST() {
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

  const now = new Date()
  await db.notification.updateMany({
    where: { recipientAgentProfileId: me.profile.id, readAt: null },
    data: { readAt: now },
  })
  return NextResponse.json({ ok: true })
}
