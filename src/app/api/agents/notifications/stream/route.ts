import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Server-Sent Events stream of an agent's notifications.
//
// One open connection per logged-in user. The agent portal mounts an
// EventSource against this URL on session boot; every subsequent
// notification (feedback response, policy comment, training reminder,
// announcement, etc.) lands here as an event with kind dispatch on
// the client.
//
// Real-time backing for v1 is "the SSE handler polls the notifications
// table every 2s and pushes new rows." That's invisible to the client
// (it sees server-pushed events with sub-2s latency) and avoids
// standing up a Redis/KV pub/sub layer for AFF's scale. We can swap
// to LISTEN/NOTIFY or Vercel KV later without touching the client.
//
// Vercel function-duration cap: nodejs serverless functions max out
// around 5–15 minutes depending on plan. We set maxDuration so the
// stream stays open as long as the platform allows; client
// auto-reconnects via standard EventSource semantics when it drops,
// and ?since=<iso> resumes from the right point on reconnect.

export const runtime = 'nodejs'
export const maxDuration = 300  // 5 min; client reconnects after.

const POLL_MS = 2000
const HEARTBEAT_MS = 30000

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return new Response('Unauthorized', { status: 401 })
  }

  const email = (session.user as { email?: string } | undefined)?.email
  if (typeof email !== 'string' || email.length === 0) {
    return new Response('Bad session', { status: 401 })
  }

  const me = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!me?.profile) return new Response('Profile not found', { status: 404 })
  const profileId = me.profile.id

  // Resume cursor: client passes ?since=<iso> on reconnect to pick up
  // any rows persisted while it was disconnected. Default to "now"
  // for a fresh connection — historic notifications come through the
  // separate list endpoint.
  const sinceParam = req.nextUrl.searchParams.get('since')
  let lastSent = sinceParam ? new Date(sinceParam) : new Date()
  if (Number.isNaN(lastSent.getTime())) lastSent = new Date()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)) } catch { /* closed */ }
      }

      // Hello so the client knows the connection is live.
      send(`event: hello\ndata: ${JSON.stringify({ profileId, since: lastSent.toISOString() })}\n\n`)

      // Heartbeat keeps reverse proxies / load balancers from reaping
      // an idle connection.
      const heartbeat = setInterval(() => {
        send(`: heartbeat\n\n`)
      }, HEARTBEAT_MS)

      // Tight poll loop. Cheap query (index on
      // recipientAgentProfileId + createdAt) so doing this every 2s
      // is fine even with hundreds of concurrent agents.
      const poll = setInterval(async () => {
        try {
          const fresh = await db.notification.findMany({
            where: {
              recipientAgentProfileId: profileId,
              createdAt: { gt: lastSent },
            },
            orderBy: { createdAt: 'asc' },
            take: 50,
          })
          for (const n of fresh) {
            send(`id: ${n.id}\nevent: notification\ndata: ${JSON.stringify(n)}\n\n`)
            lastSent = n.createdAt
          }
        } catch (err) {
          console.warn('[notifications/stream] poll failed:', err)
        }
      }, POLL_MS)

      const cleanup = () => {
        clearInterval(heartbeat)
        clearInterval(poll)
        try { controller.close() } catch { /* already closed */ }
      }
      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Disable Vercel's response buffering so events stream live.
      'X-Accel-Buffering': 'no',
    },
  })
}
