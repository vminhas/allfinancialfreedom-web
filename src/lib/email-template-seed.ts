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

// Welcome email body. Authors edit the static copy + the position of
// the {{{rawBlocks}}}; the blocks themselves (referralLine, the ops
// contact's personal greeting, intro video, Meet & Greet with the
// COO, sign-off, reply hint) are pre-rendered in code so the show/
// hide-when-configured logic stays out of the WYSIWYG editor. See
// lib/welcome-email.ts for the conditional rendering.
const AGENT_INVITE_BODY = `
<div style="background:#0A1628; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px; margin:0 auto; background:#0F1E33; border-radius:10px; padding:36px 32px; color:#ffffff;">
    <h1 style="color:#C9A96E; font-size:24px; font-weight:600; margin:0 0 6px; letter-spacing:-0.01em;">Welcome to the All Financial Freedom family</h1>
    <p style="color:#9BB0C4; font-size:13px; margin:0 0 24px;">We're so glad you said yes.</p>
    <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">Hi {{firstName}},</p>
    {{{referralLine}}}
    <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">By joining us, you've taken a meaningful step toward something bigger than a career. It's a mission to help individuals and families build lasting financial legacies. We don't take that lightly. From this moment forward, you're not joining a company. You're joining a family.</p>
    {{{personalGreeting}}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
      {{{introVideoBlock}}}
    </table>
    <hr style="border:none; border-top:1px solid rgba(201,169,110,0.12); margin:24px 0;" />
    <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 16px;">Your 48-hour onboarding checklist</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0;">
        <p style="color:#fff; font-weight:700; margin:0 0 4px;">1 &middot; Activate your Agent Portal</p>
        <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">Your home base. Phase checklist, training schedule, carrier appointments, and progress tracker all live here.</p>
        <a href="{{inviteUrl}}" style="display:inline-block; padding:13px 26px; background:#C9A96E; color:#142D48; font-weight:700; text-decoration:none; border-radius:4px; font-size:14px;">Activate your portal &rarr;</a>
      </td></tr>
      <tr><td style="height:22px;"></td></tr>
      <tr><td style="padding:0;">
        <p style="color:#fff; font-weight:700; margin:0 0 4px;">2 &middot; Join us on Discord</p>
        <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">Live trainings, announcements, recognition, real-time Q&amp;A, and the daily energy of the team.</p>
        <a href="{{discordInvite}}" style="display:inline-block; padding:11px 22px; background:#5865F2; color:#fff; font-weight:700; text-decoration:none; border-radius:4px; font-size:13px;">Join the AFF Discord</a>
      </td></tr>
      <tr><td style="height:22px;"></td></tr>
      {{{meetAndGreetBlock}}}
    </table>
    <hr style="border:none; border-top:1px solid rgba(201,169,110,0.12); margin:24px 0;" />
    <p style="color:#9BB0C4; margin:0 0 8px; line-height:1.6; font-size:13px;">{{{replyHint}}}</p>
    {{{signOff}}}
    <hr style="border:none; border-top:1px solid rgba(255,255,255,0.06); margin:28px 0 16px;" />
    <p style="color:#4B5563; font-size:11px; margin:0;">This portal link expires in 72 hours.&nbsp;&middot;&nbsp;<a href="{{websiteUrl}}" style="color:#6B8299; text-decoration:none;">allfinancialfreedom.com</a></p>
  </div>
</div>
`.trim()

