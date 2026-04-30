// HTML for the two emails involved in a self-serve email change:
//
//   1. Verification email - sent to the NEW address. Until the agent
//      clicks the link, nothing changes; the old email remains in
//      effect. Token-based, 24h expiry.
//
//   2. Security alert - sent to the OLD address. Lets the user cancel
//      the change if they didn't request it (account-takeover catch).
//      Cancel link uses the same token but a different endpoint.
//
// Both share AFF brand styling. No em dashes per project convention.

interface ChangeRequestInput {
  firstName: string
  oldEmail: string
  newEmail: string
  verifyUrl: string
  cancelUrl: string
}

export function buildEmailVerificationHtml(input: ChangeRequestInput): { subject: string; html: string } {
  const subject = 'Confirm your new All Financial Freedom email'
  const html = `
    <div style="background:#0A1628; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px; margin:0 auto; background:#0F1E33; border-radius:10px; padding:36px 32px; color:#ffffff;">
        <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 12px;">Confirm your email</p>
        <h1 style="color:#ffffff; font-size:22px; font-weight:600; margin:0 0 14px; letter-spacing:-0.01em;">
          Hi ${escapeHtml(input.firstName)}, let&apos;s lock in your new email
        </h1>
        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">
          Someone (hopefully you) asked to switch the email on your AFF agent account from
          <strong style="color:#ffffff;">${escapeHtml(input.oldEmail)}</strong> to
          <strong style="color:#ffffff;">${escapeHtml(input.newEmail)}</strong>.
        </p>
        <p style="color:#9BB0C4; margin:0 0 24px; line-height:1.6;">
          Click the button below to confirm. Until you do, nothing changes and you&apos;ll keep signing in with your old email.
        </p>
        <div style="text-align:center; margin:0 0 24px;">
          <a href="${input.verifyUrl}" style="display:inline-block; padding:14px 32px; background:#C9A96E; color:#142D48; font-weight:700; text-decoration:none; border-radius:4px; font-size:14px;">
            Confirm new email &rarr;
          </a>
        </div>
        <p style="color:#6B8299; font-size:12px; margin:0 0 8px; line-height:1.55;">
          This link expires in 24 hours. If you didn&apos;t request this change, ignore this email or contact
          <a href="mailto:operations@allfinancialfreedom.com" style="color:#C9A96E; text-decoration:none;">operations@allfinancialfreedom.com</a>.
        </p>
      </div>
    </div>
  `
  return { subject, html }
}

export function buildEmailChangeAlertHtml(input: ChangeRequestInput): { subject: string; html: string } {
  const subject = 'Your AFF email change was requested'
  const html = `
    <div style="background:#0A1628; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px; margin:0 auto; background:#0F1E33; border-radius:10px; padding:36px 32px; color:#ffffff;">
        <p style="color:#F59E0B; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 12px;">Security notice</p>
        <h1 style="color:#ffffff; font-size:22px; font-weight:600; margin:0 0 14px; letter-spacing:-0.01em;">
          Hi ${escapeHtml(input.firstName)}, an email change was requested
        </h1>
        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">
          Someone asked to change the email on your AFF agent account from this address
          (<strong style="color:#ffffff;">${escapeHtml(input.oldEmail)}</strong>) to
          <strong style="color:#ffffff;">${escapeHtml(input.newEmail)}</strong>.
        </p>
        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">
          <strong style="color:#ffffff;">If this was you</strong>, no action needed. The change won&apos;t finalize until you click the verification link sent to the new address.
        </p>
        <p style="color:#9BB0C4; margin:0 0 24px; line-height:1.6;">
          <strong style="color:#F59E0B;">If this wasn&apos;t you</strong>, cancel the request immediately and let us know.
        </p>
        <div style="text-align:center; margin:0 0 24px;">
          <a href="${input.cancelUrl}" style="display:inline-block; padding:14px 32px; background:#EF4444; color:#ffffff; font-weight:700; text-decoration:none; border-radius:4px; font-size:14px;">
            Cancel this change
          </a>
        </div>
        <p style="color:#6B8299; font-size:12px; margin:0; line-height:1.55;">
          The cancel link works for 24 hours. After that, contact
          <a href="mailto:operations@allfinancialfreedom.com" style="color:#C9A96E; text-decoration:none;">operations@allfinancialfreedom.com</a>
          for help.
        </p>
      </div>
    </div>
  `
  return { subject, html }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
