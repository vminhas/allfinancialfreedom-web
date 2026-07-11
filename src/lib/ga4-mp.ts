// Server-side GA4 Measurement Protocol. Sends down-funnel conversion events
// (qualify_lead, close_convert_lead) that happen in the back office days after
// the ad click, not in the visitor's browser. GA4 then forwards them to Google
// Ads through the linked account, so the imported "Qualified lead" and
// "Converted lead" conversion actions start reporting.
//
// Why server-side: qualification (a booked appointment) and conversion (a won
// policy) are CRM status changes made by staff in the vault. There is no
// browser session to fire gtag from at that moment, so we replay the event to
// GA4 with the client_id we captured when the lead first landed.
//
// Fully env-gated: with no GA4_MP_API_SECRET this is a no-op, so the pipeline
// works before the secret is configured.
//   NEXT_PUBLIC_GA_MEASUREMENT_ID  - the GA4 Measurement ID (G-XXXXXXX). Also
//                                    used client-side; defaults to the AFF web
//                                    stream if unset.
//   GA4_MP_API_SECRET              - Measurement Protocol API secret (server
//                                    only). Create in GA4 Admin -> Data Streams
//                                    -> Web stream -> Measurement Protocol API
//                                    secrets. Never expose client-side.

// The live AFF GA4 web stream. Public (it ships in the page already), so it is
// a safe default; override with the env var if the stream ever changes.
const DEFAULT_MEASUREMENT_ID = 'G-V681CCKX2T'

function measurementId(): string {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID
}

export function ga4MpConfigured(): boolean {
  return Boolean(process.env.GA4_MP_API_SECRET)
}

// The GA4 client_id is the last two dot-segments of the browser _ga cookie
// (e.g. "GA1.1.1234567890.1700000000" -> "1234567890.1700000000"). We store the
// cookie value at lead capture; normalize it here so a full cookie or an
// already-trimmed id both work.
export function normalizeGaClientId(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v) return null
  // Full cookie form: GA1.1.<cid1>.<cid2>
  const m = v.match(/^GA\d+\.\d+\.(\d+\.\d+)$/)
  if (m) return m[1]!
  // Already in "<cid1>.<cid2>" form
  if (/^\d+\.\d+$/.test(v)) return v
  return null
}

export interface Ga4EventInput {
  clientId: string                 // GA4 client_id (see normalizeGaClientId)
  eventName: 'qualify_lead' | 'close_convert_lead'
  value?: number
  currency?: string
  leadId?: string
  gclid?: string                   // passed through for Ads attribution
}

// Best-effort. Never throws; returns whether GA4 accepted the hit so the caller
// can log without coupling a status change to GA4 uptime.
export async function sendGa4Event(input: Ga4EventInput): Promise<boolean> {
  const apiSecret = process.env.GA4_MP_API_SECRET
  if (!apiSecret) return false
  const clientId = normalizeGaClientId(input.clientId)
  if (!clientId) {
    console.warn('[ga4-mp] skipped: no usable client_id for', input.eventName)
    return false
  }

  const params: Record<string, unknown> = {}
  if (typeof input.value === 'number') {
    params.value = input.value
    params.currency = input.currency ?? 'USD'
  }
  if (input.leadId) params.lead_id = input.leadId
  if (input.gclid) params.gclid = input.gclid
  // Mark as a non-session, back-office hit so it doesn't distort engagement.
  params.session_engaged = 0

  const body = {
    client_id: clientId,
    // Down-funnel events are not tied to a live session; omit user-agent/session.
    events: [{ name: input.eventName, params }],
  }

  const url =
    `https://www.google-analytics.com/mp/collect` +
    `?measurement_id=${encodeURIComponent(measurementId())}` +
    `&api_secret=${encodeURIComponent(apiSecret)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // MP /collect returns 204 with no body on success (even for bad events),
    // so a 2xx just means "accepted for processing". Use /debug/mp/collect in
    // testing to validate payloads.
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[ga4-mp] ${input.eventName} rejected (${res.status}): ${text.slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn(`[ga4-mp] ${input.eventName} failed:`, err)
    return false
  }
}
