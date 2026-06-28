import { createHash } from 'crypto'

// Server-side Meta (Facebook) Conversions API. Fires the same "Lead"
// event the browser Pixel fires, so Meta can attribute conversions even
// when the Pixel is blocked. The two are de-duplicated by a shared
// eventId (event_id here == eventID on the client fbq call).
//
// Fully env-gated: with no NEXT_PUBLIC_META_PIXEL_ID + META_CAPI_ACCESS_TOKEN
// this is a no-op, so the lead flow works before Meta verification clears.
//   NEXT_PUBLIC_META_PIXEL_ID  - the Pixel / dataset id (also used client-side)
//   META_CAPI_ACCESS_TOKEN     - Conversions API access token (server only)
//   META_CAPI_TEST_EVENT_CODE  - optional; routes events to Test Events view
//   META_GRAPH_VERSION         - optional; defaults to a current Graph version

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0'

// SHA-256 hash of normalized PII, as Meta requires. Email lowercased and
// trimmed; phone reduced to digits (with country code if derivable).
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Meta wants E.164-ish digits with no symbols. US numbers without a
// country code get a leading 1. Anything already 11+ digits is left as-is.
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  return digits
}

export interface MetaLeadEventInput {
  eventId: string
  eventSourceUrl?: string
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  clientIp?: string
  userAgent?: string
  fbclid?: string
  // value/currency are optional; a booked annuity is worth far more than
  // a lead, so we leave value unset and optimize on the Lead event itself.
}

export function metaCapiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN)
}

// Best-effort. Never throws; returns whether the event was accepted so
// the caller can log without coupling the lead save to Meta uptime.
export async function sendMetaLeadEvent(input: MetaLeadEventInput): Promise<boolean> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const token = process.env.META_CAPI_ACCESS_TOKEN
  if (!pixelId || !token) return false

  const userData: Record<string, unknown> = {}
  if (input.email) userData.em = [hash(normalizeEmail(input.email))]
  if (input.phone) userData.ph = [hash(normalizePhone(input.phone))]
  if (input.firstName) userData.fn = [hash(input.firstName.trim().toLowerCase())]
  if (input.lastName) userData.ln = [hash(input.lastName.trim().toLowerCase())]
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.userAgent) userData.client_user_agent = input.userAgent
  // fbc is reconstructable from fbclid per Meta's documented format.
  if (input.fbclid) userData.fbc = `fb.1.${Date.now()}.${input.fbclid}`

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: 'website',
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
        user_data: userData,
      },
    ],
  }
  if (process.env.META_CAPI_TEST_EVENT_CODE) {
    body.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[meta-capi] Lead event rejected (${res.status}): ${text.slice(0, 300)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[meta-capi] Lead event failed:', err)
    return false
  }
}
