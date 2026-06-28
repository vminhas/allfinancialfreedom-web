import { db } from '@/lib/db'
import {
  getGhlConfig, getOrCreateGhlContactId, sendGhlSms, sendGhlEmail, ghlPut, OPS_MAILBOX,
} from '@/lib/ghl'
import { sendChannelMessage } from '@/lib/discord'
import { escapeHtml, sanitizeOneLine } from '@/lib/lead-abuse-guard'
import type { LeadScore } from '@/generated/prisma/client'

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

    // Names are already sanitized at the capture boundary, but we re-narrow
    // per channel: a single line for SMS, HTML-escaped for the email body.
    const smsName = sanitizeOneLine(opts.firstName)
    const emailName = escapeHtml(opts.firstName)

    // Speed-to-lead: instant text. GHL auto-appends its own "Reply STOP to
    // unsubscribe." opt-out line on the first message, so we omit ours to
    // avoid a duplicate STOP. Best-effort.
    await sendGhlSms({
      contactId,
      message:
        `Hi ${smsName}, this is All Financial Freedom. Thanks for requesting your free ` +
        `retirement income estimate. A licensed agent will reach out shortly.`,
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
  lead: { ageBand: string; savingsBand: string; incomeTiming: string; priority: string; accountTypes: string[] }
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
        ],
      }],
    })
  } catch (err) {
    console.warn('[lead-pipeline] Discord notify failed:', err)
  }
}
