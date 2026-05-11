// Mirror of the agent-activity feed but for Licensing Coordinator
// (and admin) actions. Every meaningful thing staff does in the
// vault — ticket replies, status flips, notes, on-behalf NB —
// lands here as a structured embed so the team has a clean audit
// trail without scrolling Vercel logs.
//
// Channel ID resolution: prefer the env var so it's tunable per
// environment, fall back to the production channel ID the CEO
// configured (1503502232669389030).

const ACTIVITY_CHANNEL = process.env.DISCORD_LC_ACTIVITY_CHANNEL_ID ?? '1503502232669389030'

const baseUrl = () => process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'

interface ActorMeta {
  id: string
  name: string
  role: 'admin' | 'licensing_coordinator' | 'LICENSING_COORDINATOR' | 'ADMIN'
}

interface AgentMeta {
  firstName: string
  lastName: string
  agentCode: string
}

function previewClip(value: string | null | undefined, max = 240): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (v.length <= max) return v
  return v.slice(0, max) + '…'
}

function actorLabel(a: ActorMeta): string {
  const role = a.role === 'LICENSING_COORDINATOR' || a.role === 'licensing_coordinator' ? 'LC' : 'Admin'
  return `${a.name} (${role})`
}

async function send(embed: Record<string, unknown>): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  try {
    const { sendChannelMessage } = await import('./discord')
    await sendChannelMessage(ACTIVITY_CHANNEL, { embeds: [embed as never] })
  } catch (err) {
    console.warn('[lc-activity] send failed:', err)
  }
}

// Fired when staff (LC or admin) replies to an agent on a
// coordinator request. Distinct from the admin-channel ping so
// admins can keep the broader admin channel for cross-functional
// noise and use this feed as 'who did what in the LC pipeline.'
export async function logTicketReply(args: {
  requestId: string
  agent: AgentMeta
  topic: string
  reply: string
  actor: ActorMeta
}): Promise<void> {
  await send({
    title: '💬 LC replied to ticket',
    description: previewClip(args.reply),
    color: 0x60A5FA,
    fields: [
      { name: 'For agent', value: `${args.agent.firstName} ${args.agent.lastName} (${args.agent.agentCode})`, inline: true },
      { name: 'Topic',     value: args.topic, inline: true },
      { name: 'By',        value: actorLabel(args.actor), inline: true },
    ],
    footer: { text: 'AFF Concierge · LC Activity' },
    url: `${baseUrl()}/vault/licensing`,
    timestamp: new Date().toISOString(),
  })
}

// Fired when staff changes a ticket's status (open → in_progress,
// resolved, closed, etc.).
export async function logTicketStatusChange(args: {
  requestId: string
  agent: AgentMeta
  topic: string
  oldStatus: string
  newStatus: string
  actor: ActorMeta
}): Promise<void> {
  await send({
    title: `📋 Ticket ${args.oldStatus} → ${args.newStatus}`,
    description: args.topic,
    color: 0xC9A96E,
    fields: [
      { name: 'For agent', value: `${args.agent.firstName} ${args.agent.lastName} (${args.agent.agentCode})`, inline: true },
      { name: 'By',        value: actorLabel(args.actor), inline: true },
    ],
    footer: { text: 'AFF Concierge · LC Activity' },
    url: `${baseUrl()}/vault/licensing`,
    timestamp: new Date().toISOString(),
  })
}

// Fired when a staff member adds a note on an agent profile (org
// tree side panel OR licensing workspace).
export async function logAgentNote(args: {
  agent: AgentMeta
  body: string
  scope: 'LICENSING' | 'ADMIN_ONLY'
  actor: ActorMeta
}): Promise<void> {
  // ADMIN_ONLY notes are kept off the public LC feed by design —
  // they're admin-private for a reason.
  if (args.scope === 'ADMIN_ONLY') return
  await send({
    title: '📝 Note added on agent',
    description: previewClip(args.body),
    color: 0x9BB0C4,
    fields: [
      { name: 'For agent', value: `${args.agent.firstName} ${args.agent.lastName} (${args.agent.agentCode})`, inline: true },
      { name: 'By',        value: actorLabel(args.actor), inline: true },
    ],
    footer: { text: 'AFF Concierge · LC Activity' },
    url: `${baseUrl()}/vault/org`,
    timestamp: new Date().toISOString(),
  })
}

// Fired when staff logs a policy on behalf of an agent (e.g.
// Natalia logging policies Vick wrote).
export async function logOnBehalfSubmission(args: {
  writer: AgentMeta
  carrier: string
  policyType: string
  clientName: string
  points: number | null
  actor: ActorMeta
}): Promise<void> {
  await send({
    title: '📄 LC logged new business on behalf',
    description: `${args.writer.firstName} ${args.writer.lastName}'s policy: ${args.carrier} ${args.policyType} for ${args.clientName}`,
    color: 0xC9A96E,
    fields: [
      { name: 'Writer',   value: `${args.writer.firstName} ${args.writer.lastName} (${args.writer.agentCode})`, inline: true },
      { name: 'Carrier',  value: args.carrier, inline: true },
      { name: 'Type',     value: args.policyType, inline: true },
      ...(args.points != null ? [{ name: 'Points', value: String(args.points), inline: true }] : []),
      { name: 'Logged by', value: actorLabel(args.actor), inline: true },
    ],
    footer: { text: 'AFF Concierge · LC Activity' },
    url: `${baseUrl()}/vault/new-business`,
    timestamp: new Date().toISOString(),
  })
}

// Fired when staff changes a new-business submission status
// (PENDING → ISSUED / DECLINED / LAPSED / NOT_TAKEN).
export async function logNewBusinessStatusChange(args: {
  submissionId: string
  writer: AgentMeta
  carrier: string
  policyType: string
  oldStatus: string
  newStatus: string
  actor: ActorMeta
}): Promise<void> {
  await send({
    title: `📄 New Business ${args.oldStatus} → ${args.newStatus}`,
    description: `${args.writer.firstName} ${args.writer.lastName}'s ${args.carrier} ${args.policyType}`,
    color: 0xC9A96E,
    fields: [
      { name: 'Writer', value: `${args.writer.firstName} ${args.writer.lastName} (${args.writer.agentCode})`, inline: true },
      { name: 'By',     value: actorLabel(args.actor), inline: true },
    ],
    footer: { text: 'AFF Concierge · LC Activity' },
    url: `${baseUrl()}/vault/new-business`,
    timestamp: new Date().toISOString(),
  })
}
