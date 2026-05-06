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

// PATCH a feedback row. Accepts:
//   status:           OPEN | ACKNOWLEDGED | IN_PROGRESS | CLOSED
//   responseToAgent:  text the agent will see (DM'd to Discord on change)
//   adminNotes:       admin-only context, not visible to agent
//   read:             legacy compat flag - auto-flipped when status != OPEN
//
// On status transitions we stamp reviewedAt (first move off OPEN) and
// closedAt (when status reaches CLOSED), and fire a Discord DM to the
// agent (if connected) so they get notified out-of-band.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    status?: string
    responseToAgent?: string | null
    adminNotes?: string | null
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
  if (body.responseToAgent !== undefined) data.responseToAgent = body.responseToAgent
  if (body.adminNotes !== undefined) data.adminNotes = body.adminNotes
  if (body.read !== undefined) data.read = body.read

  const updated = await db.agentFeedback.update({ where: { id: body.id }, data })

  // Out-of-band notification. We ping the agent on either:
  //   (a) a status change (OPEN → ACKNOWLEDGED / IN_PROGRESS / CLOSED), OR
  //   (b) a meaningful update to responseToAgent (the team replied or
  //       added more detail, even if status didn't move).
  // adminNotes-only edits never ping — that's an internal field.
  // Mercedes (D2161) flagged this on 2026-05-05: she wasn't getting
  // notified when an admin replied without changing status.
  const statusChanged = body.status !== undefined && body.status !== existing.status
  const responseChanged =
    body.responseToAgent !== undefined &&
    (body.responseToAgent ?? '').trim() !== (existing.responseToAgent ?? '').trim() &&
    (body.responseToAgent ?? '').trim().length > 0

  if (statusChanged || responseChanged) {
    fireFeedbackNotification({
      agentProfileId: existing.agentProfile.id,
      firstName: existing.agentProfile.firstName,
      feedbackId: existing.id,
      newStatus: body.status ?? existing.status,
      statusChanged,
      responseChanged,
      responseToAgent: body.responseToAgent ?? existing.responseToAgent,
      messagePreview: existing.message.slice(0, 120),
    }).catch(err => console.warn('[feedback PATCH] notification failed:', err))

    // Admin-side mirror of the agent-facing notification: status moves
    // and reply postings show up in the admin activity channel so the
    // team has a single feed of who-did-what across the feedback queue.
    // Internal-note edits never ping (handled above by the
    // statusChanged/responseChanged gate).
    pingAdminFeedbackUpdate({
      feedbackId: existing.id,
      agentProfileId: existing.agentProfile.id,
      oldStatus: existing.status,
      newStatus: body.status ?? existing.status,
      statusChanged,
      responseChanged,
      newResponse: body.responseToAgent ?? null,
      originalMessagePreview: existing.message.slice(0, 200),
      actorName: (session.user as { name?: string }).name ?? 'Admin',
    }).catch(err => console.warn('[feedback PATCH] admin ping failed:', err))
  }

  return NextResponse.json({ ok: true, feedback: updated })
}

async function pingAdminFeedbackUpdate(args: {
  feedbackId: string
  agentProfileId: string
  oldStatus: string
  newStatus: string
  statusChanged: boolean
  responseChanged: boolean
  newResponse: string | null
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
  const headline = args.statusChanged
    ? `📋 Feedback ${args.oldStatus} → ${args.newStatus}`
    : '💬 Reply posted to feedback'

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'From', value: `${profile.firstName} ${profile.lastName} (${profile.agentCode})`, inline: true },
    { name: 'By', value: args.actorName, inline: true },
  ]
  if (args.responseChanged && args.newResponse && args.newResponse.trim().length > 0) {
    const reply = args.newResponse.trim()
    fields.push({ name: 'Reply', value: reply.length > 300 ? reply.slice(0, 300) + '...' : reply })
  }

  await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
    embeds: [{
      title: headline,
      description: args.originalMessagePreview + (args.originalMessagePreview.length >= 200 ? '...' : ''),
      color: STATUS_COLOR[args.newStatus] ?? 0x9BB0C4,
      fields,
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
  statusChanged: boolean
  responseChanged: boolean
  responseToAgent: string | null
  messagePreview: string
}

// Routes a feedback update through the unified notification helper,
// which writes the in-app row (powering the SSE stream + bell-icon
// inbox) and fans out a Discord DM in the same call. Copy is
// intentionally warm so a "CLOSED, not pursuing" status doesn't
// read as a brush-off, and the response-only path uses different
// copy ("💬 The team replied") so the agent immediately knows
// what's new.
async function fireFeedbackNotification(args: NotifyArgs): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return

  const STATUS_COPY: Record<string, { title: string; description: string; color: number }> = {
    ACKNOWLEDGED: {
      title: '👀 Your feedback was reviewed',
      description: `Thanks for sending this in, ${args.firstName}. The team has read it and is thinking it through. We&apos;ll update you when it moves forward.`,
      color: 0x60A5FA,
    },
    IN_PROGRESS: {
      title: '🛠️ We\'re working on your feedback',
      description: `Heads up, ${args.firstName} - we&apos;re actively building or fixing what you flagged. Stay tuned.`,
      color: 0xC9A96E,
    },
    CLOSED: {
      title: '✅ Your feedback has a resolution',
      description: `Hey ${args.firstName}, we&apos;ve closed out the feedback you sent in. See the team&apos;s response below.`,
      color: 0x4ADE80,
    },
    OPEN: {
      title: '↩️ Your feedback was reopened',
      description: `${args.firstName}, we reopened your feedback for another look.`,
      color: 0x9B6DFF,
    },
  }

  // Pick copy: response-only updates get a distinct "the team replied"
  // template; status changes use their per-status template above.
  // If both happened in the same PATCH, the status copy wins (it's
  // the more meaningful workflow event).
  let copy = STATUS_COPY[args.newStatus]
  if (!args.statusChanged && args.responseChanged) {
    copy = {
      title: '💬 The team replied to your feedback',
      description: `${args.firstName}, there's a new response on the feedback you sent in. Open the agent portal to view the full thread.`,
      color: 0x9B6DFF,
    }
  }
  if (!copy) return

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Your message', value: args.messagePreview + (args.messagePreview.length >= 120 ? '...' : '') },
  ]
  if (args.responseToAgent && args.responseToAgent.trim().length > 0) {
    fields.push({ name: 'From the team', value: args.responseToAgent })
  }

  await createNotification({
    recipientAgentProfileId: args.agentProfileId,
    kind: args.statusChanged ? 'feedback.status_changed' : 'feedback.response',
    subjectType: 'feedback',
    subjectId: args.feedbackId,
    title: copy.title,
    body: args.responseToAgent && args.responseToAgent.trim().length > 0
      ? args.responseToAgent
      : copy.description,
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
