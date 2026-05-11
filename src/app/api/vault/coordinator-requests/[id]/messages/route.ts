// LC / admin posts a reply on a coordinator-request thread without
// marking the request resolved. Resolves a real workflow gap: the LC
// often needs to respond ("here's the link, schedule when you can")
// while the underlying task is still pending. The "Mark Resolved"
// action stays separate (PATCH on the parent request) for when the
// agent has actually completed the step.
//
// Side effect: bumps status from OPEN to IN_PROGRESS so the request
// sidebar reflects "coordinator has engaged" on first reply.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

interface PostBody {
  body?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const { body } = await req.json() as PostBody
  if (typeof body !== 'string' || body.trim().length === 0) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }
  if (body.length > 4000) {
    return NextResponse.json({ error: 'Message too long (4000 char max)' }, { status: 400 })
  }

  const existing = await db.coordinatorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      topic: true,
      agentProfile: { select: { firstName: true, lastName: true, agentCode: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sender = session!.user as { id?: string; role?: string; name?: string; email?: string }
  const fromName = sender.name ?? sender.email ?? 'Licensing Coordinator'
  const fromRole = sender.role === 'admin' ? 'admin' : 'licensing_coordinator'

  // Append message + bump status if still OPEN. Single transaction so
  // the read-back reflects both writes atomically.
  const [, updated] = await db.$transaction([
    db.coordinatorMessage.create({
      data: {
        requestId: id,
        fromRole,
        fromUserId: sender.id ?? '',
        fromName,
        body: body.trim(),
      },
    }),
    db.coordinatorRequest.update({
      where: { id },
      data: existing.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {},
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        agentProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentCode: true,
            phone: true,
            phase: true,
            licenseNumber: true,
            npn: true,
            examDate: true,
            state: true,
            agentUser: { select: { email: true } },
          },
        },
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
  ])

  // Admin-channel ping so the team sees the LC reply in the activity
  // feed alongside status moves and new tickets.
  if (existing.agentProfile) {
    const { pingTicketStaffReply } = await import('@/lib/coordinator-discord')
    pingTicketStaffReply({
      requestId: id,
      agent: existing.agentProfile,
      topic: existing.topic,
      reply: body.trim(),
      actorName: fromName,
    }).catch(err => console.warn('[coordinator-messages POST staff] admin ping failed:', err))
    // Dedicated LC-activity channel mirror, so the team has a clean
    // 'who did what in the licensing pipeline' feed separate from the
    // broader admin channel.
    const { logTicketReply } = await import('@/lib/lc-activity')
    logTicketReply({
      requestId: id,
      agent: existing.agentProfile,
      topic: existing.topic,
      reply: body.trim(),
      actor: { id: sender.id ?? '', name: fromName, role: (sender.role as 'admin' | 'licensing_coordinator' | 'ADMIN' | 'LICENSING_COORDINATOR') ?? 'admin' },
    }).catch(err => console.warn('[coordinator-messages POST staff] lc-activity failed:', err))
  }

  return NextResponse.json({ request: updated })
}
