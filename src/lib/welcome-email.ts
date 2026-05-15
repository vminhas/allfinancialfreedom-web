// Shared HTML builder for the new-agent welcome email. Used by both the
// admin direct-invite path and the referral-approved path so they stay
// in sync.
//
// Template lives in the DB (EmailTemplate.key = 'agent-welcome') and
// is editable from /vault/email-templates. The conditional sub-sections
// — referral line, ops contact's personal greeting, intro video block,
// Meet & Greet with the COO block, sign-off, reply hint — are built
// HERE in code based on /vault/settings + env vars, then passed to
// the template as raw {{{rawBlocks}}}. That way the WYSIWYG editor
// stays simple (admins move pre-built blocks around + tweak the
// static copy) while show-when-configured logic stays out of the UI.
//
// Two distinct people drive the email — both editable from
// /vault/settings (no deploy needed):
//
//   Operations Contact: ongoing point of contact for the agent. Drives
//   the email's first-person voice and signature. Currently Natalia.
//   Settings keys: OPERATIONS_CONTACT_NAME / _LAST_NAME / _TITLE /
//   _EMAIL / _PHONE.
//
//   Onboarding Host: only does the initial Meet & Greet call. Drives
//   the booking button. Currently Melinee (COO). Settings keys:
//   ONBOARDING_HOST_NAME / _TITLE / _CALENDLY_URL.

import { getSettings } from './settings'
import { db } from './db'
import { substituteVarsHtml, type RenderContext } from './email-template'
import { ensureEmailTemplateSeed } from './email-template-seed'

interface WelcomeEmailInput {
  firstName: string
  inviteUrl: string
  referredByName?: string | null
}

interface OperationsContact {
  name: string
  lastName: string
  title: string
  email: string
  phone: string
}

interface OnboardingHost {
  name: string
  title: string
  calendlyUrl: string
}

async function loadOperationsContact(): Promise<OperationsContact> {
  const stored = await getSettings([
    'OPERATIONS_CONTACT_NAME',
    'OPERATIONS_CONTACT_LAST_NAME',
    'OPERATIONS_CONTACT_TITLE',
    'OPERATIONS_CONTACT_EMAIL',
    'OPERATIONS_CONTACT_PHONE',
  ]).catch(() => ({} as Record<string, string>))

  const pick = (settingKey: string, envKey: string, fallback = ''): string => {
    const fromDb = stored[settingKey]
    if (fromDb && fromDb.length > 0) return fromDb
    return process.env[envKey] ?? fallback
  }

  return {
    name:     pick('OPERATIONS_CONTACT_NAME',      'OPERATIONS_CONTACT_NAME'),
    lastName: pick('OPERATIONS_CONTACT_LAST_NAME', 'OPERATIONS_CONTACT_LAST_NAME'),
    title:    pick('OPERATIONS_CONTACT_TITLE',     'OPERATIONS_CONTACT_TITLE', 'Agent Operations'),
    email:    pick('OPERATIONS_CONTACT_EMAIL',     'OPERATIONS_CONTACT_EMAIL', 'operations@allfinancialfreedom.com'),
    phone:    pick('OPERATIONS_CONTACT_PHONE',     'OPERATIONS_CONTACT_PHONE'),
  }
}

async function loadOnboardingHost(): Promise<OnboardingHost> {
  const stored = await getSettings([
    'ONBOARDING_HOST_NAME',
    'ONBOARDING_HOST_TITLE',
    'ONBOARDING_HOST_CALENDLY_URL',
  ]).catch(() => ({} as Record<string, string>))

  const pick = (settingKey: string, envKey: string, fallback = ''): string => {
    const fromDb = stored[settingKey]
    if (fromDb && fromDb.length > 0) return fromDb
    return process.env[envKey] ?? fallback
  }

  return {
    name:        pick('ONBOARDING_HOST_NAME',         'ONBOARDING_HOST_NAME'),
    title:       pick('ONBOARDING_HOST_TITLE',        'ONBOARDING_HOST_TITLE', 'COO'),
    // Legacy env var still works as a fallback so older deploys that
    // set this before the rename keep working.
    calendlyUrl: pick('ONBOARDING_HOST_CALENDLY_URL', 'WELCOME_ORIENTATION_CALENDLY_URL'),
  }
}

