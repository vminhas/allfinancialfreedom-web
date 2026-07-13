import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { validatePhone, validateEmail } from '@/lib/contact-validation'
import {
  AGE_OPTIONS, SAVINGS_OPTIONS, TIMING_OPTIONS, PRIORITY_OPTIONS, ACCOUNT_TYPE_OPTIONS,
  REFERRAL_SOURCE_OPTIONS, REFERRAL_AGENT_OPTION,
  CONSENT_TEXT, scoreLead, leadValueUsd,
} from '@/lib/annuity-leads'
import { sendMetaLeadEvent } from '@/lib/meta-capi'
import { sanitizeName, capStr, checkLeadRateLimit } from '@/lib/lead-abuse-guard'
import { routeLeadToGhl, notifyLeadDiscord, LEADS_PIPELINE_ENABLED } from '@/lib/lead-pipeline'

// Public, unauthenticated lead capture for the retirement-income landing
// page. This endpoint is the TCPA system of record (it persists the exact
// consent text + when/where/how), then best-effort fans the lead out to
// GoHighLevel (speed-to-lead SMS + agent routing), a staff Discord
// channel, and Meta's Conversions API. None of those side effects can
// block or fail the capture: the lead is saved first, everything else is
// fire-and-forget.

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')
}

function oneOf<T extends readonly string[]>(options: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (options as readonly string[]).includes(v)
}

