// Shared HTML builder for the new-agent welcome email. Used by both the
// admin direct-invite path and the referral-approved path so they stay
// in sync. Keep the template inline-styled — most email clients (Gmail
// web, Apple Mail, Outlook 365) drop external CSS.
//
// Two distinct people drive the email — both editable from /vault/settings
// (no deploy needed):
//
//   Operations Contact: ongoing point of contact for the agent. Drives the
//   email's first-person voice and signature. Currently Natalia.
//   Settings keys: OPERATIONS_CONTACT_NAME / _LAST_NAME / _TITLE / _EMAIL
//   / _PHONE.
//
//   Onboarding Host: only does the initial Meet & Greet call (relationship
//   build + onboarding walkthrough). Currently Melinee (COO). Their
//   calendar link drives the booking button in the email.
//   Settings keys: ONBOARDING_HOST_NAME / _TITLE / _CALENDLY_URL.
//
// Other env-only knobs:
//   WELCOME_INTRO_VIDEO_URL — adds the "Watch this first" video block
//   DISCORD_INVITE_URL — Discord community invite (always shown)
//   WELCOME_ORIENTATION_CALENDLY_URL — legacy fallback for the host calendar

import { getSettings } from './settings'

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
    // Legacy env var still works as a fallback so nothing breaks for
    // older deploys that set this before the rename.
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

  // First-person voice when an ops contact is configured; "we" otherwise.
  const personalGreeting = ops.name
    ? `<p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">I'm <strong style="color:#fff;">${escapeHtml(ops.name)}</strong>, your point of contact at AFF for licensing, new business, carrier appointments, CE, and anything else you need. I'll be by your side from today through your first issued policy and well beyond. Anything you need, ask. The only wrong move is going quiet.</p>`
    : `<p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">We'll be by your side from today through your first issued policy and well beyond. Anything you need, ask. The only wrong move is going quiet.</p>`

  const replyHint = ops.name
    ? `If anything feels stuck or unclear, just reply to this email or write me directly at <a href="mailto:${ops.email}" style="color:#C9A96E; text-decoration:none;">${ops.email}</a>. We mean it when we say <em>family</em>.`
    : `If anything feels stuck or unclear, just reply to this email. We mean it when we say <em>family</em>. The families we build for our clients start with how we show up for each other.`

  // Personal sign-off when ops is configured; team sign-off otherwise.
  const phoneLine = ops.phone
    ? `<p style="color:#9BB0C4; margin:2px 0 0; font-size:12px;">${escapeHtml(ops.phone)}</p>`
    : ''
  const signOff = ops.name
    ? `
      <p style="color:#fff; margin:20px 0 0; font-size:14px;">Welcome aboard. We can't wait to watch you build.</p>
      <p style="color:#fff; margin:18px 0 0; font-weight:600;">Warmly,</p>
      <p style="color:#fff; margin:6px 0 0; font-weight:700; font-size:15px;">${escapeHtml(opsFullName)}</p>
      <p style="color:#C9A96E; margin:2px 0 0; font-weight:700; font-size:12px;">${escapeHtml(ops.title)} · All Financial Freedom</p>
      <p style="color:#9BB0C4; margin:6px 0 0; font-size:12px;">
        <a href="mailto:${ops.email}" style="color:#9BB0C4; text-decoration:none;">${ops.email}</a>
      </p>
      ${phoneLine}
    `
    : `
      <p style="color:#fff; margin:20px 0 0; font-size:14px;">Welcome aboard. We can't wait to watch you build.</p>
      <p style="color:#C9A96E; margin:4px 0 0; font-weight:700;">The All Financial Freedom Team</p>
    `

  const referralLine = referredByName
    ? `<p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">You were warmly referred by <strong style="color:#fff;">${escapeHtml(referredByName)}</strong>, and that recommendation says a lot about who you are and what you're capable of.</p>`
    : ''

  const introVideoBlock = introVideoUrl
    ? `
      <tr><td style="padding:24px 0 8px;">
        <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 8px;">Start here</p>
        <p style="color:#9BB0C4; margin:0 0 12px; line-height:1.6;">Take 8 minutes to watch your intro video. It'll ground you in who we are, how we operate, and what your first 90 days look like.</p>
        <a href="${introVideoUrl}" style="display:inline-block; padding:11px 22px; background:#1F2E47; color:#C9A96E; font-weight:700; text-decoration:none; border:1px solid rgba(201,169,110,0.4); border-radius:4px; font-size:13px;">▶ Watch the AFF Intro Video</a>
      </td></tr>
    `
    : ''

  // Meet & Greet block — Natalia introduces the new agent to Melinee (COO),
  // who actually hosts the call. Mirrors the warm 3-way text-message intro
  // the team already does manually.
  const meetAndGreetBlock = host.calendlyUrl
    ? `
      <tr><td style="padding:0;">
        <p style="color:#fff; font-weight:700; margin:0 0 4px;">3 · Meet our COO${host.name ? `, ${escapeHtml(host.name)}` : ''}</p>
        <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">${ops.name ? `I'd love to connect you with ${host.name ? `<strong style="color:#fff;">${escapeHtml(host.name)}</strong>` : '<strong style="color:#fff;">our COO</strong>'}, who personally hosts every new agent's <strong style="color:#fff;">Meet &amp; Greet</strong>. ` : `${host.name ? `<strong style="color:#fff;">${escapeHtml(host.name)}</strong>, our ${escapeHtml(host.title)}, ` : 'Our COO '}personally hosts every new agent's <strong style="color:#fff;">Meet &amp; Greet</strong>. `}It's a 60-minute call, just the two of you. No paperwork, no pressure. ${host.name ? `${escapeHtml(host.name)} ` : 'She '} will hear what brought you here, share how AFF actually operates, and at the end walk you through the onboarding side: licensing, carrier appointments, CE, E&amp;O, direct deposit. After this call you'll have a clear picture of your first 30 days.</p>
        <a href="${host.calendlyUrl}" style="display:inline-block; padding:11px 22px; background:#1F2E47; color:#C9A96E; font-weight:700; text-decoration:none; border:1px solid rgba(201,169,110,0.4); border-radius:4px; font-size:13px;">📅 Book your Meet &amp; Greet${host.name ? ` with ${escapeHtml(host.name)}` : ''}</a>
      </td></tr>
      <tr><td style="height:18px;"></td></tr>
    `
    : ''

  return `
    <div style="background:#0A1628; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:600px; margin:0 auto; background:#0F1E33; border-radius:10px; padding:36px 32px; color:#ffffff;">

        <h1 style="color:#C9A96E; font-size:24px; font-weight:600; margin:0 0 6px; letter-spacing:-0.01em;">
          Welcome to the All Financial Freedom family
        </h1>
        <p style="color:#9BB0C4; font-size:13px; margin:0 0 24px;">We're so glad you said yes.</p>

        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">Hi ${escapeHtml(firstName)},</p>

        ${referralLine}

        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">
          By joining us, you've taken a meaningful step toward something bigger than a career. It's a mission to help individuals and families build lasting financial legacies. We don't take that lightly. From this moment forward, you're not joining a company. You're joining a family.
        </p>

        ${personalGreeting}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
          ${introVideoBlock}
        </table>

        <hr style="border:none; border-top:1px solid rgba(201,169,110,0.12); margin:24px 0;" />

        <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 16px;">Your 48-hour onboarding checklist</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

          <tr><td style="padding:0;">
            <p style="color:#fff; font-weight:700; margin:0 0 4px;">1 · Activate your Agent Portal</p>
            <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">Your home base. Phase checklist, training schedule, carrier appointments, and progress tracker all live here.</p>
            <a href="${inviteUrl}" style="display:inline-block; padding:13px 26px; background:#C9A96E; color:#142D48; font-weight:700; text-decoration:none; border-radius:4px; font-size:14px;">Activate your portal →</a>
          </td></tr>
          <tr><td style="height:22px;"></td></tr>

          <tr><td style="padding:0;">
            <p style="color:#fff; font-weight:700; margin:0 0 4px;">2 · Join us on Discord</p>
            <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">Live trainings, announcements, recognition, real-time Q&amp;A, and the daily energy of the team.</p>
            <a href="${discordInvite}" style="display:inline-block; padding:11px 22px; background:#5865F2; color:#fff; font-weight:700; text-decoration:none; border-radius:4px; font-size:13px;">Join the AFF Discord</a>
          </td></tr>
          <tr><td style="height:22px;"></td></tr>

          ${meetAndGreetBlock}
        </table>

        <hr style="border:none; border-top:1px solid rgba(201,169,110,0.12); margin:24px 0;" />

        <p style="color:#9BB0C4; margin:0 0 8px; line-height:1.6; font-size:13px;">
          ${replyHint}
        </p>

        ${signOff}

        <hr style="border:none; border-top:1px solid rgba(255,255,255,0.06); margin:28px 0 16px;" />
        <p style="color:#4B5563; font-size:11px; margin:0;">
          This portal link expires in 72 hours.&nbsp;·&nbsp;
          <a href="${websiteUrl}" style="color:#6B8299; text-decoration:none;">allfinancialfreedom.com</a>
        </p>
      </div>
    </div>
  `
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
