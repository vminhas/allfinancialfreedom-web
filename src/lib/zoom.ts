// Server-to-Server OAuth helper for the Zoom API. Vick creates an
// app under his Workspace Pro account, and we store the three values
// (Account ID, Client ID, Client Secret) in the encrypted settings
// table. This module exchanges them for an access token (1 hour TTL,
// cached in-process) and exposes the participant-report endpoint we
// need for attendance sync.
//
// Anything that returns a permanent failure (bad creds, missing
// scope) throws ZoomConfigError so the cron + manual-sync routes
// can render a clear error to the admin UI instead of swallowing it.

import { getSettings } from './settings'

const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token'
const ZOOM_API_BASE = 'https://api.zoom.us/v2'

export class ZoomConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZoomConfigError'
  }
}

export class ZoomApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ZoomApiError'
    this.status = status
  }
}

interface ZoomCreds {
  accountId: string
  clientId: string
  clientSecret: string
}

async function readCreds(): Promise<ZoomCreds> {
  const s = await getSettings(['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'])
  const accountId = s.ZOOM_ACCOUNT_ID?.trim()
  const clientId = s.ZOOM_CLIENT_ID?.trim()
  const clientSecret = s.ZOOM_CLIENT_SECRET?.trim()
  if (!accountId || !clientId || !clientSecret) {
    throw new ZoomConfigError(
      'Zoom credentials missing. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET in /vault/settings.',
    )
  }
  return { accountId, clientId, clientSecret }
}

// Tokens are valid for 1 hour. Cache in module scope so a burst of
// participant fetches reuses the same token. We refresh 60s before
// expiry to dodge clock-skew edge cases.
interface CachedToken {
  accessToken: string
  expiresAt: number
}
let cachedToken: CachedToken | null = null
const TOKEN_REFRESH_BUFFER_MS = 60_000

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    return cachedToken.accessToken
  }
  const { accountId, clientId, clientSecret } = await readCreds()

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: accountId,
  })
  const res = await fetch(ZOOM_OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      throw new ZoomConfigError(`Zoom rejected the credentials: ${res.status} ${text}`)
    }
    throw new ZoomApiError(`Token exchange failed: ${res.status} ${text}`, res.status)
  }
  const json = JSON.parse(text) as { access_token: string; expires_in: number }
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return cachedToken.accessToken
}

// For tests / settings test-button: clears the cache so a fresh
// credential set is exchanged on the next call.
export function clearZoomTokenCache(): void {
  cachedToken = null
}

