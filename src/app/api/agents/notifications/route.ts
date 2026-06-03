import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

// GET  /api/agents/notifications        — recent notifications + unread count
// POST /api/agents/notifications/read   — mark all unread as read
//
// Per-row mark-as-read lives at /api/agents/notifications/[id].
// The SSE stream at /stream is the live channel; this endpoint
// serves the inbox bell-icon dropdown's initial render.

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200)

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { recipientAgentProfileId: id.profileId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    db.notification.count({
      where: { recipientAgentProfileId: id.profileId, readAt: null },
    }),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

// POST /api/agents/notifications  → mark-all-as-read.
// Body is empty; this is a "Mark all read" button action.
export async function POST(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const now = new Date()
  await db.notification.updateMany({
    where: { recipientAgentProfileId: id.profileId, readAt: null },
    data: { readAt: now },
  })
  return NextResponse.json({ ok: true })
}
