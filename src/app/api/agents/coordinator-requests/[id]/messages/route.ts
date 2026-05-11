// Agent replies on a coordinator-request thread. Mirrors the LC-side
// /vault/coordinator-requests/[id]/messages endpoint. Used by the
// agent-side request modal to send a follow-up question or ack a
// reply without changing the request status.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

interface PostBody {
  body?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error

  const { id } = await params
  const { body } = await req.json() as PostBody
  if (typeof body !== 'string' || body.trim().length === 0) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }
  if (body.length > 4000) {
    return NextResponse.json({ error: 'Message too long (4000 char max)' }, { status: 400 })
  }

  // Ownership check: the request must belong to the calling agent.
  const existing = await db.coordinatorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      agentProfileId: true,
      topic: true,
      assignedToId: true,
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.agentProfileId !== identity.profileId) {
    return NextResponse.json({ error: 'Not your request' }, { status: 403 })
  }

  const profile = await db.agentProfile.findUnique({
    where: { id: identity.profileId },
    select: { firstName: true, lastName: true, agentCode: true },
  })
  const fromName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Agent'

  const updated = await db.coordinatorRequest.update({
    where: { id },
    data: {
      messages: {
        create: {
          fromRole: 'agent',
          fromUserId: identity.profileId,
          fromName,
          body: body.trim(),
        },
      },
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  // Admin-channel ping symmetric with the LC-reply path so the team
  // sees both sides of the ticket conversation in one feed.
  if (profile) {
    const { pingTicketAgentReply } = await import('@/lib/coordinator-discord')
    pingTicketAgentReply({
      requestId: id,
      agent: { firstName: profile.firstName, lastName: profile.lastName, agentCode: profile.agentCode },
      topic: existing.topic,
      reply: body.trim(),
      assignedToAdminId: existing.assignedToId ?? null,
    }).catch(err => console.warn('[coordinator-messages POST agent] admin ping failed:', err))
  }

  return NextResponse.json({ request: updated })
}
