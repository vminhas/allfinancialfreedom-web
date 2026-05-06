// Unified notification helper. Every feature that wants to ping an
// agent ("hey, the team replied to your feedback", "your colleague
// commented on the policy you're split on", "training in 15 min") goes
// through this single function. It:
//
//   1. Writes a row to the notifications table — picked up by the SSE
//      stream at /api/agents/notifications/stream and pushed to any
//      open client. Also feeds the in-app notification center.
//   2. Optionally fans out a Discord DM via the agent's discordUserId.
//   3. Best-effort throughout: a Discord outage doesn't block the
//      caller's primary flow (the in-app row still gets written so
//      the agent sees it next time they load the portal).
//
// New caller code should use this instead of opening DMs directly.

import { db } from '@/lib/db'

export interface NotificationDiscordPayload {
  title: string
  description: string
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
}

export interface CreateNotificationArgs {
  recipientAgentProfileId: string
  // Dotted event identifier, e.g. 'feedback.response',
  // 'feedback.status_changed', 'policy.comment', 'policy.split_added',
  // 'training.reminder', 'announcement.new', 'agent.promoted'.
  kind: string
  // Subject for deep linking. e.g. subjectType='feedback', subjectId=<row id>.
  subjectType: string
  subjectId?: string
  // In-app row payload.
  title: string
  body?: string
  linkUrl?: string
  color?: number
  // Optional Discord DM. When provided AND the recipient has
  // discordUserId on file, we open a DM channel and post the embed.
  // Skipped silently otherwise.
  discord?: NotificationDiscordPayload
}

export async function createNotification(args: CreateNotificationArgs) {
  // Persist first — this is the source of truth and what powers the
  // in-app inbox + SSE push. Discord DM is decorative on top.
  const note = await db.notification.create({
    data: {
      recipientAgentProfileId: args.recipientAgentProfileId,
      kind: args.kind,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      title: args.title,
      body: args.body,
      linkUrl: args.linkUrl,
      color: args.color,
    },
  })

  if (args.discord && process.env.DISCORD_BOT_TOKEN) {
    sendDiscordDm(args.recipientAgentProfileId, args.discord).catch(err =>
      console.warn('[notify] Discord DM failed:', err)
    )
  }

  return note
}

async function sendDiscordDm(agentProfileId: string, payload: NotificationDiscordPayload) {
  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { discordUserId: true },
  })
  if (!profile?.discordUserId) return

  // Open (or fetch existing) DM channel with the user.
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: profile.discordUserId }),
  })
  if (!dmRes.ok) return
  const dm = await dmRes.json() as { id: string }

  const { sendChannelMessage } = await import('@/lib/discord')
  await sendChannelMessage(dm.id, {
    embeds: [{
      title: payload.title,
      description: payload.description,
      color: payload.color ?? 0x9B6DFF,
      fields: payload.fields,
      footer: { text: 'AFF Concierge' },
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => { /* non-fatal */ })
}
