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

/**
 * Fetch wrapper that handles Discord rate limits (HTTP 429). Reads the
 * `retry_after` field from the response and sleeps for that many seconds
 * before retrying. Up to 5 retries per call — Discord's per-guild
 * scheduled-event limit is tight (~5 per 10s) so multi-step retries
 * are normal during a fresh weekly sync.
 */
async function discordFetch(url: string, init: RequestInit, attempts = 5): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init)
    if (res.status !== 429) return res
    let retryAfter = 2
    try {
      const body = await res.clone().json() as { retry_after?: number }
      if (typeof body.retry_after === 'number') retryAfter = Math.max(body.retry_after, 1)
    } catch { /* fall back */ }
    // Add jitter so multiple parallel calls don't all wake at once
    const sleepMs = Math.ceil(retryAfter * 1000) + 500
    await new Promise(r => setTimeout(r, sleepMs))
  }
  // Final attempt — return whatever we get even if it's a 429
  return fetch(url, init)
}

// ─── Bot identity / guild membership (diagnostics) ────────────────────────────

export interface DiscordBotIdentity {
  id: string
  username: string
  discriminator?: string
}

export interface DiscordGuildSummary {
  id: string
  name: string
}

export async function getBotIdentity(): Promise<DiscordBotIdentity> {
  const res = await discordFetch(`${API}/users/@me`, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord getBotIdentity failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<DiscordBotIdentity>
}

export async function listBotGuilds(): Promise<DiscordGuildSummary[]> {
  const res = await discordFetch(`${API}/users/@me/guilds`, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord listBotGuilds failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<DiscordGuildSummary[]>
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

  const res = await discordFetch(`${API}/guilds/${guildId()}/scheduled-events`, {
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
  const res = await discordFetch(`${API}/guilds/${guildId()}/scheduled-events/${eventId}`, {
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

export interface DiscordAttachment {
  filename: string
  contentType: string  // 'image/png', 'image/jpeg', etc.
  data: Buffer
}

export async function sendChannelMessage(channelId: string, payload: {
  content?: string
  embeds?: DiscordEmbed[]
  allowedMentions?: { parse?: ('everyone' | 'roles' | 'users')[] }
  attachments?: DiscordAttachment[]
}): Promise<{ id: string }> {
  const payloadJson: Record<string, unknown> = {
    content: payload.content,
    embeds: payload.embeds,
  }
  if (payload.allowedMentions) {
    payloadJson.allowed_mentions = {
      parse: payload.allowedMentions.parse ?? [],
    }
  }

  // If there are attachments, send as multipart/form-data so Discord can
  // host the files and render them inline in the embed (via attachment://).
  if (payload.attachments && payload.attachments.length > 0) {
    const form = new FormData()
    form.append('payload_json', JSON.stringify(payloadJson))
    for (let i = 0; i < payload.attachments.length; i++) {
      const att = payload.attachments[i]
      // Copy into a fresh Uint8Array so the Blob accepts it — Node's Buffer
      // type can be backed by SharedArrayBuffer which Blob() doesn't like.
      const bytes = new Uint8Array(att.data.byteLength)
      bytes.set(att.data)
      form.append(`files[${i}]`, new Blob([bytes], { type: att.contentType }), att.filename)
    }
    // NOTE: do NOT set Content-Type header — let fetch set the multipart
    // boundary automatically. Authorization still needed.
    const res = await discordFetch(`${API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken()}` },
      body: form,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Discord sendChannelMessage (multipart) failed (${res.status}): ${text.slice(0, 400)}`)
    }
    return res.json() as Promise<{ id: string }>
  }

  // No attachments — plain JSON body
  const res = await discordFetch(`${API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payloadJson),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord sendChannelMessage failed (${res.status}): ${text.slice(0, 400)}`)
  }
  return res.json() as Promise<{ id: string }>
}
