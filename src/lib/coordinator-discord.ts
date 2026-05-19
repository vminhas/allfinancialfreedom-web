// Admin-channel Discord activity for coordinator-request (licensing
// ticket) lifecycle events. Mirrors the feedback-side pattern: every
// meaningful event lands as a structured embed in the admin activity
// channel so the team can triage / follow along without polling
// /vault/licensing.

const TOPIC_LABEL: Record<string, string> = {
  SCHEDULE_EXAM: 'Schedule licensing exam',
  PASS_POST_LICENSING: 'Post-licensing call',
  FINGERPRINTS_APPLY: 'Fingerprints & state application',
  GFI_APPOINTMENTS: 'GFI / carrier appointments',
  CE_COURSES: 'CE courses',
  EO_INSURANCE: 'E&O insurance',
  DIRECT_DEPOSIT: 'Direct deposit setup',
  UNDERWRITING: 'Underwriting',
  GENERAL: 'General',
}

const STATUS_COLOR: Record<string, number> = {
  OPEN:        0xF59E0B,
  IN_PROGRESS: 0xC9A96E,
  RESOLVED:    0x4ADE80,
  CLOSED:      0x60A5FA,
}

interface AgentMeta {
  firstName: string
  lastName: string
  agentCode: string
}

function previewClip(value: string, max = 300): string {
  if (value.length <= max) return value
  return value.slice(0, max) + '...'
}

async function sendAdmin(
  embed: Record<string, unknown>,
  components?: unknown[],
): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_ADMIN_CHANNEL_ID) return
  try {
    const { sendChannelMessage } = await import('./discord')
    await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
      embeds: [embed as never],
      ...(components && components.length ? { components: components as never } : {}),
    })
  } catch (err) {
    console.warn('[coordinator-discord] send failed:', err)
  }
}

const baseUrl = () => process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'

// Fired when an agent submits a new licensing ticket. Lets the LC
// queue see it land without manually refreshing /vault/licensing.
// Also DMs every licensing coordinator who linked their Discord so
// the people who actually have to action it see it on their phone.
export async function pingTicketCreated(args: {
  requestId: string
  agent: AgentMeta
  topic: string
  message: string
  phaseItemKey?: string | null
}): Promise<void> {
  const { isGatedPromotionKey, GATED_LABEL } = await import('./promotion-approve')
  const isPromotion = isGatedPromotionKey(args.phaseItemKey)
  const promoLabel = isPromotion ? GATED_LABEL[args.phaseItemKey as string] : null

  const embed = {
    title: isPromotion ? `🎖️ Promotion request: ${promoLabel}` : '🆕 New licensing ticket',
    description: previewClip(args.message),
    color: isPromotion ? 0x9B6DFF : 0xF59E0B,
    fields: [
      { name: 'From',  value: `${args.agent.firstName} ${args.agent.lastName} (${args.agent.agentCode})`, inline: true },
      { name: 'Topic', value: isPromotion ? (promoLabel as string) : (TOPIC_LABEL[args.topic] ?? args.topic), inline: true },
    ],
    footer: { text: 'AFF Concierge · /vault/licensing' },
    url: `${baseUrl()}/vault/licensing`,
    timestamp: new Date().toISOString(),
  }

  // Promotion tickets get a one-click Approve button right in the admin
  // channel. Clicking it completes the gated phase item + resolves the
  // ticket (same path as the LC inbox button). The admin channel is
  // staff-only, which is the auth boundary (matches referral-approve).
  const components = isPromotion
    ? [{
        type: 1,
        components: [{
          type: 2,
          style: 3, // success / green
          label: `Approve ${promoLabel}`,
          custom_id: `promo-approve:${args.requestId}`,
        }],
      }]
    : undefined

  await sendAdmin(embed, components)
  const { dmLicensingCoordinators } = await import('./staff-discord')
  dmLicensingCoordinators(embed).catch(() => {})
}

// Fired when an admin or LC PATCHes status. Skipped if status didn't
// move (assignment-only PATCHes don't ping).
export async function pingTicketStatusChange(args: {
  requestId: string
  agent: AgentMeta
  topic: string
  oldStatus: string
  newStatus: string
  actorName: string
}): Promise<void> {
  await sendAdmin({
    title: `📋 Ticket ${args.oldStatus} → ${args.newStatus}`,
    description: TOPIC_LABEL[args.topic] ?? args.topic,
    color: STATUS_COLOR[args.newStatus] ?? 0x9BB0C4,
    fields: [
      { name: 'From', value: `${args.agent.firstName} ${args.agent.lastName} (${args.agent.agentCode})`, inline: true },
      { name: 'By',   value: args.actorName, inline: true },
    ],
    footer: { text: 'AFF Concierge · /vault/licensing' },
    url: `${baseUrl()}/vault/licensing`,
    timestamp: new Date().toISOString(),
  })
}

// Fired when the LC / admin replies on a ticket thread. Distinct from
// status-change pings so the team sees both the conversation and
// workflow events as separate timeline entries.
export async function pingTicketStaffReply(args: {
  requestId: string
  agent: AgentMeta
  topic: string
  reply: string
  actorName: string
}): Promise<void> {
  await sendAdmin({
    title: '💬 LC replied to ticket',
    description: previewClip(args.reply),
    color: 0x60A5FA,
    fields: [
      { name: 'For agent', value: `${args.agent.firstName} ${args.agent.lastName} (${args.agent.agentCode})`, inline: true },
      { name: 'Topic',     value: TOPIC_LABEL[args.topic] ?? args.topic, inline: true },
      { name: 'By',        value: args.actorName, inline: true },
    ],
    footer: { text: 'AFF Concierge · /vault/licensing' },
    url: `${baseUrl()}/vault/licensing`,
    timestamp: new Date().toISOString(),
  })
}

// Fired when the agent replies on a ticket thread (clarification or
// follow-up). Symmetric with pingTicketStaffReply so admins see both
// sides of the conversation in the same channel. Also DMs the
// assigned coordinator (or all LCs if unassigned) so the reply
// doesn't sit unread.
export async function pingTicketAgentReply(args: {
  requestId: string
  agent: AgentMeta
  topic: string
  reply: string
  assignedToAdminId?: string | null
}): Promise<void> {
  const embed = {
    title: '↩️ Agent replied to ticket',
    description: previewClip(args.reply),
    color: 0x60A5FA,
    fields: [
      { name: 'From',  value: `${args.agent.firstName} ${args.agent.lastName} (${args.agent.agentCode})`, inline: true },
      { name: 'Topic', value: TOPIC_LABEL[args.topic] ?? args.topic, inline: true },
    ],
    footer: { text: 'AFF Concierge · /vault/licensing' },
    url: `${baseUrl()}/vault/licensing`,
    timestamp: new Date().toISOString(),
  }
  await sendAdmin(embed)
  const { dmAdminUser } = await import('./staff-discord')
  dmAdminUser(args.assignedToAdminId ?? null, embed).catch(() => {})
}
