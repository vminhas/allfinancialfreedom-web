// Discord celebration when a milestone is awarded. Used by both the
// review route (admin approves a pending submission) and the
// admin-initiated award route. Failures are non-fatal: a missing
// Discord token or channel ID just skips the post; the milestone is
// still recorded in the DB.
//
// Renders via the shared `buildAchievementEmbed` so the visual
// language stays consistent with the MILESTONE / PROMOTION / NEW
// RECRUIT card family. Elite Trainer is its own flavor (bespoke
// header label + warmer accent) because the team called it out
// specifically; everything else uses RECOGNITION.

import { MILESTONE_BY_KEY } from './milestones'
import { buildAchievementEmbed } from './discord-card'

interface CelebrateInput {
  milestoneKey: string
  agent: { firstName: string; lastName: string; preferredName?: string | null; agentCode?: string | null; avatarUrl?: string | null; discordUserId: string | null }
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

  const isElite = milestoneKey === ELITE_TRAINER_KEY
  const subline = isElite
    ? 'Recognized as an **Elite Trainer**. A fully certified team and a track record of developing producers. Congratulations from the entire AFF family.'
    : `Earned the **${def.label}** milestone. ${def.description}`

  const embed = buildAchievementEmbed({
    flavor: isElite ? 'ELITE_TRAINER' : 'RECOGNITION',
    protagonist: {
      firstName: agent.firstName,
      lastName: agent.lastName,
      preferredName: agent.preferredName,
      agentCode: agent.agentCode,
      avatarUrl: agent.avatarUrl,
    },
    subline,
    fields: isElite ? undefined : [
      { name: 'Milestone', value: def.label, inline: true },
    ],
  })

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
