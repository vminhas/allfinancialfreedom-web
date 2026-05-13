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

export async function listGuildScheduledEvents(): Promise<{ id: string; name: string; status: number }[]> {
  const res = await discordFetch(`${API}/guilds/${guildId()}/scheduled-events`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord listScheduledEvents failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<{ id: string; name: string; status: number }[]>
}

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

export async function editGuildScheduledEvent(
  eventId: string,
  input: Partial<DiscordScheduledEventInput>
): Promise<DiscordScheduledEventResponse> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name.slice(0, 100)
  if (input.description !== undefined) body.description = input.description?.slice(0, 1000)
  if (input.scheduledStartTime !== undefined) body.scheduled_start_time = input.scheduledStartTime
  if (input.scheduledEndTime !== undefined) body.scheduled_end_time = input.scheduledEndTime
  if (input.location !== undefined) body.entity_metadata = { location: input.location.slice(0, 100) }

  const res = await discordFetch(`${API}/guilds/${guildId()}/scheduled-events/${eventId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord editScheduledEvent failed (${res.status}): ${text.slice(0, 400)}`)
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

/**
 * Search guild members by username / nickname. Used when an agent's
 * profile doesn't have a discordUserId on file but admin actions
 * (e.g. kicking on deactivation) still need to target their Discord
 * account. Discord matches against username, global_name, and
 * nickname; the search is fuzzy enough to find Bryan Cole when the
 * query is "bryan".
 *
 * Returns an empty array on any non-2xx so the caller can degrade to
 * "no Discord match found" instead of throwing on a transient blip.
 *
 * Note: the bot needs the GUILD_MEMBERS privileged intent enabled in
 * the Developer Portal AND the search permission, otherwise this
 * returns 403 and we fall through to empty.
 */
export interface DiscordGuildMember {
  user: { id: string; username: string; global_name?: string | null }
  nick?: string | null
}
export async function searchGuildMembers(query: string, limit = 10): Promise<DiscordGuildMember[]> {
  const q = query.trim()
  if (!q) return []
  const url = `${API}/guilds/${guildId()}/members/search?query=${encodeURIComponent(q)}&limit=${limit}`
  try {
    const res = await discordFetch(url, { headers: authHeaders() })
    if (!res.ok) return []
    return await res.json() as DiscordGuildMember[]
  } catch {
    return []
  }
}

/**
 * Kick (remove) a member from the guild. Used by the admin
 * "Kick from Discord" button posted alongside deactivation notices.
 * Treats 404 (already gone) as success.
 */
export async function kickGuildMember(userId: string, reason?: string): Promise<void> {
  const headers: Record<string, string> = { Authorization: `Bot ${botToken()}` }
  if (reason) headers['X-Audit-Log-Reason'] = reason.slice(0, 512)
  const res = await discordFetch(`${API}/guilds/${guildId()}/members/${userId}`, {
    method: 'DELETE',
    headers,
  })
  if (res.status === 404) return
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord kickGuildMember failed (${res.status}): ${text.slice(0, 400)}`)
  }
}

/**
 * Delete a channel message by ID. Used to retract previously-posted
 * embeds (e.g. when an agent un-checks a completed phase item, we
 * remove the celebratory post we sent on the original completion).
 *
 * Treats 404 (message already deleted) as success — the desired end
 * state is reached either way. Throws on any other non-2xx response.
 */
export async function deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
  const res = await discordFetch(`${API}/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (res.status === 404) return
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`Discord deleteChannelMessage failed (${res.status}): ${text.slice(0, 400)}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
}

/**
 * Edit an existing channel message. Returns the updated message.
 * Throws with the response body if Discord rejects the edit (including
 * 404 when the message was deleted — caller can catch to fall through
 * to a fresh post).
 */
export async function editChannelMessage(channelId: string, messageId: string, payload: {
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

  const res = await discordFetch(`${API}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`Discord editChannelMessage failed (${res.status}): ${text.slice(0, 400)}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<{ id: string }>
}


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

// Discord message-component types. We only use buttons today (action rows
// holding 1-5 buttons), but the typing leaves room to add select menus later.
export interface DiscordButton {
  type: 2  // BUTTON
  style: 1 | 2 | 3 | 4 | 5  // primary, secondary, success, danger, link
  label: string
  custom_id?: string  // required for non-link buttons
  url?: string         // required for link buttons (style 5)
  emoji?: { name?: string; id?: string }
  disabled?: boolean
}
export interface DiscordActionRow {
  type: 1  // ACTION_ROW
  components: DiscordButton[]
}

export async function sendChannelMessage(channelId: string, payload: {
  content?: string
  embeds?: DiscordEmbed[]
  components?: DiscordActionRow[]
  allowedMentions?: { parse?: ('everyone' | 'roles' | 'users')[] }
  attachments?: DiscordAttachment[]
}): Promise<{ id: string }> {
  const payloadJson: Record<string, unknown> = {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
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

/**
 * Raw Discord message attachment as returned by the channel-messages
 * endpoint. We only model the fields the ICA poller actually reads —
 * Discord returns more (width/height for images, etc.) but TS keeps
 * unmodeled keys happily as long as we don't index them.
 */
export interface DiscordChannelMessage {
  id: string
  channel_id: string
  content: string
  timestamp: string
  author: {
    id: string
    username: string
    bot?: boolean
  }
  attachments: Array<{
    id: string
    filename: string
    content_type?: string
    size: number
    url: string
    proxy_url: string
  }>
}

/**
 * List recent messages in a channel. Maps to GET /channels/{id}/messages.
 * Default limit is 50; max is 100 per Discord docs. `after` is a snowflake
 * cursor for "messages newer than X" — the cron uses this with the last
 * processed message id to avoid re-scanning history.
 *
 * Throws on non-2xx. Caller is responsible for handling per-attachment
 * errors (download failures, parse errors); this just lists.
 */
export async function listChannelMessages(channelId: string, opts?: {
  limit?: number
  after?: string
  before?: string
}): Promise<DiscordChannelMessage[]> {
  const params = new URLSearchParams()
  params.set('limit', String(Math.min(100, Math.max(1, opts?.limit ?? 50))))
  if (opts?.after) params.set('after', opts.after)
  if (opts?.before) params.set('before', opts.before)
  const res = await discordFetch(`${API}/channels/${channelId}/messages?${params.toString()}`, {
    method: 'GET',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord listChannelMessages failed (${res.status}): ${text.slice(0, 400)}`)
  }
  return res.json() as Promise<DiscordChannelMessage[]>
}
