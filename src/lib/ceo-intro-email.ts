// Builds the "CEO intro" email an agent can fire from a prospect row.
//
// Voice and signature are Vick's: the email comes from
// vick@allfinancialfreedom.com and signs as Vick. The body credits the
// agent ("{Agent} mentioned you to me...") so the recipient knows where
// the warm intro is coming from. Calendly link is the same ProsHog
// booking link used for outbound recruiting.
//
// No em dashes anywhere in the body. Use commas, periods, colons, or
// parentheses. This is a project-wide rule.

import { getSetting } from './settings'

interface CeoIntroInput {
  prospectFirstName: string
  agentFullName: string
  agentRoleLabel: string  // e.g. "an agent on our team"
  agentPersonalNote: string | null
}

export async function buildCeoIntroHtml(input: CeoIntroInput): Promise<{ subject: string; html: string }> {
  const bookingUrl = await getSetting('GHL_PROPHOG_BOOKING_URL')
    || 'https://links.allfinancialfreedom.com/widget/bookings/financial-career-discovery-cal'
  const websiteUrl = 'https://www.allfinancialfreedom.com'

  const subject = `${input.agentFullName.split(' ')[0]} thought you'd be a great fit`

  const personalNoteBlock = input.agentPersonalNote
    ? `<blockquote style="margin:18px 0; padding:12px 16px; border-left:3px solid #C9A96E; background:rgba(201,169,110,0.06); color:#9BB0C4; font-style:italic; line-height:1.55;">${escapeHtml(input.agentPersonalNote)}<br><span style="display:block; margin-top:6px; font-size:12px; color:#6B8299; font-style:normal;">${escapeHtml(input.agentFullName)}</span></blockquote>`
    : ''

  const html = `
    <div style="background:#0A1628; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:600px; margin:0 auto; background:#0F1E33; border-radius:10px; padding:36px 32px; color:#ffffff;">

        <p style="color:#C9A96E; font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 12px;">A warm introduction</p>

        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">Hi ${escapeHtml(input.prospectFirstName)},</p>

        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">I'm Vick Minhas, the founder and CEO of All Financial Freedom. <strong style="color:#fff;">${escapeHtml(input.agentFullName)}</strong>, ${escapeHtml(input.agentRoleLabel)}, mentioned you to me, and thought you'd be a great fit for what we're building.</p>

        ${personalNoteBlock}

        <p style="color:#9BB0C4; margin:0 0 16px; line-height:1.6;">We help everyday people build a financial business that gives them income, ownership, and a real path to time freedom. Not a job, not a side hustle, a business. We work with people from all walks of life: nurses, teachers, real-estate pros, business owners, parents who want something more flexible. What ${escapeHtml(input.agentFullName.split(' ')[0])} saw in you matters; that's usually the strongest signal.</p>

        <p style="color:#9BB0C4; margin:0 0 24px; line-height:1.6;">If you're even a little curious, I'd love to put 20 minutes on the calendar. No pitch, no pressure. Just a real conversation about what you're after and whether what we do could fit.</p>

        <div style="text-align:center; margin:0 0 24px;">
          <a href="${bookingUrl}" style="display:inline-block; padding:14px 32px; background:#C9A96E; color:#142D48; font-weight:700; text-decoration:none; border-radius:4px; font-size:14px;">Book a 20-minute conversation &rarr;</a>
        </div>

        <p style="color:#9BB0C4; margin:0 0 8px; line-height:1.6; font-size:13px;">If the calendar doesn't work, just reply to this email and we'll find a time.</p>

        <p style="color:#fff; margin:24px 0 0; font-weight:600;">Talk soon,</p>
        <p style="color:#fff; margin:6px 0 0; font-weight:700; font-size:15px;">Vick Minhas</p>
        <p style="color:#C9A96E; margin:2px 0 0; font-weight:700; font-size:12px;">CEO &middot; All Financial Freedom</p>

        <hr style="border:none; border-top:1px solid rgba(255,255,255,0.06); margin:28px 0 16px;" />
        <p style="color:#4B5563; font-size:11px; margin:0;">
          <a href="${websiteUrl}" style="color:#6B8299; text-decoration:none;">allfinancialfreedom.com</a>
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