// CEO warm intro body. Single conditional block: the agent's personal
// note rendered as a blockquote when present. See lib/ceo-intro-email.ts.
const PROSPECT_INTRO_BODY = `
<div style="background:#0A1628; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px; margin:0 auto; background:#0F1E33; border-radius:10px; padding:36px 32px; color:#ffffff;">
    <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 12px;">A warm introduction</p>
    <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">Hi {{prospectFirstName}},</p>
    <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">I'm Vick Minhas, the founder and CEO of All Financial Freedom. <strong style="color:#fff;">{{agentFullName}}</strong>, {{agentRoleLabel}}, mentioned you to me, and thought you'd be a great fit for what we're building.</p>
    {{{personalNoteBlock}}}
    <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">We help everyday people build a financial business that gives them income, ownership, and a real path to time freedom. Not a job, not a side hustle, a business. We work with people from all walks of life: nurses, teachers, real-estate pros, business owners, parents who want something more flexible. What {{agentFirstName}} saw in you matters; that's usually the strongest signal.</p>
    <p style="color:#9BB0C4; margin:0 0 24px; line-height:1.6;">If you're even a little curious, grab 15 minutes with someone on our team (usually our COO). No pitch, no pressure. Just a real conversation about what you're after and whether what we do could fit.</p>
    <div style="text-align:center; margin:0 0 24px;">
      <a href="{{bookingUrl}}" style="display:inline-block; padding:14px 32px; background:#C9A96E; color:#142D48; font-weight:700; text-decoration:none; border-radius:4px; font-size:14px;">Book a 15-minute conversation &rarr;</a>
    </div>
    <p style="color:#9BB0C4; margin:0 0 8px; line-height:1.6; font-size:13px;">If the calendar doesn't work, just reply to this email and we'll find a time.</p>
    <p style="color:#fff; margin:24px 0 0; font-weight:600;">Talk soon,</p>
    <p style="color:#fff; margin:6px 0 0; font-weight:700; font-size:15px;">Vick Minhas</p>
    <p style="color:#C9A96E; margin:2px 0 0; font-weight:700; font-size:12px;">CEO &middot; All Financial Freedom</p>
    <hr style="border:none; border-top:1px solid rgba(255,255,255,0.06); margin:28px 0 16px;" />
    <p style="color:#4B5563; font-size:11px; margin:0;"><a href="{{websiteUrl}}" style="color:#6B8299; text-decoration:none;">allfinancialfreedom.com</a></p>
  </div>
</div>
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
  {
    key: 'agent-welcome',
    label: 'New Agent Welcome',
    description: 'The 48-hour onboarding welcome email. Sent on referral approval, admin direct invite, Tevah-sync auto-invite, and "Resend invite" from the My Team tab. Conditional sub-sections (referral line, ops personal greeting, intro video, Meet & Greet, sign-off) are pre-rendered in code based on /vault/settings and the optional WELCOME_INTRO_VIDEO_URL env var.',
    eventType: 'AgentInviteSent',
    recipient: 'CONTACT',
    subject: 'Welcome to the All Financial Freedom family',
    bodyHtml: AGENT_INVITE_BODY,
    senderKey: 'operations',
  },
  {
    key: 'ceo-warm-intro',
    label: 'CEO Warm Intro to Prospect',
    description: 'Fired when an agent clicks "Send CEO intro" on a Business Partner prospect row. Voice + signature stay Vick. The agent-personal-note block renders only when the agent typed one in the send dialog.',
    eventType: 'ProspectIntroSent',
    recipient: 'CONTACT',
    subject: "{{agentFirstName}} thought you'd be a great fit",
    bodyHtml: PROSPECT_INTRO_BODY,
    senderKey: 'vick',
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

// Legacy stub template keys from the original placeholder system.
// They have no real sender and aren't wired to any current flow. One
// of them (referral_approved) got its eventType mis-set to
// AppointmentCreate and started emailing a "Set Up Your Portal"
// invite to every prospect who booked a discovery call. We hard-
// disable + un-wire them on every seed run so they can't fire
// regardless of what's in the DB, and so they stop cluttering the
// vault editor's event groups. Deleting outright would also be fine,
// but disabling + null-ing the event type is reversible and keeps
// any historical reference intact.
const LEGACY_STUB_KEYS = [
  'referral_approved',
  'agent_invite',
  'agent_reminder',
  'promotion_celebration',
]

async function doSeed() {
  // Senders first — templates depend on them via senderKey lookup.
  for (const s of DEFAULT_SENDERS) {
    await db.emailSender.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    })
  }

  // Self-heal: neutralize the legacy stubs. enabled=false stops them
  // dispatching; eventType=null pulls them out of every webhook event
  // group so they can't be the rogue "also fired" template again.
  await db.emailTemplate.updateMany({
    where: { key: { in: LEGACY_STUB_KEYS } },
    data: { enabled: false, eventType: null },
  })

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
