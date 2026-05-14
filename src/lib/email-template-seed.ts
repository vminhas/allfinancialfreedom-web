// Idempotent seed for the email template system. Runs the first time
// the GHL webhook or the vault email-templates page is hit and the
// EmailSender table is empty. Creates three default senders and
// three default templates that reproduce the pre-DB hardcoded
// behavior of /api/ghl-webhook + /api/join exactly:
//
//   - Discovery call confirmation (CONTACT recipient)
//   - PropHog lead briefing (INTERNAL recipient, filtered on tag)
//   - Join form application confirmation (CONTACT recipient)
//
// After this runs once, every subsequent send goes through the DB-
// driven path. Admins can edit / disable / replace any of these via
// /vault/email-templates without touching code.

import { db } from './db'

const DEFAULT_SENDERS = [
  {
    key: 'contact',
    name: 'All Financial Freedom',
    email: 'contact@allfinancialfreedom.com',
    role: 'All Financial Freedom',
    isDefault: true,
  },
  {
    key: 'vick',
    name: 'Vick Minhas',
    email: 'vick@allfinancialfreedom.com',
    role: 'Chief Executive Officer, All Financial Freedom',
    isDefault: false,
  },
  {
    key: 'operations',
    name: 'All Financial Freedom',
    email: 'operations@allfinancialfreedom.com',
    role: 'Operations',
    isDefault: false,
  },
  {
    key: 'melinee',
    name: 'Melinee Minhas',
    email: 'melinee@allfinancialfreedom.com',
    role: 'Chief Operating Officer, All Financial Freedom',
    isDefault: false,
  },
]

// Template body HTML is the inner-body slice (NOT the brand shell —
// that wraps at send time). Authored in HTML here to keep the seed
// matching exactly what /api/ghl-webhook used to output; admins can
// re-author via WYSIWYG once they want to change the copy.
const DISCOVERY_BODY = `
<p>We are looking forward to connecting with you. This call is our opportunity to learn about your goals, answer your questions, and explore whether All Financial Freedom is the right fit.</p>
<div style="background:#F5F9FF;border:1px solid rgba(201,169,110,0.25);border-left:4px solid #C9A96E;border-radius:4px;padding:28px 32px;margin:24px 0;">
  <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 12px;">Your Appointment</p>
  <p style="color:#142D48;font-size:17px;font-weight:600;margin:0 0 4px;">Discovery Call &nbsp;&middot;&nbsp; 30 Minutes</p>
  <p style="color:#4B5563;font-size:14px;margin:0;">{{appointmentTime}}</p>
</div>
<div style="background:#142D48;border-radius:4px;padding:24px 32px;margin:0 0 24px;">
  <p style="color:rgba(235,244,255,0.6);font-size:13px;margin:0;line-height:1.7;">Need to reschedule? <a href="{{rescheduleUrl}}" style="color:#C9A96E;text-decoration:underline;">Click here to pick a new time.</a> We ask for at least 4 hours notice.</p>
</div>
<p>Questions? Reach us at <a href="mailto:contact@allfinancialfreedom.com" style="color:#1B3A5C;text-decoration:underline;">contact@allfinancialfreedom.com</a>.</p>
`.trim()

const PROPHOG_BRIEFING_BODY = `
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;width:160px;">Appointment</td><td style="padding:8px 0;color:#142D48;">{{appointmentTime}}</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;">Email</td><td style="padding:8px 0;color:#142D48;">{{email}}</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;">Phone</td><td style="padding:8px 0;color:#142D48;">{{phone}}</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;">License Type</td><td style="padding:8px 0;color:#142D48;">{{licenseType}}</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;">Current Agency</td><td style="padding:8px 0;color:#142D48;">{{currentAgency}}</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;">State</td><td style="padding:8px 0;color:#142D48;">{{state}}</td></tr>
  <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;">Lead Type</td><td style="padding:8px 0;color:#142D48;">{{leadType}}</td></tr>
  <tr><td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;">Import File</td><td style="padding:8px 0;color:#142D48;">{{importFileName}}</td></tr>
</table>
`.trim()

