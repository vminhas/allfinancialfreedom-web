// Builds the "CEO intro" email an agent can fire from a prospect row.
// Voice + signature are Vick's. The body credits the referring agent
// so the recipient knows where the warm intro is coming from.
//
// Template lives in the DB (EmailTemplate.key = 'ceo-warm-intro') and
// is editable from /vault/email-templates. The personal-note block is
// pre-rendered here and passed as a raw {{{personalNoteBlock}}} so
// the conditional "only show when the agent typed a note" stays out
// of the WYSIWYG editor.
//
// Vick doesn't take every discovery call — the intro hands off to the
// onboarding host (usually COO) via GHL_PROPHOG_BOOKING_URL.
//
// No em dashes anywhere in the body. Use commas, periods, colons, or
// parentheses. Project-wide rule.

import { getSetting } from './settings'
import { db } from './db'
import { substituteVarsHtml, type RenderContext } from './email-template'
import { ensureEmailTemplateSeed } from './email-template-seed'

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
  const agentFirstName = input.agentFullName.split(' ')[0] || input.agentFullName

  const personalNoteBlock = input.agentPersonalNote
    ? `<blockquote style="margin:18px 0; padding:12px 16px; border-left:3px solid #C9A96E; background:rgba(201,169,110,0.06); color:#9BB0C4; font-style:italic; line-height:1.55;">${escapeHtml(input.agentPersonalNote)}<br><span style="display:block; margin-top:6px; font-size:12px; color:#6B8299; font-style:normal;">${escapeHtml(input.agentFullName)}</span></blockquote>`
    : ''

  await ensureEmailTemplateSeed()
  const template = await db.emailTemplate.findUnique({
    where: { key: 'ceo-warm-intro' },
    select: { subject: true, bodyHtml: true },
  })

  const ctx: RenderContext = {
    prospectFirstName: input.prospectFirstName,
    agentFullName: input.agentFullName,
    agentFirstName,
    agentRoleLabel: input.agentRoleLabel,
    bookingUrl,
    websiteUrl,
    personalNoteBlock,
  }

  const subject = substituteVarsHtml(template?.subject ?? "{{agentFirstName}} thought you'd be a great fit", ctx)
    // Subject lives in a plain-text field, so undo the HTML entity
    // encoding the helper applied. substituteVarsHtml is built for
    // HTML body context but is the only renderer that handles the
    // raw/escaped distinction; for the subject we just decode.
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  const html = substituteVarsHtml(template?.bodyHtml ?? '', ctx)
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
