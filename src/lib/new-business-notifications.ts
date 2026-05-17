import type { PolicyType } from '@/generated/prisma/client'

// Fallback to the team-known announcements channel ID when the env
// var isn't set — matches the pattern in climb-celebrate /
// milestone-celebrate so the public-facing posts always land in the
// right place, regardless of whether DISCORD_ANNOUNCEMENTS_CHANNEL_ID
// is configured in this environment.
const ANNOUNCEMENTS_FALLBACK = '1295044213590982724'
const announcementsChannel = () =>
  process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ?? ANNOUNCEMENTS_FALLBACK

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

interface SplitPartnerMeta {
  firstName: string
  lastName: string
  agentCode: string
  discordUserId?: string | null
}

interface SubmittedArgs {
  agentName: string
  policyType: PolicyType
  carrier: string
  clientName: string
  points: number | null
  splitWith?: SplitPartnerMeta | null
}
export async function notifySubmitted(args: SubmittedArgs): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return

  const splitName = args.splitWith
    ? `${args.splitWith.firstName} ${args.splitWith.lastName}`.trim()
    : null
  const splitLine = splitName ? ` (split with **${splitName}**)` : ''

  // LC-facing embed for the admin channel — concrete + ops-flavored
  // because LCs are the ones who have to act on it.
  const adminEmbed = {
    title: 'New Business Submission',
    description: [
      `**${args.agentName}**${splitLine ? ` & ${splitName}` : ''} submitted ${policyTypeLabel(args.policyType)} for **${args.clientName}**`,
      `Carrier: ${args.carrier}${args.points != null ? ` · ${args.points} points` : ''}`,
      '',
      '_Awaiting licensing coordinator review_',
    ].join('\n'),
    color: 0xC9A96E,
    timestamp: new Date().toISOString(),
    footer: { text: 'AFF Concierge · New Business' },
  }

  const { sendChannelMessage } = await import('@/lib/discord')

  if (process.env.DISCORD_ADMIN_CHANNEL_ID) {
    await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, { embeds: [adminEmbed] }).catch(() => {})
  }

  // Subtle announcement-channel post. Same event, different audience:
  // builds hype with the team without the LC-ops phrasing. Smaller
  // visual weight than the POLICY ISSUED card (no @everyone, no
  // protagonist avatar) so the issued card is still the louder
  // moment of celebration when the policy lands.
  const teaserEmbed = {
    description: `✍️  **${args.agentName}**${splitLine} just submitted an application — ${args.carrier} ${policyTypeLabel(args.policyType)} for **${args.clientName}**.`,
    color: 0xC9A96E,
    timestamp: new Date().toISOString(),
    footer: { text: 'AFF Concierge · Application Submitted' },
  }
  await sendChannelMessage(announcementsChannel(), { embeds: [teaserEmbed] }).catch(() => {})

  // DM every licensing coordinator who linked Discord. The admin
  // channel keeps the team in the loop; the DM makes sure the
  // people who actually have to action this see it on their phone.
  const { dmLicensingCoordinators } = await import('./staff-discord')
  dmLicensingCoordinators(adminEmbed).catch(() => {})
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
  agentPreferredName?: string | null
  agentCode: string
  agentAvatarUrl: string | null
  clientName: string
  carrier: string
  policyType: PolicyType
  splitWith?: SplitPartnerMeta | null
}
export async function notifyIssued(args: IssuedArgs): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  const { sendChannelMessage } = await import('@/lib/discord')
  const { buildAchievementEmbed } = await import('@/lib/discord-card')

  const splitName = args.splitWith
    ? `${args.splitWith.firstName} ${args.splitWith.lastName}`.trim()
    : null

  // Public POLICY ISSUED card. Goes to announcements (a producing-
  // agent win is worth showing to the team, not just the LC queue).
  // When the policy was a split, the subline calls out the partner
  // and a Split field surfaces their code, so both writers get the
  // credit in front of the team.
  const fields = [
    { name: 'Client',  value: args.clientName, inline: true },
    { name: 'Carrier', value: args.carrier, inline: true },
    { name: 'Product', value: policyTypeLabel(args.policyType), inline: true },
  ]
  if (splitName && args.splitWith) {
    fields.push({ name: 'Split with', value: `${splitName} (${args.splitWith.agentCode})`, inline: true })
  }

  const subline = splitName
    ? `Helped a new family with **${splitName}**. **${args.clientName}**'s policy is in force.`
    : `Helped a new family. **${args.clientName}**'s policy is in force.`

  const card = buildAchievementEmbed({
    flavor: 'POLICY_ISSUED',
    protagonist: {
      firstName: args.agentFirstName,
      lastName: args.agentLastName,
      preferredName: args.agentPreferredName,
      agentCode: args.agentCode,
      avatarUrl: args.agentAvatarUrl,
    },
    subline,
    fields,
  })

  // POLICY ISSUED is always public hype — goes to announcements
  // regardless of env config, never the admin channel.
  await sendChannelMessage(announcementsChannel(), { embeds: [card] }).catch(() => {})

  // DM the writer + the split partner so both get the celebration in
  // their inbox.
  if (args.agentDiscordUserId) {
    await dmAgent(args.agentDiscordUserId, card as unknown as Record<string, unknown>).catch(() => {})
  }
  if (args.splitWith?.discordUserId) {
    await dmAgent(args.splitWith.discordUserId, card as unknown as Record<string, unknown>).catch(() => {})
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
