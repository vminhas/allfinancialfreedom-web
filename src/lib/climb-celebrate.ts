// Discord celebration when a Climb milestone fires. Mirrors the
// pattern in milestone-celebrate.ts but reads its title/description
// from the admin-configured ClimbMilestone row instead of the
// hardcoded MILESTONES array. Failures are non-fatal: a missing
// Discord token / channel just no-ops; the achievement row is still
// the source of truth.

import { db } from './db'
import { buildAchievementEmbed } from './discord-card'
import type { ClimbMilestone } from '@/generated/prisma/client'

const ANNOUNCEMENTS_FALLBACK = '1295044213590982724'

interface CalloutPayload {
  embedTitle?: string
  embedDescription?: string
}

export async function celebrateClimbAchievement(
  agentProfileId: string,
  milestone: ClimbMilestone,
  pointsAtAchievement: number,
): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return

  const agent = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true, discordUserId: true },
  })
  if (!agent) return

  const { sendChannelMessage } = await import('./discord')
  const channelId = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? ANNOUNCEMENTS_FALLBACK

  const payload = (milestone.rewardPayload ?? {}) as CalloutPayload

  // Default copy, override-able per-milestone via rewardPayload.
  const title = payload.embedTitle ?? milestone.title
  const description = payload.embedDescription ??
    (milestone.tagline
      ? `${milestone.tagline} (${pointsAtAchievement.toLocaleString()} lifetime points)`
      : `Just hit ${milestone.pointThreshold.toLocaleString()} points on the Climb.`)

  const subline = `**${title}.** ${description}`

  const embed = buildAchievementEmbed({
    flavor: 'RECOGNITION',
    protagonist: {
      firstName: agent.firstName,
      lastName: agent.lastName,
      agentCode: agent.agentCode,
      avatarUrl: agent.avatarUrl,
    },
    subline,
    fields: [
      { name: 'Milestone', value: milestone.title, inline: true },
      { name: 'Points', value: pointsAtAchievement.toLocaleString(), inline: true },
    ],
  })

  // Public announcement
  sendChannelMessage(channelId, { embeds: [embed] }).catch(() => {})

  // Personal DM
  if (agent.discordUserId) {
    fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: agent.discordUserId }),
    })
      .then(r => r.ok ? r.json() as Promise<{ id: string }> : null)
      .then(dm => {
        if (!dm) return
        return sendChannelMessage(dm.id, { embeds: [embed] })
      })
      .catch(() => {})
  }
}
