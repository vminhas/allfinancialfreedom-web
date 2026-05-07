import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { createNotification } from '@/lib/notify'

const VALID_STATUSES = new Set(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CLOSED'])

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const feedback = await db.agentFeedback.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      agentProfile: {
        select: { firstName: true, lastName: true, agentCode: true, phase: true },
      },
    },
    take: 200,
  })

  return NextResponse.json({ feedback })
}

// PATCH a feedback row. After the threading refactor this only
// handles workflow transitions (status + the legacy `read` flag).
// Replies and internal notes go through the per-feedback /notes
// endpoints, which fire their own notifications.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    status?: string
    read?: boolean
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await db.agentFeedback.findUnique({
    where: { id: body.id },
    include: {
      agentProfile: { select: { id: true, firstName: true, discordUserId: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status
    // First move off OPEN -> stamp reviewedAt + flip read flag.
    if (body.status !== 'OPEN' && existing.status === 'OPEN') {
      data.reviewedAt = new Date()
      data.read = true
    }
    if (body.status === 'CLOSED' && existing.status !== 'CLOSED') {
      data.closedAt = new Date()
    }
    // Reopening clears the closedAt so the timeline reads truthfully.
    if (body.status !== 'CLOSED' && existing.status === 'CLOSED') {
      data.closedAt = null
    }
  }
  if (body.read !== undefined) data.read = body.read

  const updated = await db.agentFeedback.update({ where: { id: body.id }, data })

  // Notify on status transitions. Reply notifications come from the
  // /notes POST handlers themselves so the admin doesn't have to make
  // two calls to send a reply with a status change.
  const statusChanged = body.status !== undefined && body.status !== existing.status
  if (statusChanged) {
    fireFeedbackNotification({
      agentProfileId: existing.agentProfile.id,
      firstName: existing.agentProfile.firstName,
      feedbackId: existing.id,
      newStatus: body.status ?? existing.status,
      messagePreview: existing.message.slice(0, 120),
    }).catch(err => console.warn('[feedback PATCH] notification failed:', err))

    pingAdminFeedbackUpdate({
      agentProfileId: existing.agentProfile.id,
      oldStatus: existing.status,
      newStatus: body.status ?? existing.status,
      originalMessagePreview: existing.message.slice(0, 200),
      actorName: (session!.user as { name?: string } | undefined)?.name ?? 'Admin',
    }).catch(err => console.warn('[feedback PATCH] admin ping failed:', err))
  }

  return NextResponse.json({ ok: true, feedback: updated })
}

async function pingAdminFeedbackUpdate(args: {
  agentProfileId: string
  oldStatus: string
  newStatus: string
  originalMessagePreview: string
  actorName: string
}): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_ADMIN_CHANNEL_ID) return
  const profile = await db.agentProfile.findUnique({
    where: { id: args.agentProfileId },
    select: { firstName: true, lastName: true, agentCode: true },
  })
  if (!profile) return
  const { sendChannelMessage } = await import('@/lib/discord')
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'

  const STATUS_COLOR: Record<string, number> = {
    OPEN: 0x9B6DFF,
    ACKNOWLEDGED: 0x60A5FA,
    IN_PROGRESS: 0xC9A96E,
    CLOSED: 0x4ADE80,
  }

  await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
    embeds: [{
      title: `📋 Feedback ${args.oldStatus} → ${args.newStatus}`,
      description: args.originalMessagePreview + (args.originalMessagePreview.length >= 200 ? '...' : ''),
      color: STATUS_COLOR[args.newStatus] ?? 0x9BB0C4,
      fields: [
        { name: 'From', value: `${profile.firstName} ${profile.lastName} (${profile.agentCode})`, inline: true },
        { name: 'By', value: args.actorName, inline: true },
      ],
      footer: { text: 'AFF Concierge · /vault/feedback' },
      url: `${baseUrl}/vault/feedback`,
      timestamp: new Date().toISOString(),
    }],
  })
}

interface NotifyArgs {
  agentProfileId: string
  firstName: string
  feedbackId: string
  newStatus: string
  messagePreview: string
}

// Routes a feedback status change through the unified notification
// helper, which writes the in-app row (powering the SSE stream +
// bell-icon inbox) and fans out a Discord DM in the same call.
// Reply-style notifications are emitted by the per-feedback /notes
// POST endpoints — those carry the actual reply text.
async function fireFeedbackNotification(args: NotifyArgs): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return

  const STATUS_COPY: Record<string, { title: string; description: string; color: number }> = {
    ACKNOWLEDGED: {
      title: '👀 Your feedback was reviewed',
      description: `Thanks for sending this in, ${args.firstName}. The team has read it and is thinking it through. We'll update you when it moves forward.`,
      color: 0x60A5FA,
    },
    IN_PROGRESS: {
      title: '🛠️ We\'re working on your feedback',
      description: `Heads up, ${args.firstName} - we're actively building or fixing what you flagged. Stay tuned.`,
      color: 0xC9A96E,
    },
    CLOSED: {
      title: '✅ Your feedback has a resolution',
      description: `Hey ${args.firstName}, we've closed out the feedback you sent in. Open the portal to see the team's notes.`,
      color: 0x4ADE80,
    },
    OPEN: {
      title: '↩️ Your feedback was reopened',
      description: `${args.firstName}, we reopened your feedback for another look.`,
      color: 0x9B6DFF,
    },
  }

  const copy = STATUS_COPY[args.newStatus]
  if (!copy) return

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Your message', value: args.messagePreview + (args.messagePreview.length >= 120 ? '...' : '') },
  ]

  await createNotification({
    recipientAgentProfileId: args.agentProfileId,
    kind: 'feedback.status_changed',
    subjectType: 'feedback',
    subjectId: args.feedbackId,
    title: copy.title,
    body: copy.description,
    linkUrl: '/agents#feedback',
    color: copy.color,
    discord: {
      title: copy.title,
      description: copy.description,
      color: copy.color,
      fields,
    },
  })
}
