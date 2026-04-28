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
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_ADMIN_CHANNEL_ID) return
  const { sendChannelMessage } = await import('@/lib/discord')
  await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
    embeds: [{
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
    }],
  }).catch(() => {})
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
  clientName: string
  carrier: string
  policyType: PolicyType
}
export async function notifyIssued(args: IssuedArgs): Promise<void> {
  // Admin channel announcement
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const { sendChannelMessage } = await import('@/lib/discord')
    await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
      embeds: [{
        title: 'Policy Issued',
        description: `${args.clientName}'s ${policyTypeLabel(args.policyType)} with ${args.carrier} is now in force. **${args.agentName}** has a new client!`,
        color: 0x4ADE80,
        timestamp: new Date().toISOString(),
      }],
    }).catch(() => {})
  }
  // DM the agent
  if (args.agentDiscordUserId) {
    await dmAgent(args.agentDiscordUserId, {
      title: 'Policy Issued',
      description: [
        `Your ${policyTypeLabel(args.policyType)} for **${args.clientName}** with ${args.carrier} is now in force.`,
        '',
        'Welcome a new client! Birthday and anniversary reminders will fire automatically.',
      ].join('\n'),
      color: 0x4ADE80,
    }).catch(() => {})
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
