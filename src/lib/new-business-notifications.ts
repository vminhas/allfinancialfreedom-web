import type { PolicyType } from '@/generated/prisma/client'

const POLICY_LABEL: Record<PolicyType, string> = {
  TERM: 'Term',
  WHOLE_LIFE: 'Whole Life',
  IUL: 'IUL',
  ANNUITY: 'Annuity',
  DISABILITY: 'Disability',
  LTC: 'LTC',
  OTHER: 'Other',
}

export function policyTypeLabel(t: PolicyType): string {
  return POLICY_LABEL[t]
}

interface SubmittedArgs {
  agentName: string
  policyType: PolicyType
  carrier: string
  clientName: string
  points: number | null
}
export async function notifySubmitted(args: SubmittedArgs): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return

  const embed = {
    title: 'New Business Submission',
    description: [
      `**${args.agentName}** submitted ${policyTypeLabel(args.policyType)} for **${args.clientName}**`,
      `Carrier: ${args.carrier}${args.points != null ? ` · ${args.points} points` : ''}`,
      '',
      '_Awaiting licensing coordinator review_',
    ].join('\n'),
    color: 0xC9A96E,
    timestamp: new Date().toISOString(),
    footer: { text: 'AFF Concierge · New Business' },
  }

  if (process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const { sendChannelMessage } = await import('@/lib/discord')
    await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, { embeds: [embed] }).catch(() => {})
  }

  // DM every licensing coordinator who linked Discord. The channel
  // post above keeps the team in the loop; the DM makes sure the
  // people who actually have to action this see it on their phone.
  const { dmLicensingCoordinators } = await import('./staff-discord')
  dmLicensingCoordinators(embed).catch(() => {})
}

async function dmAgent(discordUserId: string, embed: Record<string, unknown>): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: discordUserId }),
  })
  if (!dmRes.ok) return
  const dm = await dmRes.json() as { id: string }
  const { sendChannelMessage } = await import('@/lib/discord')
  await sendChannelMessage(dm.id, { embeds: [embed as never] }).catch(() => {})
}

interface IssuedArgs {
  agentDiscordUserId: string | null
  agentName: string
  agentFirstName: string
  agentLastName: string
  agentCode: string
  agentAvatarUrl: string | null
  clientName: string
  carrier: string
  policyType: PolicyType
}
export async function notifyIssued(args: IssuedArgs): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  const { sendChannelMessage } = await import('@/lib/discord')
  const { buildAchievementEmbed } = await import('@/lib/discord-card')

  // Public POLICY ISSUED card. Goes to announcements (a producing-agent
  // win is worth showing to the team, not just the LC queue) with a
  // fallback to admin channel only if announcements isn't configured.
  const card = buildAchievementEmbed({
    flavor: 'POLICY_ISSUED',
    protagonist: {
      firstName: args.agentFirstName,
      lastName: args.agentLastName,
      agentCode: args.agentCode,
      avatarUrl: args.agentAvatarUrl,
    },
    subline: `Helped a new family. **${args.clientName}**'s policy is in force.`,
    fields: [
      { name: 'Client',  value: args.clientName, inline: true },
      { name: 'Carrier', value: args.carrier, inline: true },
      { name: 'Product', value: policyTypeLabel(args.policyType), inline: true },
    ],
  })

  const channelId = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? process.env.DISCORD_ADMIN_CHANNEL_ID
  if (channelId) {
    await sendChannelMessage(channelId, { embeds: [card] }).catch(() => {})
  }

  // DM the agent the same card so it lands in their inbox too.
  if (args.agentDiscordUserId) {
    await dmAgent(args.agentDiscordUserId, card as unknown as Record<string, unknown>).catch(() => {})
  }
}

interface DeclinedArgs {
  agentDiscordUserId: string | null
  clientName: string
  carrier: string
  reason: string | null
}
export async function notifyDeclined(args: DeclinedArgs): Promise<void> {
  if (!args.agentDiscordUserId) return
  await dmAgent(args.agentDiscordUserId, {
    title: 'Application Declined',
    description: [
      `${args.clientName}'s application with ${args.carrier} was declined.`,
      args.reason ? `\nReason: ${args.reason}` : '',
      '\nSee notes from the licensing coordinator on the submission.',
    ].join(''),
    color: 0xF59E0B,
  }).catch(() => {})
}
