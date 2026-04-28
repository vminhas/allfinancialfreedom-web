// Shared HTML builder for the new-agent welcome email. Used by both the
// admin direct-invite path and the referral-approved path so they stay
// in sync. Keep the template inline-styled — most email clients (Gmail
// web, Apple Mail, Outlook 365) drop external CSS.
//
// Optional sections appear only when the corresponding URL is configured:
//   WELCOME_INTRO_VIDEO_URL — the "watch this first" video
//   WELCOME_ORIENTATION_CALENDLY_URL — the LC's booking link for orientation
//   DISCORD_INVITE_URL — Discord community invite (always shown)

interface WelcomeEmailInput {
  firstName: string
  inviteUrl: string
  referredByName?: string | null
}

export function buildWelcomeEmailHtml({ firstName, inviteUrl, referredByName }: WelcomeEmailInput): string {
  const discordInvite = process.env.DISCORD_INVITE_URL ?? 'https://discord.gg/allfinancialfreedom'
  const introVideoUrl = process.env.WELCOME_INTRO_VIDEO_URL ?? ''
  const orientationCalendlyUrl = process.env.WELCOME_ORIENTATION_CALENDLY_URL ?? ''
  const websiteUrl = 'https://www.allfinancialfreedom.com'

  const referralLine = referredByName
    ? `<p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">You were warmly referred by <strong style="color:#fff;">${escapeHtml(referredByName)}</strong> — and that recommendation says a lot about who you are and what you're capable of.</p>`
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

  const orientationBlock = orientationCalendlyUrl
    ? `
      <tr><td style="padding:0;">
        <p style="color:#fff; font-weight:700; margin:0 0 4px;">Book your Licensing Orientation Call</p>
        <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">30 minutes with your licensing coordinator. We'll map out your exam, fingerprints, E&amp;O, carrier appointments, and direct deposit — everything you need to launch.</p>
        <a href="${orientationCalendlyUrl}" style="display:inline-block; padding:11px 22px; background:#1F2E47; color:#C9A96E; font-weight:700; text-decoration:none; border:1px solid rgba(201,169,110,0.4); border-radius:4px; font-size:13px;">📅 Book your call</a>
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
          By joining us, you've taken a meaningful step toward something bigger than a career — a mission to help individuals and families build lasting financial legacies. We don't take that lightly. From this moment forward, you're not joining a company. You're joining a family.
        </p>

        <p style="color:#9BB0C4; margin:0 0 24px; line-height:1.6;">
          We'll be by your side from today through your first issued policy and well beyond. Anything you need, ask. The only wrong move is going quiet.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
          ${introVideoBlock}
        </table>

        <hr style="border:none; border-top:1px solid rgba(201,169,110,0.12); margin:24px 0;" />

        <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 16px;">Your 48-hour onboarding checklist</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

          <tr><td style="padding:0;">
            <p style="color:#fff; font-weight:700; margin:0 0 4px;">1 · Activate your Agent Portal</p>
            <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">Your home base — phase checklist, training schedule, carrier appointments, and progress tracker all live here.</p>
            <a href="${inviteUrl}" style="display:inline-block; padding:13px 26px; background:#C9A96E; color:#142D48; font-weight:700; text-decoration:none; border-radius:4px; font-size:14px;">Activate your portal →</a>
          </td></tr>
          <tr><td style="height:22px;"></td></tr>

          <tr><td style="padding:0;">
            <p style="color:#fff; font-weight:700; margin:0 0 4px;">2 · Join us on Discord</p>
            <p style="color:#9BB0C4; margin:0 0 10px; font-size:13px; line-height:1.55;">Live trainings, announcements, recognition, real-time Q&amp;A, and the daily energy of the team.</p>
            <a href="${discordInvite}" style="display:inline-block; padding:11px 22px; background:#5865F2; color:#fff; font-weight:700; text-decoration:none; border-radius:4px; font-size:13px;">Join the AFF Discord</a>
          </td></tr>
          <tr><td style="height:22px;"></td></tr>

          ${orientationBlock}
        </table>

        <hr style="border:none; border-top:1px solid rgba(201,169,110,0.12); margin:24px 0;" />

        <p style="color:#9BB0C4; margin:0 0 8px; line-height:1.6; font-size:13px;">
          If anything feels stuck or unclear, just reply to this email. We mean it when we say <em>family</em> — and the families we build for our clients start with how we show up for each other.
        </p>

        <p style="color:#fff; margin:20px 0 0; font-size:14px;">
          Welcome aboard. We can't wait to watch you build.
        </p>
        <p style="color:#C9A96E; margin:4px 0 0; font-weight:700;">— The All Financial Freedom Team</p>

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
