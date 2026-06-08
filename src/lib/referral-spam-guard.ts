// Spam defenses for the agent referral submit endpoint.
//
// Background: an agent recently submitted multiple referrals with
// fake placeholder emails ("donthave26@gmail.com", "donthave27@...")
// and identical-pattern notes within minutes of each other. None of
// these defenses existed before, so the only floor was format +
// uniqueness on the email — which sequential fakes trivially pass.
//
// Three layers:
//   1. validateEmail   — proper RFC-shape, plus a blocklist of
//                        obvious fake patterns ("donthave\d+",
//                        "noemail", "test@example", disposable-mail
//                        domains).
//   2. checkRateLimit  — per-referrer ceilings: 5 per hour, 15 per
//                        rolling 24 hours. Defensive numbers picked
//                        so an enthusiastic legit recruiter on a
//                        good day still fits comfortably.
//   3. abuse flag      — when a referrer exceeds the daily limit
//                        twice within 7 days, surface to admin
//                        Discord for review. Their future submits
//                        are blocked at the rate-limit layer until
//                        an admin lifts the flag.

import { db } from '@/lib/db'

// Patterns that are obvious placeholder / fake / disposable emails.
// Local-part patterns first, then disposable-mail domain suffixes.
// Conservative — only matches what's clearly bogus, not aggressive
// rejection of legitimate-but-unusual addresses.
const FAKE_LOCAL_PATTERNS: RegExp[] = [
  /^donthave\d*$/i,            // donthave26@..., donthave@...
  /^no[-_.]?email\d*$/i,       // noemail27@..., no-email@...
  /^fake\d*$/i,
  /^test\d*$/i,
  /^example\d*$/i,
  /^placeholder\d*$/i,
  /^anonymous\d*$/i,
  /^noreply\d*$/i,
  /^x{2,}\d*$/i,               // xx@..., xxx@...
  /^a{4,}\d*$/i,               // aaaa@... (mash typing)
]

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'trashmail.com', 'guerrillamail.com', 'guerrillamail.info',
  'tempmail.com', '10minutemail.com', 'temp-mail.org', 'sharklasers.com',
  'throwaway.email', 'maildrop.cc', 'getnada.com', 'mintemail.com',
  'yopmail.com', 'fakeinbox.com', 'mailnesia.com', 'inboxbear.com',
  'dispostable.com', 'spam4.me', 'mohmal.com', 'tempr.email',
])

// Format check + fake-pattern + disposable-domain reject. Returns
// null when ok, or a user-visible reason when rejected.
export function validateReferralEmail(raw: string): string | null {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v) return 'A valid email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'A valid email is required'

  const [local, domain] = v.split('@')
  if (!local || !domain) return 'A valid email is required'

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return 'Disposable / temporary email addresses are not accepted. Use the recruit’s real email.'
  }
  for (const re of FAKE_LOCAL_PATTERNS) {
    if (re.test(local)) {
      return 'That looks like a placeholder email (e.g. donthave@… / noemail@…). Use the recruit’s real email so they receive their welcome.'
    }
  }
  return null
}

// Per-referrer ceilings. A productive recruiting day for one agent
// rarely exceeds these; the thresholds are picked so any single
// hit means "stop and verify," not "you're spamming."
export const REFERRAL_LIMITS = {
  perHour: 5,
  perDay: 15,
}

export interface RateLimitResult {
  ok: boolean
  reason?: string
  // Whether this submit should also trip the admin abuse alert.
  trippedAbuseFlag?: boolean
}

// Look at the referrer's recent submissions and decide whether the
// pending one is allowed. Counts ALL their referrals (any status),
// because a flood of rejected-spam still demonstrates the behavior
// we want to slow down.
export async function checkReferralRateLimit(
  referringAgentId: string,
): Promise<RateLimitResult> {
  const now = Date.now()
  const oneHourAgo = new Date(now - 60 * 60 * 1000)
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

  const [hourCount, dayCount, weekDayBuckets] = await Promise.all([
    db.agentReferral.count({
      where: { referringAgentId, createdAt: { gte: oneHourAgo } },
    }),
    db.agentReferral.count({
      where: { referringAgentId, createdAt: { gte: oneDayAgo } },
    }),
    db.agentReferral.findMany({
      where: { referringAgentId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),
  ])

  if (hourCount >= REFERRAL_LIMITS.perHour) {
    return {
      ok: false,
      reason: `You’ve submitted ${hourCount} referrals in the last hour. The limit is ${REFERRAL_LIMITS.perHour} per hour. Please wait before submitting more, or reach out to your upline if these are all real.`,
    }
  }
  if (dayCount >= REFERRAL_LIMITS.perDay) {
    // Daily cap hit. Check whether this is the SECOND time in 7 days
    // they've pushed up against the daily ceiling — that pattern is
    // the abuse signal we want admins to see.
    const daysHittingCap = countDaysAtOrNearCap(weekDayBuckets.map(r => r.createdAt))
    const trippedAbuseFlag = daysHittingCap >= 2
    return {
      ok: false,
      reason: `You’ve submitted ${dayCount} referrals in the last 24 hours. The daily limit is ${REFERRAL_LIMITS.perDay}. ${trippedAbuseFlag ? 'An admin has been alerted; please reach out to your upline.' : 'Please wait before submitting more.'}`,
      trippedAbuseFlag,
    }
  }

  return { ok: true }
}

// Group submission timestamps by ET calendar day and count how many
// days came within 2 of the daily cap. Two such days in a week is a
// stronger signal than a single bad afternoon.
function countDaysAtOrNearCap(dates: Date[]): number {
  const counts = new Map<string, number>()
  for (const d of dates) {
    const k = d.toLocaleDateString('en-CA') // YYYY-MM-DD
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let n = 0
  for (const v of counts.values()) {
    if (v >= REFERRAL_LIMITS.perDay - 2) n += 1
  }
  return n
}