interface LeadBody {
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  phone?: unknown
  ageBand?: unknown
  savingsBand?: unknown
  incomeTiming?: unknown
  priority?: unknown
  accountTypes?: unknown
  referralSource?: unknown
  referrerName?: unknown
  consent?: unknown
  pageUrl?: unknown
  referrer?: unknown
  utmSource?: unknown
  utmMedium?: unknown
  utmCampaign?: unknown
  utmContent?: unknown
  utmTerm?: unknown
  fbclid?: unknown
  gclid?: unknown      // Google Ads click id, for offline conversion import
  gaClientId?: unknown // GA4 client_id from the _ga cookie
  company?: unknown // honeypot: hidden in the form, only bots fill it
  test?: unknown    // test-mode submit: fire tracking, skip the pipeline
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null

export async function POST(req: NextRequest) {
  let body: LeadBody
  try {
    body = await req.json() as LeadBody
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Honeypot: a hidden "company" field the real form never fills. Bots
  // that auto-fill every input trip it. Respond with a benign success so
  // the bot can't tell it was dropped, but store + send nothing.
  if (str(body.company)) {
    return NextResponse.json({ ok: true, eventId: randomUUID() })
  }

  // Contact fields. Names are sanitized (control chars + angle brackets
  // stripped, capped) so they can't carry HTML/links into the email/SMS;
  // email/phone are length-capped. This runs BEFORE any persistence or
  // outbound send.
  const firstNameRaw = str(body.firstName)
  const lastNameRaw = str(body.lastName)
  const firstName = firstNameRaw ? sanitizeName(firstNameRaw) : null
  const lastName = lastNameRaw ? sanitizeName(lastNameRaw) : null
  const email = str(body.email) ? capStr(body.email as string, 200) : null
  const phone = str(body.phone) ? capStr(body.phone as string, 30) : null
  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json({ error: 'Please fill in your name, email, and phone.' }, { status: 400 })
  }
  const emailErr = validateEmail(email)
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 })
  const phoneErr = validatePhone(phone)
  if (phoneErr) return NextResponse.json({ error: phoneErr }, { status: 400 })

  // Qualifiers, validated against the fixed option sets so a tampered
  // payload can't store junk in the consent record.
  if (
    !oneOf(AGE_OPTIONS, body.ageBand) ||
    !oneOf(SAVINGS_OPTIONS, body.savingsBand) ||
    !oneOf(TIMING_OPTIONS, body.incomeTiming) ||
    !oneOf(PRIORITY_OPTIONS, body.priority)
  ) {
    return NextResponse.json({ error: 'Please answer all four questions.' }, { status: 400 })
  }

  // Account types: multi-select, at least one, each from the fixed set,
  // de-duplicated and capped at the option count.
  const allowedAccounts = ACCOUNT_TYPE_OPTIONS as readonly string[]
  const accountTypes = Array.isArray(body.accountTypes)
    ? [...new Set(body.accountTypes.filter((v): v is string => typeof v === 'string' && allowedAccounts.includes(v)))]
        .slice(0, allowedAccounts.length)
    : []
  if (accountTypes.length === 0) {
    return NextResponse.json({ error: 'Please select at least one retirement account type.' }, { status: 400 })
  }

  // Optional referral / attribution. Source must be one of the fixed
  // options; the referrer name is only kept when the AFF-agent option is
  // chosen (sanitized like any name).
  const referralSource = oneOf(REFERRAL_SOURCE_OPTIONS, body.referralSource) ? body.referralSource : null
  const referrerName = referralSource === REFERRAL_AGENT_OPTION && str(body.referrerName)
    ? sanitizeName(body.referrerName as string) || null
    : null

  // Consent is required and explicit. We store our own server-side
  // CONSENT_TEXT constant, never client-supplied text, so the record is
  // tamper-proof.
  if (body.consent !== true) {
    return NextResponse.json({ error: 'Please agree to be contacted to continue.' }, { status: 400 })
  }

  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent')

  // Rate limit before we persist or send anything. This is what stops the
  // endpoint being used as a phishing/smishing relay or a spam/cost sink:
  // per-IP ceilings and a per-recipient cap on how often any one
  // email/phone can be contacted.
  const limit = await checkLeadRateLimit({ ip, email, phone })
  if (limit.blocked) {
    return NextResponse.json({ error: limit.reason }, { status: 429 })
  }

  const score = scoreLead({ savingsBand: body.savingsBand, incomeTiming: body.incomeTiming })
  const value = leadValueUsd(score)
  const metaEventId = randomUUID()

  // Test-mode submit (from /retirement-income?test=1): the request passed
  // all real validation, so it verifies the full form path, but we return
  // success WITHOUT creating a lead or firing any pipeline side effect (no
  // DB row, GHL, SMS, email, Discord, or server CAPI). The client still
  // fires the GA4 generate_lead + Pixel Lead so conversion tracking can be
  // activated/verified without polluting the sales pipeline.
  if (body.test === true) {
    return NextResponse.json({ ok: true, test: true, score, value, eventId: metaEventId })
  }

  const lead = await db.annuityLead.create({
    data: {
      firstName, lastName, email, phone,
      ageBand: body.ageBand,
      savingsBand: body.savingsBand,
      incomeTiming: body.incomeTiming,
      priority: body.priority,
      accountTypes,
      referralSource,
      referrerName,
      score,
      source: 'landing_page',
      consentText: CONSENT_TEXT,
      consentedAt: new Date(),
      ipAddress: ip,
      userAgent: userAgent ? capStr(userAgent, 500) : null,
      pageUrl: str(body.pageUrl) ? capStr(body.pageUrl as string, 600) : null,
      referrer: str(body.referrer) ? capStr(body.referrer as string, 600) : null,
      utmSource: str(body.utmSource) ? capStr(body.utmSource as string, 200) : null,
      utmMedium: str(body.utmMedium) ? capStr(body.utmMedium as string, 200) : null,
      utmCampaign: str(body.utmCampaign) ? capStr(body.utmCampaign as string, 200) : null,
      utmContent: str(body.utmContent) ? capStr(body.utmContent as string, 200) : null,
      utmTerm: str(body.utmTerm) ? capStr(body.utmTerm as string, 200) : null,
      fbclid: str(body.fbclid) ? capStr(body.fbclid as string, 512) : null,
      gclid: str(body.gclid) ? capStr(body.gclid as string, 512) : null,
      gaClientId: str(body.gaClientId) ? capStr(body.gaClientId as string, 100) : null,
      metaEventId,
    },
  })

  // Fan-out (best-effort). Run concurrently; never let one failure block
  // the response. The outbound pipeline (GHL contact/SMS/email via
  // routeLeadToGhl, and the Meta CAPI event below) is gated by
  // LEADS_PIPELINE_ENABLED: mycadre now owns the funnel and fires the Meta
  // event itself, so we must not double-contact the prospect or double-count
  // the pixel. routeLeadToGhl self-guards on the flag; the Meta event is gated
  // here. The staff Discord notify stays on (internal only). Flip the flag in
  // lead-pipeline.ts to restore everything.
  await Promise.allSettled([
    routeLeadToGhl({ leadId: lead.id, firstName, lastName, email, phone, score }),
    notifyLeadDiscord({ firstName, lastName, email, phone, score, source: 'landing_page', lead }),
    ...(LEADS_PIPELINE_ENABLED ? [sendMetaLeadEvent({
      eventId: metaEventId,
      eventSourceUrl: str(body.pageUrl) ?? undefined,
      email, phone, firstName, lastName,
      clientIp: ip ?? undefined,
      userAgent: userAgent ?? undefined,
      fbclid: str(body.fbclid) ?? undefined,
      value, currency: 'USD',
    })] : []),
  ])

  // The client uses metaEventId to de-dupe its Pixel "Lead" event with the
  // server CAPI event above. value drives value-based bidding on the Pixel
  // Lead + the GA4 generate_lead event (Google Ads).
  return NextResponse.json({ ok: true, score, value, eventId: metaEventId })
}
