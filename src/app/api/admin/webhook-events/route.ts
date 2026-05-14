import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'

// GET /api/admin/webhook-events
//
// Returns the 50 most recent inbound GHL webhook hits + a small
// "per-event latest" map for the connection-verification surface in
// /vault/email-templates. The "latest" map is what powers the
// per-event-type "Last received N minutes ago" badge so an admin can
// confirm GHL is actually pinging us without scrolling the log.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const [recent, perEventRaw] = await Promise.all([
    db.ghlWebhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 50,
    }),
    db.ghlWebhookEvent.groupBy({
      by: ['eventType'],
      _max: { receivedAt: true },
      _count: { _all: true },
    }),
  ])

  const latestByEvent: Record<string, { lastReceivedAt: string; count: number }> = {}
  for (const row of perEventRaw) {
    latestByEvent[row.eventType] = {
      lastReceivedAt: row._max.receivedAt?.toISOString() ?? '',
      count: row._count._all,
    }
  }

  return NextResponse.json({
    recent: recent.map(e => ({
      id: e.id,
      eventType: e.eventType,
      contactId: e.contactId,
      contactEmail: e.contactEmail,
      receivedAt: e.receivedAt.toISOString(),
      templatesFired: e.templatesFired,
      templatesSkipped: e.templatesSkipped,
      error: e.error,
    })),
    latestByEvent,
  })
}
