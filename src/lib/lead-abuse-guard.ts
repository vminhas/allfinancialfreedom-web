import { db } from '@/lib/db'

// Abuse defenses for the PUBLIC, unauthenticated annuity lead endpoint.
//
// The endpoint triggers outbound email + SMS (from our trusted domain and
// phone number) to caller-supplied recipients, with caller-supplied names
// interpolated into the message. Without these guards it is an open
// phishing/smishing relay and a spam/cost vector. Layers:
//   1. sanitize/cap all input so names can't carry HTML, links, or
//      control characters into the email/SMS body.
//   2. escapeHtml for anything rendered into the confirmation email.
//   3. checkLeadRateLimit: per-IP and per-recipient ceilings so the
//      endpoint can't be driven at scale.

// HTML-escape for safe interpolation into the confirmation email body.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Generic length cap. Trims first so a wall of whitespace can't pad past
// the limit.
export function capStr(value: string, max: number): string {
  return value.trim().slice(0, max)
}

// Normalize a person's name for storage and for safe use in email/SMS:
// strip control chars (\p{Cc}) and angle brackets, collapse internal
// whitespace, and cap length. Does not HTML-escape (do that at render
// time for HTML).
export function sanitizeName(value: string): string {
  return value
    .replace(/[\p{Cc}<>]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

// Collapse to a single safe line for SMS interpolation: no newlines or
// control chars (which could be used to fake additional message lines).
export function sanitizeOneLine(value: string): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export interface LeadRateLimitResult {
  blocked: boolean
  reason?: string
}

// Per-IP and per-recipient ceilings. Numbers are generous enough that a
// real person re-submitting (typo fix, second household member) is fine,
// but a script cannot fan out. Recipient limits specifically cap how many
// times any single email/phone can be contacted via this endpoint, which
// is what blunts the relay-abuse angle.
const IP_PER_10_MIN = 4
const IP_PER_DAY = 15
const RECIPIENT_PER_DAY = 3

export async function checkLeadRateLimit(opts: {
  ip: string | null
  email: string
  phone: string
}): Promise<LeadRateLimitResult> {
  const now = Date.now()
  const tenMinAgo = new Date(now - 10 * 60 * 1000)
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000)

  const [ipRecent, ipDay, recipientDay] = await Promise.all([
    opts.ip
      ? db.annuityLead.count({ where: { ipAddress: opts.ip, createdAt: { gte: tenMinAgo } } })
      : Promise.resolve(0),
    opts.ip
      ? db.annuityLead.count({ where: { ipAddress: opts.ip, createdAt: { gte: dayAgo } } })
      : Promise.resolve(0),
    db.annuityLead.count({
      where: {
        createdAt: { gte: dayAgo },
        OR: [
          { email: { equals: opts.email, mode: 'insensitive' } },
          { phone: opts.phone },
        ],
      },
    }),
  ])

  if (opts.ip && ipRecent >= IP_PER_10_MIN) {
    return { blocked: true, reason: 'Too many submissions. Please try again in a few minutes.' }
  }
  if (opts.ip && ipDay >= IP_PER_DAY) {
    return { blocked: true, reason: 'Daily submission limit reached. Please contact us directly.' }
  }
  if (recipientDay >= RECIPIENT_PER_DAY) {
    return { blocked: true, reason: 'We already have a recent request for this contact. We will be in touch.' }
  }

  return { blocked: false }
}
