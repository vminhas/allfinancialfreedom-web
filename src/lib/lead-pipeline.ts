import { db } from '@/lib/db'
import {
  getGhlConfig, getOrCreateGhlContactId, sendGhlSms, sendGhlEmail, ghlPut, OPS_MAILBOX,
} from '@/lib/ghl'
import { getSettings } from '@/lib/settings'
import { sendChannelMessage } from '@/lib/discord'
import { escapeHtml, sanitizeOneLine } from '@/lib/lead-abuse-guard'
import { LEAD_MESSAGE_SETTING_KEYS, LEAD_MESSAGE_DEFAULTS } from '@/lib/annuity-leads'
import type { LeadScore } from '@/generated/prisma/client'

// Turn an admin-edited plain-text email body into safe HTML: substitute
// {firstName}, HTML-escape everything, blank lines -> paragraphs, single
// newlines -> <br>.
function emailBodyToHtml(body: string, firstName: string): string {
  const safeName = escapeHtml(firstName)
  return body
    .split(/\n\s*\n/)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>').replace(/\{firstName\}/g, safeName)}</p>`)
    .join('')
}

// Shared fan-out for a captured annuity lead, used by BOTH capture paths:
// the public landing-page form and the Meta Lead Ads webhook. The lead row
// is always written first by the caller; these are best-effort side
// effects that must never throw back into the caller.

export interface LeadFanOut {
  leadId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  score: LeadScore
}

// Create/find the GHL contact, set phone + tags so speed-to-lead
// automations fire and the SMS has a number to send to, then send the
// instant text + confirmation email. The score tag lets a GHL workflow
// branch A-leads (call first) from nurture.
export async function routeLeadToGhl(opts: LeadFanOut): Promise<void> {
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

    // Load the admin-editable message templates (Vault -> Ad Leads ->
    // Messaging); fall back to the defaults when unset. {firstName} is
    // sanitized per channel (single line for SMS, HTML-escaped for email).
    const tpl = await getSettings([
      LEAD_MESSAGE_SETTING_KEYS.sms,
      LEAD_MESSAGE_SETTING_KEYS.emailSubject,
      LEAD_MESSAGE_SETTING_KEYS.emailBody,
    ]).catch(() => ({} as Record<string, string>))
    const smsTpl = tpl[LEAD_MESSAGE_SETTING_KEYS.sms] || LEAD_MESSAGE_DEFAULTS.sms
    const subjectTpl = tpl[LEAD_MESSAGE_SETTING_KEYS.emailSubject] || LEAD_MESSAGE_DEFAULTS.emailSubject
    const bodyTpl = tpl[LEAD_MESSAGE_SETTING_KEYS.emailBody] || LEAD_MESSAGE_DEFAULTS.emailBody

    const smsName = sanitizeOneLine(opts.firstName)
    const subject = subjectTpl.replace(/\{firstName\}/g, smsName)

    // Speed-to-lead: instant text. GHL auto-appends its own "Reply STOP to
    // unsubscribe." opt-out line on the first message, so we omit ours to
    // avoid a duplicate STOP. Best-effort.
    await sendGhlSms({
      contactId,
      message: smsTpl.replace(/\{firstName\}/g, smsName),
      config,
    }).catch(() => {})

    await sendGhlEmail({
      contactId,
      emailTo: opts.email,
      subject,
      emailFrom: OPS_MAILBOX.email,
      emailFromName: OPS_MAILBOX.name,
      html: emailBodyToHtml(bodyTpl, opts.firstName),
      config,
    }).catch(() => {})
  } catch (err) {
    console.warn('[lead-pipeline] GHL routing failed:', err)
  }
}

export interface LeadDiscordInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  score: LeadScore
  source: string
  lead: {
    ageBand: string; savingsBand: string; incomeTiming: string; priority: string; accountTypes: string[]
    referralSource?: string | null; referrerName?: string | null
  }
}

// Post the lead to the staff-only leads channel. Uses a dedicated
// DISCORD_LEADS_CHANNEL_ID (create it with the same staff permissions as
// the activity channels), falling back to the admin channel until that
// env is set.
export async function notifyLeadDiscord(opts: LeadDiscordInput): Promise<void> {
  const channelId = process.env.DISCORD_LEADS_CHANNEL_ID || process.env.DISCORD_ADMIN_CHANNEL_ID
  if (!channelId || !process.env.DISCORD_BOT_TOKEN) return
  const heat = opts.score === 'A' ? '🔥 A-LEAD (call first)' : opts.score === 'NURTURE' ? '🌱 Nurture' : '📋 Standard'
  const sourceLabel = opts.source === 'meta_instant_form' ? 'Meta Instant Form' : 'Landing page'
  try {
    await sendChannelMessage(channelId, {
      embeds: [{
        title: `${heat} · ${opts.firstName} ${opts.lastName}`,
        color: opts.score === 'A' ? 0xC9A96E : 0x6B8299,
        fields: [
          { name: 'Phone', value: opts.phone, inline: true },
          { name: 'Email', value: opts.email, inline: true },
          { name: 'Source', value: sourceLabel, inline: true },
          { name: 'Age', value: opts.lead.ageBand, inline: true },
          { name: 'Saved', value: opts.lead.savingsBand, inline: true },
          { name: 'Income starts', value: opts.lead.incomeTiming, inline: true },
          { name: 'Priority', value: opts.lead.priority, inline: true },
          { name: 'Accounts', value: opts.lead.accountTypes.length ? opts.lead.accountTypes.join(', ') : '—', inline: false },
          ...(opts.lead.referralSource ? [{
            name: 'Referral',
            value: opts.lead.referralSource + (opts.lead.referrerName ? ` · ${opts.lead.referrerName}` : ''),
            inline: false,
          }] : []),
        ],
      }],
    })
  } catch (err) {
    console.warn('[lead-pipeline] Discord notify failed:', err)
  }
}
