import { createHmac, timingSafeEqual } from 'crypto'
import {
  AGE_OPTIONS, SAVINGS_OPTIONS, TIMING_OPTIONS, PRIORITY_OPTIONS, ACCOUNT_TYPE_OPTIONS,
} from '@/lib/annuity-leads'

// Meta Lead Ads (Instant Form) webhook support.
//
// Flow: Meta POSTs a leadgen change with only a leadgen_id. We verify the
// X-Hub-Signature-256 against the app secret, then fetch the full lead from
// the Graph API with a Page access token, then map its field_data onto our
// schema. Required env:
//   META_WEBHOOK_VERIFY_TOKEN - the token we set in the App webhook config
//   META_APP_SECRET           - to verify the payload signature
//   META_PAGE_ACCESS_TOKEN    - to read the lead via the Graph API
//   META_GRAPH_VERSION        - optional; defaults to a current version

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0'

// Verify X-Hub-Signature-256: "sha256=<hex hmac of the raw body>" using the
// app secret. Constant-time compare. Returns false if anything is missing
// or malformed so an unsigned/forged payload is rejected.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET
  if (!secret || !signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const provided = signatureHeader.slice('sha256='.length)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(provided, 'hex')
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

interface FieldDatum { name: string; values: string[] }

// Fetch a lead's field_data from the Graph API. Best-effort: returns null
// on any failure so the webhook can ack without crashing.
export async function fetchLeadData(leadgenId: string): Promise<FieldDatum[] | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) return null
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}?fields=field_data,created_time,form_id&access_token=${encodeURIComponent(token)}`,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[meta-leadgen] fetch lead ${leadgenId} failed (${res.status}): ${text.slice(0, 300)}`)
      return null
    }
    const data = await res.json() as { field_data?: FieldDatum[] }
    return data.field_data ?? null
  } catch (err) {
    console.warn('[meta-leadgen] fetch lead error:', err)
    return null
  }
}

export interface MappedLead {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  ageBand: string
  savingsBand: string
  incomeTiming: string
  priority: string
  accountTypes: string[]
  // Any answers we couldn't map to a known field/option, kept for the
  // staff note so nothing the lead told us is silently lost.
  extras: string[]
}

const NOT_PROVIDED = 'Not provided'

function digitsOnly(s: string): string {
  const d = s.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return d.slice(1)
  return d
}

// Meta returns the option KEY in a lead's field_data, not the display
// label. For our forms the key is a slug of the label (e.g. "50-59" ->
// "50_59", "$100k-$250k" -> "100k_250k", "Income I can't outlive" ->
// "income_i_can_t_outlive"). We build a lookup from BOTH the label and its
// slug back to the canonical label, so a value maps whether Meta sends the
// key (API/most forms) or the label (some setups).
function slugifyOption(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function buildOptionLookup(options: readonly string[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const o of options) { m.set(o, o); m.set(slugifyOption(o), o) }
  return m
}
const AGE_LOOKUP = buildOptionLookup(AGE_OPTIONS)
const SAVINGS_LOOKUP = buildOptionLookup(SAVINGS_OPTIONS)
const TIMING_LOOKUP = buildOptionLookup(TIMING_OPTIONS)
const PRIORITY_LOOKUP = buildOptionLookup(PRIORITY_OPTIONS)
const ACCOUNT_LOOKUP = buildOptionLookup(ACCOUNT_TYPE_OPTIONS)

function matchOption(lookup: Map<string, string>, v: string): string | undefined {
  return lookup.get(v) ?? lookup.get(slugifyOption(v))
}

// Map Meta's field_data onto our schema. Contact fields are matched by
// Meta's known field names; the qualifier answers are matched by value
// (label OR slug-key) against our fixed option sets, so this works
// whichever form Meta sends. Unmatched answers go to `extras`.
export function mapLeadFields(fieldData: FieldDatum[]): MappedLead {
  const byName = new Map<string, string[]>()
  for (const f of fieldData) byName.set(f.name.toLowerCase(), f.values)
  const first = (k: string) => byName.get(k)?.[0]?.trim() || ''

  // Contact
  let firstName = first('first_name')
  let lastName = first('last_name')
  const full = first('full_name')
  if ((!firstName || !lastName) && full) {
    const parts = full.split(/\s+/)
    if (!firstName) firstName = parts[0] ?? ''
    if (!lastName) lastName = parts.slice(1).join(' ')
  }
  const email = first('email') || null
  const phoneRaw = first('phone_number') || first('phone')
  const phone = phoneRaw ? digitsOnly(phoneRaw) : null

  // Known contact field names we should not also treat as qualifier answers.
  const contactKeys = new Set(['first_name', 'last_name', 'full_name', 'email', 'phone_number', 'phone', 'city', 'state', 'zip_code', 'street_address', 'post_code', 'country'])

  // Qualifiers: match every answer value against our option sets.
  let ageBand = '', savingsBand = '', incomeTiming = '', priority = ''
  const accountTypes: string[] = []
  const extras: string[] = []
  for (const f of fieldData) {
    if (contactKeys.has(f.name.toLowerCase())) continue
    for (const raw of f.values) {
      const v = raw.trim()
      if (!v) continue
      const age = matchOption(AGE_LOOKUP, v)
      const sav = matchOption(SAVINGS_LOOKUP, v)
      const tim = matchOption(TIMING_LOOKUP, v)
      const pri = matchOption(PRIORITY_LOOKUP, v)
      const acc = matchOption(ACCOUNT_LOOKUP, v)
      if (age) ageBand = age
      else if (sav) savingsBand = sav
      else if (tim) incomeTiming = tim
      else if (pri) priority = pri
      else if (acc) { if (!accountTypes.includes(acc)) accountTypes.push(acc) }
      else extras.push(`${f.name}: ${v}`)
    }
  }

  return {
    firstName: firstName || NOT_PROVIDED,
    lastName: lastName || '',
    email,
    phone,
    ageBand: ageBand || NOT_PROVIDED,
    savingsBand: savingsBand || NOT_PROVIDED,
    incomeTiming: incomeTiming || NOT_PROVIDED,
    priority: priority || NOT_PROVIDED,
    accountTypes,
    extras,
  }
}
