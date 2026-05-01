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

// Zoom's past_meetings/{meetingId}/participants endpoint paginates at
// 300 records per page. We page through all of them; for typical
// trainings (50-200 participants) one page is enough. The same person
// rejoining shows up as multiple rows here, which is fine -- the sync
// step sums durations by user_id.
export async function fetchPastMeetingParticipants(meetingId: string): Promise<ZoomParticipant[]> {
  // Zoom expects the numeric meeting id with no spaces or dashes.
  const cleanId = meetingId.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(cleanId)) {
    throw new ZoomApiError(`Invalid Zoom meeting ID: ${meetingId}`, 400)
  }

  const all: ZoomParticipant[] = []
  let nextPageToken: string | undefined
  let safety = 0
  do {
    const params = new URLSearchParams({ page_size: '300' })
    if (nextPageToken) params.set('next_page_token', nextPageToken)
    const res = await zoomFetch(`/past_meetings/${cleanId}/participants?${params.toString()}`)
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