export async function buildWelcomeEmailHtml({ firstName, inviteUrl, referredByName }: WelcomeEmailInput): Promise<string> {
  const discordInvite = process.env.DISCORD_INVITE_URL ?? 'https://discord.gg/allfinancialfreedom'
  const introVideoUrl = process.env.WELCOME_INTRO_VIDEO_URL ?? ''
  const websiteUrl = 'https://www.allfinancialfreedom.com'

  const ops = await loadOperationsContact()
  const host = await loadOnboardingHost()
  const opsFullName = ops.name && ops.lastName ? `${ops.name} ${ops.lastName}` : ops.name

  // Pre-render the conditional sub-sections. Each one returns either
  // a fully-rendered HTML string or '' so the corresponding {{{block}}}
  // in the template collapses cleanly when not needed.
  const referralLine = referredByName
    ? `<p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">You were warmly referred by <strong style="color:#fff;">${escapeHtml(referredByName)}</strong>, and that recommendation says a lot about who you are and what you're capable of.</p>`
    : ''

  const personalGreeting = ops.name
    ? `<p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">I'm <strong style="color:#fff;">${escapeHtml(ops.name)}</strong>, your point of contact at AFF for licensing, new business, carrier appointments, CE, and anything else you need. I'll be by your side from today through your first issued policy and well beyond. Anything you need, ask. The only wrong move is going quiet.</p>`
    : `<p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">We'll be by your side from today through your first issued policy and well beyond. Anything you need, ask. The only wrong move is going quiet.</p>`

  const replyHint = ops.name
    ? `If anything feels stuck or unclear, just reply to this email or write me directly at <a href="mailto:${ops.email}" style="color:#C9A96E; text-decoration:none;">${ops.email}</a>. We mean it when we say <em>family</em>.`
    : `If anything feels stuck or unclear, just reply to this email. We mean it when we say <em>family</em>. The families we build for our clients start with how we show up for each other.`

  const phoneLine = ops.phone
    ? `<p style="color:#9BB0C4; margin:2px 0 0; font-size:12px;">${escapeHtml(ops.phone)}</p>`
    : ''
  const signOff = ops.name
    ? `
      <p style="color:#fff; margin:20px 0 0; font-size:14px;">Welcome aboard. We can't wait to watch you build.</p>
      <p style="color:#fff; margin:18px 0 0; font-weight:600;">Warmly,</p>
      <p style="color:#fff; margin:6px 0 0; font-weight:700; font-size:15px;">${escapeHtml(opsFullName)}</p>
      <p style="color:#C9A96E; margin:2px 0 0; font-weight:700; font-size:12px;">${escapeHtml(ops.title)} &middot; All Financial Freedom</p>
      <p style="color:#9BB0C4; margin:6px 0 0; font-size:12px;">
        <a href="mailto:${ops.email}" style="color:#9BB0C4; text-decoration:none;">${ops.email}</a>
      </p>
      ${phoneLine}
    `
    : `
      <p style="color:#fff; margin:20px 0 0; font-size:14px;">Welcome aboard. We can't wait to watch you build.</p>
      <p style="color:#C9A96E; margin:4px 0 0; font-weight:700;">The All Financial Freedom Team</p>
    `

  const introVideoBlock = introVideoUrl
    ? `
      <tr><td style="padding:24px 0 8px;">
        <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 8px;">Start here</p>
        <p style="color:#9BB0C4; margin:0 0 12px; line-height:1.6;">Take 8 minutes to watch your intro video. It'll ground you in who we are, how we operate, and what your first 90 days look like.</p>
        <a href="${introVideoUrl}" style="display:inline-block; padding:11px 22px; background:#1F2E47; color:#C9A96E; font-weight:700; text-decoration:none; border:1px solid rgba(201,169,110,0.4); border-radius:4px; font-size:13px;">&#9654; Watch the AFF Intro Video</a>
      </td></tr>
    `
    : ''

  const meetAndGreetBlock = host.calendlyUrl
    ? `
      <tr><td style="padding:0;">
        <p style="color:#fff; font-weight:700; margin:0 0 4px;">3 &middot; Meet our COO${host.name ? `, ${escapeHtml(host.name)}` : ''}</p>
        <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">${ops.name ? `I'd love to connect you with ${host.name ? `<strong style="color:#fff;">${escapeHtml(host.name)}</strong>` : '<strong style="color:#fff;">our COO</strong>'}, who personally hosts every new agent's <strong style="color:#fff;">Meet &amp; Greet</strong>. ` : `${host.name ? `<strong style="color:#fff;">${escapeHtml(host.name)}</strong>, our ${escapeHtml(host.title)}, ` : 'Our COO '}personally hosts every new agent's <strong style="color:#fff;">Meet &amp; Greet</strong>. `}It's a 60-minute call, just the two of you. No paperwork, no pressure. ${host.name ? `${escapeHtml(host.name)} ` : 'She '} will hear what brought you here, share how AFF actually operates, and at the end walk you through the onboarding side: licensing, carrier appointments, CE, E&amp;O, direct deposit. After this call you'll have a clear picture of your first 30 days.</p>
        <a href="${host.calendlyUrl}" style="display:inline-block; padding:11px 22px; background:#1F2E47; color:#C9A96E; font-weight:700; text-decoration:none; border:1px solid rgba(201,169,110,0.4); border-radius:4px; font-size:13px;">&#128197; Book your Meet &amp; Greet${host.name ? ` with ${escapeHtml(host.name)}` : ''}</a>
      </td></tr>
      <tr><td style="height:18px;"></td></tr>
    `
    : ''

  // Load the DB template + render. ensureEmailTemplateSeed makes sure
  // the default row exists before we look it up — first prod boot
  // after this deploy, the seeder runs and inserts the row.
  await ensureEmailTemplateSeed()
  const template = await db.emailTemplate.findUnique({
    where: { key: 'agent-welcome' },
    select: { bodyHtml: true },
  })

  const ctx: RenderContext = {
    firstName,
    inviteUrl,
    discordInvite,
    websiteUrl,
    referralLine,
    personalGreeting,
    introVideoBlock,
    meetAndGreetBlock,
    signOff,
    replyHint,
  }
  return substituteVarsHtml(template?.bodyHtml ?? '', ctx)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
