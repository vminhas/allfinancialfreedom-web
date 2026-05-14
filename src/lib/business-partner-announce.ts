import { buildAchievementEmbed } from './discord-card'
import { sendChannelMessage } from './discord'

interface BPAnnounceArgs {
  agentFirstName: string
  agentLastName: string
  agentPreferredName?: string | null
  agentCode: string
  agentAvatarUrl: string | null
  bpName: string
}

export async function announceBPWelcome(args: BPAnnounceArgs): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return

  const channelId = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID
  if (!channelId) return

  const embed = buildAchievementEmbed({
    flavor: 'NEW_BUSINESS_PARTNER',
    protagonist: {
      firstName: args.agentFirstName,
      lastName: args.agentLastName,
      preferredName: args.agentPreferredName,
      agentCode: args.agentCode,
      avatarUrl: args.agentAvatarUrl,
    },
    subline: `Added **${args.bpName}** as a Business Partner`,
  })

  const msg = await sendChannelMessage(channelId, {
    content: '@everyone',
    embeds: [embed],
    allowedMentions: { parse: ['everyone'] },
  })

  // Seed a 👋 reaction so teammates know to welcome them
  await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent('👋')}/@me`,
    {
      method: 'PUT',
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    }
  ).catch(() => {})
}
