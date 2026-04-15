/**
 * Discord REST helpers for the AFF Concierge bot.
 *
 * Required env:
 *   DISCORD_BOT_TOKEN — bot token (Bot prefix added automatically)
 *   DISCORD_GUILD_ID  — the AFF server ID for scheduled events
 *
 * The bot has admin in the AFF server so we don't need to enumerate scopes.
 */

const API = 'https://discord.com/api/v10'

function botToken(): string {
  const t = process.env.DISCORD_BOT_TOKEN
  if (!t) throw new Error('DISCORD_BOT_TOKEN not configured')
  return t
}

function guildId(): string {
  const g = process.env.DISCORD_GUILD_ID
  if (!g) throw new Error('DISCORD_GUILD_ID not configured')
  return g
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bot ${botToken()}`,
    'Content-Type': 'application/json',
  }
}

// ─── Guild scheduled events ──────────────────────────────────────────────────

export interface DiscordScheduledEventInput {
  name: string
  description?: string
  scheduledStartTime: string  // ISO 8601
  scheduledEndTime: string    // ISO 8601
  /** External location string — Zoom URL, GFI Live URL, or "GFI Live - Impact TV · ID 839-5426-5128" */
  location: string
  imageBase64?: string  // optional cover image (data: prefix stripped)
}

export interface DiscordScheduledEventResponse {
  id: string
  name: string
  scheduled_start_time: string
}

export async function createGuildScheduledEvent(
  input: DiscordScheduledEventInput
): Promise<DiscordScheduledEventResponse> {
  const body: Record<string, unknown> = {
    name: input.name.slice(0, 100),
    description: input.description?.slice(0, 1000),
    scheduled_start_time: input.scheduledStartTime,
    scheduled_end_time: input.scheduledEndTime,
    privacy_level: 2, // GUILD_ONLY
    entity_type: 3,   // EXTERNAL
    entity_metadata: { location: input.location.slice(0, 100) },
  }
  if (input.imageBase64) {
    // Discord wants `data:image/...;base64,xxx` — caller should already strip header
    body.image = `data:image/jpeg;base64,${input.imageBase64}`
  }

  const res = await fetch(`${API}/guilds/${guildId()}/scheduled-events`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord createScheduledEvent failed (${res.status}): ${text.slice(0, 400)}`)
  }
  return res.json() as Promise<DiscordScheduledEventResponse>
}

export async function deleteGuildScheduledEvent(eventId: string): Promise<void> {
  const res = await fetch(`${API}/guilds/${guildId()}/scheduled-events/${eventId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Discord deleteScheduledEvent failed (${res.status}): ${text.slice(0, 400)}`)
  }
}

// ─── Channel messages ────────────────────────────────────────────────────────

export interface DiscordEmbed {
  title?: string
  description?: string
  color?: number  // 24-bit RGB int
  url?: string
  fields?: { name: string; value: string; inline?: boolean }[]
  image?: { url: string }
  thumbnail?: { url: string }
  footer?: { text: string }
  timestamp?: string
}

export async function sendChannelMessage(channelId: string, payload: {
  content?: string
  embeds?: DiscordEmbed[]
  allowedMentions?: { parse?: ('everyone' | 'roles' | 'users')[] }
}): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    content: payload.content,
    embeds: payload.embeds,
  }
  if (payload.allowedMentions) {
    body.allowed_mentions = {
      parse: payload.allowedMentions.parse ?? [],
    }
  }

  const res = await fetch(`${API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord sendChannelMessage failed (${res.status}): ${text.slice(0, 400)}`)
  }
  return res.json() as Promise<{ id: string }>
}
