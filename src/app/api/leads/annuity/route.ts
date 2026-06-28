import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { validatePhone, validateEmail } from '@/lib/contact-validation'
import {
  AGE_OPTIONS, SAVINGS_OPTIONS, TIMING_OPTIONS, PRIORITY_OPTIONS,
  CONSENT_TEXT, scoreLead,
} from '@/lib/annuity-leads'
import {
  getGhlConfig, getOrCreateGhlContactId, sendGhlSms, sendGhlEmail, ghlPut, OPS_MAILBOX,
} from '@/lib/ghl'
import { sendChannelMessage } from '@/lib/discord'
import { sendMetaLeadEvent } from '@/lib/meta-capi'
import {
  sanitizeName, capStr, escapeHtml, sanitizeOneLine, checkLeadRateLimit,
} from '@/lib/lead-abuse-guard'

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
  consent?: unknown
  pageUrl?: unknown
  referrer?: unknown
  utmSource?: unknown
  utmMedium?: unknown
  utmCampaign?: unknown
  utmContent?: unknown
  utmTerm?: unknown
  fbclid?: unknown
  company?: unknown // honeypot: hidden in the form, only bots fill it
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
  const metaEventId = randomUUID()

  const lead = await db.annuityLead.create({
    data: {
      firstName, lastName, email, phone,
      ageBand: body.ageBand,
      savingsBand: body.savingsBand,
      incomeTiming: body.incomeTiming,
      priority: body.priority,
      score,
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
      metaEventId,
    },
  })

  // Fan-out (best-effort). Run concurrently; never let one failure block
  // the response. GHL gives us the contactId we persist back on the lead.
  await Promise.allSettled([
    routeToGhl({ leadId: lead.id, firstName, lastName, email, phone, score }),
    notifyDiscord({ firstName, lastName, email, phone, score, lead }),
    sendMetaLeadEvent({
      eventId: metaEventId,
      eventSourceUrl: str(body.pageUrl) ?? undefined,
      email, phone, firstName, lastName,
      clientIp: ip ?? undefined,
      userAgent: userAgent ?? undefined,
      fbclid: str(body.fbclid) ?? undefined,
    }),
  ])

  // The client uses metaEventId to de-dupe its Pixel "Lead" event with the
  // server CAPI event above.
  return NextResponse.json({ ok: true, score, eventId: metaEventId })
}

// Create/find the GHL contact, set phone + tags so speed-to-lead
// automations fire and the SMS has a number to send to, then send the
// instant text + confirmation email. The score tag lets a GHL workflow
// branch A-leads (call first) from nurture.
async function routeToGhl(opts: {
  leadId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  score: 'A' | 'STANDARD' | 'NURTURE'
}): Promise<void> {
  try {
    const config = await getGhlConfig()
    if (!config.apiKey || !config.locationId) return

    const tags = ['meta-annuity-lead', `lead-score-${opts.score.toLowerCase()}`]
    const contactId = await getOrCreateGhlContactId({
      email: opts.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      tags,
      config,
    })
    if (!contactId) return

    // Ensure phone + tags + source are on the contact (the create path in
    // getOrCreateGhlContactId does not set phone, which SMS needs).
    await ghlPut(`/contacts/${contactId}`, {
      phone: opts.phone,
      tags,
      source: 'Meta Annuity Landing Page',
    }, config).catch(() => {})

    await db.annuityLead.update({
      where: { id: opts.leadId },
      data: { ghlContactId: contactId },
    }).catch(() => {})

    // Names are already sanitized at the API boundary (sanitizeName), but
    // we re-narrow per channel: a single line for SMS, HTML-escaped for
    // the email body. Defense in depth so this can never become an
    // injection vector even if the boundary changes.
    const smsName = sanitizeOneLine(opts.firstName)
    const emailName = escapeHtml(opts.firstName)

    // Speed-to-lead: instant text. Compliant (identifies us, STOP to opt
    // out). Best-effort so a missing location number doesn't break things.
    await sendGhlSms({
      contactId,
      message:
        `Hi ${smsName}, this is All Financial Freedom. Thanks for requesting your free ` +
        `retirement income estimate. A licensed agent will reach out shortly. Reply STOP to opt out.`,
      config,
    }).catch(() => {})

    await sendGhlEmail({
      contactId,
      emailTo: opts.email,
      subject: 'Your retirement income estimate request',
      emailFrom: OPS_MAILBOX.email,
      emailFromName: OPS_MAILBOX.name,
      html:
        `<p>Hi ${emailName},</p>` +
        `<p>Thanks for requesting a free, no-obligation retirement income estimate from ` +
        `All Financial Freedom. A licensed annuity professional will reach out shortly to ` +
        `put your personalized estimate together.</p>` +
        `<p>If you would like to talk sooner, call us at 917-603-5893.</p>` +
        `<p>All Financial Freedom is a licensed insurance agency. A licensed insurance agent ` +
        `will contact you.</p>`,
      config,
    }).catch(() => {})
  } catch (err) {
    console.warn('[leads/annuity] GHL routing failed:', err)
  }
}

// Post the lead to the staff-only leads channel. Uses a dedicated
// DISCORD_LEADS_CHANNEL_ID (create it with the same staff permissions as
// the activity channels), falling back to the admin channel until that
// env is set.
async function notifyDiscord(opts: {
  firstName: string
  lastName: string
  email: string
  phone: string
  score: 'A' | 'STANDARD' | 'NURTURE'
  lead: { ageBand: string; savingsBand: string; incomeTiming: string; priority: string }
}): Promise<void> {
  const channelId = process.env.DISCORD_LEADS_CHANNEL_ID || process.env.DISCORD_ADMIN_CHANNEL_ID
  if (!channelId || !process.env.DISCORD_BOT_TOKEN) return
  const heat = opts.score === 'A' ? '🔥 A-LEAD (call first)' : opts.score === 'NURTURE' ? '🌱 Nurture' : '📋 Standard'
  try {
    await sendChannelMessage(channelId, {
      embeds: [{
        title: `${heat} · ${opts.firstName} ${opts.lastName}`,
        color: opts.score === 'A' ? 0xC9A96E : 0x6B8299,
        fields: [
          { name: 'Phone', value: opts.phone, inline: true },
          { name: 'Email', value: opts.email, inline: true },
          { name: 'Age', value: opts.lead.ageBand, inline: true },
          { name: 'Saved', value: opts.lead.savingsBand, inline: true },
          { name: 'Income starts', value: opts.lead.incomeTiming, inline: true },
          { name: 'Priority', value: opts.lead.priority, inline: true },
        ],
      }],
    })
  } catch (err) {
    console.warn('[leads/annuity] Discord notify failed:', err)
  }
}