const JOIN_BODY = `
<p>Thanks for your interest in All Financial Freedom. We received your application and a member of our team will be in touch shortly.</p>
<div style="background:#F5F9FF;border:1px solid rgba(201,169,110,0.25);border-left:4px solid #C9A96E;border-radius:4px;padding:24px 28px;margin:24px 0;">
  <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 10px;">Next step</p>
  <p style="color:#142D48;font-size:15px;margin:0 0 14px;">If you'd like to keep momentum, you can book a 30-minute discovery call with us directly.</p>
  <p style="margin:0;"><a href="{{bookingUrl}}" style="display:inline-block;background:#142D48;color:#ffffff;padding:11px 22px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.05em;">Pick a time</a></p>
</div>
<p>Questions in the meantime? Reach us at <a href="mailto:contact@allfinancialfreedom.com" style="color:#1B3A5C;text-decoration:underline;">contact@allfinancialfreedom.com</a>.</p>
`.trim()

interface DefaultTemplate {
  key: string
  label: string
  description: string
  eventType: string
  recipient: 'CONTACT' | 'INTERNAL'
  internalTo?: string
  filterJson?: unknown
  subject: string
  bodyHtml: string
  senderKey: string
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: 'discovery-confirmation',
    label: 'Discovery Call Confirmation',
    description: 'Sent to the prospect when they book a discovery call in GHL.',
    eventType: 'AppointmentCreate',
    recipient: 'CONTACT',
    subject: 'Your discovery call is confirmed, {{firstName}}.',
    bodyHtml: DISCOVERY_BODY,
    senderKey: 'contact',
  },
  {
    key: 'prophog-briefing',
    label: 'PropHog Lead Briefing',
    description: 'Internal heads-up to Vick when a tagged PropHog lead books a call.',
    eventType: 'AppointmentCreate',
    recipient: 'INTERNAL',
    internalTo: 'vick@allfinancialfreedom.com',
    filterJson: { tagStartsWith: 'prophog' },
    subject: 'PropHog lead booked: {{firstName}} {{lastName}} ({{appointmentTime}})',
    bodyHtml: PROPHOG_BRIEFING_BODY,
    senderKey: 'contact',
  },
  {
    key: 'join-confirmation',
    label: 'Join Application Confirmation',
    description: 'Sent to anyone who submits the public Join form on allfinancialfreedom.com.',
    eventType: 'JoinFormSubmitted',
    recipient: 'CONTACT',
    subject: 'We received your application, {{firstName}}.',
    bodyHtml: JOIN_BODY,
    senderKey: 'contact',
  },
]

let seedPromise: Promise<void> | null = null

// Runs once per process; subsequent calls share the in-flight promise
// so concurrent webhook + vault visits don't race to insert duplicate
// rows. The race is also handled at the DB layer (unique keys), this
// is just to avoid wasteful work.
export async function ensureEmailTemplateSeed(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = doSeed().catch(err => {
    seedPromise = null  // allow retry on next request if it failed
    throw err
  })
  return seedPromise
}

async function doSeed() {
  // Senders first — templates depend on them via senderKey lookup.
  for (const s of DEFAULT_SENDERS) {
    await db.emailSender.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    })
  }

  const senderByKey = new Map(
    (await db.emailSender.findMany({ where: { key: { in: DEFAULT_SENDERS.map(s => s.key) } } }))
      .map(s => [s.key, s.id]),
  )

  for (const t of DEFAULT_TEMPLATES) {
    const senderId = senderByKey.get(t.senderKey)
    if (!senderId) continue  // shouldn't happen, but be defensive
    await db.emailTemplate.upsert({
      where: { key: t.key },
      update: {},  // never overwrite admin edits — only insert if missing
      create: {
        key: t.key,
        label: t.label,
        description: t.description,
        eventType: t.eventType,
        recipient: t.recipient,
        internalTo: t.internalTo ?? null,
        filterJson: (t.filterJson as object | undefined) ?? undefined,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        senderId,
      },
    })
  }
}