async function zoomFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const res = await fetch(`${ZOOM_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })
  // 401 with a stale cached token: dump it and retry once.
  if (res.status === 401 && cachedToken) {
    cachedToken = null
    return zoomFetch(path, init)
  }
  return res
}

export interface CreatedZoomMeeting {
  id: number
  joinUrl: string
  startUrl: string
  startTime: string
}

// Create a scheduled Zoom meeting. The server-to-server OAuth app acts as the
// account, so `me` is the token owner. start_time is interpreted in `timezone`
// when it has no trailing Z, so the caller can pass a naive local datetime
// (from a datetime-local input) plus the timezone and skip UTC math.
export async function createZoomMeeting(opts: {
  topic: string
  startTime: string
  durationMinutes?: number
  agenda?: string
  timezone?: string
}): Promise<CreatedZoomMeeting> {
  const res = await zoomFetch('/users/me/meetings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: opts.topic.slice(0, 200),
      type: 2, // scheduled meeting
      start_time: opts.startTime,
      duration: opts.durationMinutes ?? 60,
      timezone: opts.timezone ?? 'America/New_York',
      agenda: (opts.agenda ?? '').slice(0, 2000),
      settings: { join_before_host: true, waiting_room: false, approval_type: 2 },
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ZoomApiError(`Zoom create meeting failed (${res.status}): ${text.slice(0, 300)}`, res.status)
  }
  const j = JSON.parse(await res.text()) as { id: number; join_url: string; start_url: string; start_time: string }
  return { id: j.id, joinUrl: j.join_url, startUrl: j.start_url, startTime: j.start_time }
}

export interface ZoomParticipant {
  id: string | null               // Zoom user ID, null for guests
  user_id: string                 // Per-meeting participant id
  name: string
  user_email: string | null
  join_time: string               // ISO 8601
  leave_time: string              // ISO 8601
  duration: number                // seconds
  registrant_id?: string | null
  status?: string
}

interface ParticipantsPage {
  page_count: number
  page_size: number
  total_records: number
  next_page_token: string
  participants: ZoomParticipant[]
}

interface PastInstance {
  uuid: string
  start_time: string  // ISO 8601
}

// List the UUIDs of every past occurrence of a recurring meeting.
// Critical for backfilling: when you pass the numeric ID directly to
// /past_meetings/{id}/participants Zoom only returns the LATEST
// occurrence's data, not historical ones. We have to enumerate
// instances and pick the UUID matching the date we care about.
async function fetchPastMeetingInstances(meetingId: string): Promise<PastInstance[]> {
  const cleanId = meetingId.replace(/[\s-]/g, '')
  const res = await zoomFetch(`/past_meetings/${cleanId}/instances`)
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 404) {
      // No past instances at all. Possibly a future meeting, or a
      // meeting that lives on a Zoom account this app can't see.
      throw new ZoomApiError(`Zoom has no past instances of meeting ${cleanId}`, 404)
    }
    throw new ZoomApiError(`Zoom API ${res.status} on /past_meetings/${cleanId}/instances: ${text}`, res.status)
  }
  const json = JSON.parse(await res.text()) as { meetings?: PastInstance[] }
  return json.meetings ?? []
}

// Zoom UUIDs can contain '/' or start with '/'. Per Zoom's docs you
// must double-URL-encode in those cases so the path doesn't get
// chopped by their router. Otherwise single-encoding is fine.
function encodeMeetingUuid(uuid: string): string {
  const single = encodeURIComponent(uuid)
  if (uuid.startsWith('/') || uuid.includes('//')) {
    return encodeURIComponent(single)
  }
  return single
}

// Zoom's past_meetings/{meetingId}/participants endpoint paginates at
// 300 records per page. The same person rejoining shows up as multiple
// rows here, which is fine -- the sync step sums durations by user_id.
//
// targetStartTime: when we know which date's occurrence we want (which
// we always do, since each TrainingEvent has a startsAt), we look up
// the matching instance UUID first. This lets us backfill the entire
// history of a recurring meeting -- without it, Zoom only returns the
// most recent occurrence's participants regardless of which date we
// asked about.
export async function fetchPastMeetingParticipants(
  meetingId: string,
  targetStartTime?: Date,
): Promise<ZoomParticipant[]> {
  // Zoom expects the numeric meeting id with no spaces or dashes.
  const cleanId = meetingId.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(cleanId)) {
    throw new ZoomApiError(`Invalid Zoom meeting ID: ${meetingId}`, 400)
  }

  // Resolve the right occurrence's UUID. For non-recurring meetings
  // there's typically just one instance; for recurring meetings (e.g.
  // weekly Mondays + Thursdays) we need to pick the one nearest the
  // target date.
  let endpointId = cleanId
  if (targetStartTime) {
    try {
      const instances = await fetchPastMeetingInstances(cleanId)
      if (instances.length > 0) {
        const target = targetStartTime.getTime()
        const closest = instances.reduce((best, curr) => {
          const cd = Math.abs(new Date(curr.start_time).getTime() - target)
          const bd = Math.abs(new Date(best.start_time).getTime() - target)
          return cd < bd ? curr : best
        })
        const delta = Math.abs(new Date(closest.start_time).getTime() - target)
        // Tolerance: within 12h of the expected start. Tight enough
        // that we don't grab the wrong week of a weekly recurring
        // meeting, loose enough to absorb time-zone parsing wobble in
        // either Zoom's response or our own startsAt.
        if (delta < 12 * 3600_000) {
          endpointId = encodeMeetingUuid(closest.uuid)
        } else {
          throw new ZoomApiError(
            `No past instance of meeting ${cleanId} near ${targetStartTime.toISOString()} (closest was ${closest.start_time})`,
            404,
          )
        }
      } else {
        throw new ZoomApiError(`No past instances of meeting ${cleanId}`, 404)
      }
    } catch (err) {
      if (err instanceof ZoomApiError) throw err
      throw new ZoomApiError(`Failed to resolve instance: ${err instanceof Error ? err.message : String(err)}`, 500)
    }
  }

  const all: ZoomParticipant[] = []
  let nextPageToken: string | undefined
  let safety = 0
  do {
    const params = new URLSearchParams({ page_size: '300' })
    if (nextPageToken) params.set('next_page_token', nextPageToken)
    const res = await zoomFetch(`/past_meetings/${endpointId}/participants?${params.toString()}`)
    const text = await res.text()
    if (!res.ok) {
      // 404 when the meeting hasn't ended yet, or when Zoom hasn't
      // finalized the report (can take a few minutes after the call).
      // Surface that as a typed error so the caller can decide whether
      // to retry later.
      if (res.status === 404) {
        throw new ZoomApiError(`No participant report yet for meeting ${cleanId}`, 404)
      }
      if (res.status === 400 && /not.*found|no.*meeting/i.test(text)) {
        throw new ZoomApiError(`Zoom does not have a record of meeting ${cleanId}`, 404)
      }
      throw new ZoomApiError(`Zoom API ${res.status} on /past_meetings/${cleanId}/participants: ${text}`, res.status)
    }
    const page = JSON.parse(text) as ParticipantsPage
    all.push(...page.participants)
    nextPageToken = page.next_page_token || undefined
    safety++
    if (safety > 50) {
      // 50 pages * 300 = 15k participants. If we ever hit this on a
      // training event something's badly wrong; bail loudly.
      throw new ZoomApiError('Refusing to page past 15k participants for one meeting', 500)
    }
  } while (nextPageToken)

  return all
}

// Quick auth check used by the settings "Test connection" button.
// Hits a cheap endpoint and returns whether the credentials work.
export async function testZoomCredentials(): Promise<{ ok: true; accountInfo: { id: string; type: string } } | { ok: false; error: string }> {
  try {
    const res = await zoomFetch('/users?page_size=1')
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `Zoom returned ${res.status}: ${text.slice(0, 240)}` }
    }
    // We don't need the user list; getting a 200 means the token + scopes work.
    return { ok: true, accountInfo: { id: 'verified', type: 'server-to-server' } }
  } catch (err) {
    if (err instanceof ZoomConfigError) return { ok: false, error: err.message }
    if (err instanceof ZoomApiError) return { ok: false, error: err.message }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
