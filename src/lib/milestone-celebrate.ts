// Discord celebration when a milestone is awarded. Used by both the
// review route (admin approves a pending submission) and the
// admin-initiated award route. Failures are non-fatal: a missing
// Discord token or channel ID just skips the post; the milestone is
// still recorded in the DB.

import { MILESTONE_BY_KEY } from './milestones'

interface CelebrateInput {
  milestoneKey: string
  agent: { firstName: string; lastName: string; discordUserId: string | null }
}

const ELITE_TRAINER_KEY = 'elite_trainer'

// The announcements channel default mirrors the one used for phase
// promotions (src/app/api/admin/agents/[id]/route.ts) so AFF
// celebrations all land in the same place.
const ANNOUNCEMENTS_FALLBACK = '1295044213590982724'

export async function celebrateMilestone({ milestoneKey, agent }: CelebrateInput): Promise<void> {
  const def = MILESTONE_BY_KEY[milestoneKey]
  if (!def) return
  if (!process.env.DISCORD_BOT_TOKEN) return

  const { sendChannelMessage } = await import('./discord')
  const channelId = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? ANNOUNCEMENTS_FALLBACK
  const fullName = `${agent.firstName} ${agent.lastName}`

  // Elite Trainer gets a bespoke embed because the team called it
  // out specifically. Other milestones share a templated embed.
  const embed = milestoneKey === ELITE_TRAINER_KEY
    ? {
        title: '✨ Elite Trainer ✨',
        description: [
          `**${fullName}** has been recognized as an **Elite Trainer**.`,
          '',
          'A fully certified team and a track record of developing producers. The kind of leader the rest of the room is being trained to become.',
          '',
          'Congratulations from the entire AFF family.',
        ].join('\n'),
        color: 0xC9A96E,
        footer: { text: 'All Financial Freedom · Elite Recognition' },
        timestamp: new Date().toISOString(),
      }
    : {
        title: `🏆 ${def.label}`,
        description: [
          `**${fullName}** just earned the **${def.label}** milestone.`,
          '',
          def.description,
        ].join('\n'),
        color: 0xC9A96E,
        footer: { text: 'All Financial Freedom · Recognition' },
        timestamp: new Date().toISOString(),
      }

  // Public announcement
  sendChannelMessage(channelId, { embeds: [embed] }).catch(() => {})

  // Personal DM to the agent (best-effort; needs them to be in the
  // server with mutual DMs allowed)
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
