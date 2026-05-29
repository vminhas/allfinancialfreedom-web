import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { todayInEt } from '@/lib/renewals'
import { getSetting } from '@/lib/settings'
import { policyTypeLabel } from '@/lib/new-business-notifications'
import { statusLabel } from '@/lib/lc-notes-format'
import { lcPurposeLabel } from '@/lib/licensing-topics'
import { getGhlConfig, getOrCreateGhlContactId, sendGhlEmail, OPS_MAILBOX } from '@/lib/ghl'
import { wrapInShell } from '@/lib/email-template'

// GET /api/cron/lc-daily-digest
//
// End-of-day recap of the Licensing Coordinator's day. Sends BOTH an
// email (to the configured recipient, default Melinee) and a Discord
// post to the admin channel. Mirrors the "Email to me" section of the
// LC Notes Guide SOP: New Business worked today, Licensing notes added
// today, Breezy applicant count, and a manual Misc reminder.
//
// Scheduled in vercel.json at 0 1 * * * (UTC) = 9pm ET, so it captures
// the full US work day. Auth is the standard cron Bearer secret;
// ?force=1 (still authed) bypasses the once-per-day idempotency gate
// for manual reruns.

const DEFAULT_RECIPIENT = 'melinee@allfinancialfreedom.com'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = new URL(req.url).searchParams.get('force') === '1'

  // ET day window. todayInEt() returns local-midnight for the ET
  // calendar day; the window is [dayStart, dayEnd).
  const dayStart = todayInEt()
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const digestDate = dayStart.toLocaleDateString('en-CA') // YYYY-MM-DD

  // Idempotency: skip if we already sent today (unless forced).
  if (!force) {
    const existing = await db.lcDigestRun.findUnique({ where: { digestDate } })
    if (existing && existing.emailOk && existing.discordOk) {
      return NextResponse.json({ ok: true, skipped: 'already-sent', digestDate })
    }
  }

  // ---- Gather the day's activity ----

  // New Business: submissions created today UNION submissions that got
  // a note today. Pull notes-today first to know which existing
  // submissions were touched.
  const notesToday = await db.newBusinessNote.findMany({
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
    select: { submissionId: true },
  })
  const touchedIds = Array.from(new Set(notesToday.map(n => n.submissionId)))

  const nbSubs = await db.newBusinessSubmission.findMany({
    where: {
      OR: [
        { createdAt: { gte: dayStart, lt: dayEnd } },
        { id: { in: touchedIds } },
      ],
    },
    select: {
      id: true,
      policyType: true,
      carrier: true,
      status: true,
      clientFirstName: true,
      clientLastName: true,
      agentProfile: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const touchedSet = new Set(touchedIds)
  const newBusiness = nbSubs.map(s => ({
    type: policyTypeLabel(s.policyType),
    agent: `${s.agentProfile.firstName} ${s.agentProfile.lastName}`.trim(),
    client: `${s.clientFirstName} ${s.clientLastName}`.trim(),
    status: statusLabel(s.status),
    noteAdded: touchedSet.has(s.id),
  }))

  // Licensing: LICENSING-scope notes added today, grouped by agent.
  const licNotes = await db.licensingNote.findMany({
    where: { createdAt: { gte: dayStart, lt: dayEnd }, scope: 'LICENSING' },
    select: {
      purpose: true,
      body: true,
      agentProfile: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const licensing = licNotes.map(n => {
    // Pull the "Additional Note:" line out of the formatted body for a
    // compact digest comment; fall back to the whole body.
    const m = n.body.match(/Additional Note:\s*([\s\S]*)$/)
    const comment = (m?.[1] ?? n.body).trim()
    return {
      agent: `${n.agentProfile.firstName} ${n.agentProfile.lastName}`.trim(),
      purpose: lcPurposeLabel(n.purpose) || 'General',
      comment: comment === 'None' ? '' : comment,
    }
  })

  // Breezy HR: applicants synced into Contacts today.
  const breezyCount = await db.contact.count({
    where: { source: { startsWith: 'breezy' }, createdAt: { gte: dayStart, lt: dayEnd } },
  })

  // ---- Compose ----
  const dateLabel = dayStart.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const nbLines = newBusiness.length
    ? newBusiness.map((n, i) =>
        `New Business (${i + 1}) - ${n.type}\n  Agent: ${n.agent}\n  Client: ${n.client}\n  Status: ${n.status}\n  Note Added: ${n.noteAdded ? 'Yes' : 'No'}`,
      ).join('\n\n')
    : 'No New Business activity today.'

  const licLines = licensing.length
    ? licensing.map((l, i) =>
        `Licensing (${i + 1})\n  Agent: ${l.agent}\n  Purpose: ${l.purpose}${l.comment ? `\n  Additional Comments: ${l.comment}` : ''}`,
      ).join('\n\n')
    : 'No Licensing notes today.'

  const textBody = [
    `Licensing Coordinator Daily Digest`,
    dateLabel,
    '',
    'New Business:',
    nbLines,
    '',
    'Licensing:',
    licLines,
    '',
    `Breezy HR Applicants: ${breezyCount}`,
    '',
    'Misc: (add manually)',
  ].join('\n')

  // ---- Send email ----
  const recipient = (await getSetting('LC_DIGEST_RECIPIENT_EMAIL')) || DEFAULT_RECIPIENT
  let emailOk = false
  try {
    const config = await getGhlConfig()
    if (config.apiKey && config.locationId) {
      const contactId = await getOrCreateGhlContactId({
        email: recipient,
        firstName: 'AFF',
        lastName: 'Leadership',
        tags: ['staff'],
        config,
      })
      if (contactId) {
        const html = wrapInShell({
          title: 'Licensing Coordinator Daily Digest',
          bodyHtml: `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:#1A2B3C;">${escapeHtml(textBody)}</div>`,
          senderName: 'All Financial Freedom',
          senderRole: 'Licensing Operations',
          preheader: `New Business: ${newBusiness.length} · Licensing: ${licensing.length} · Breezy: ${breezyCount}`,
        })
        const res = await sendGhlEmail({
          contactId,
          emailTo: recipient,
          subject: `LC Daily Digest · ${dateLabel}`,
          html,
          emailFrom: OPS_MAILBOX.email,
          emailFromName: OPS_MAILBOX.name,
          config,
        })
        emailOk = res.ok
      }
    }
  } catch (err) {
    console.warn('[lc-daily-digest] email failed:', err)
  }

  // ---- Post to Discord ----
  let discordOk = false
  try {
    if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
      const { sendChannelMessage } = await import('@/lib/discord')
      const nbField = newBusiness.length
        ? newBusiness.map(n => `• ${n.type} for ${n.client} (${n.agent}) · ${n.status}${n.noteAdded ? ' · note added' : ''}`).join('\n').slice(0, 1024)
        : 'None today.'
      const licField = licensing.length
        ? licensing.map(l => `• ${l.agent} · ${l.purpose}${l.comment ? ` · ${l.comment}` : ''}`).join('\n').slice(0, 1024)
        : 'None today.'
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: 'Licensing Coordinator Daily Digest',
          description: dateLabel,
          color: 0xC9A96E,
          fields: [
            { name: `New Business (${newBusiness.length})`, value: nbField },
            { name: `Licensing (${licensing.length})`, value: licField },
            { name: 'Breezy HR Applicants', value: String(breezyCount), inline: true },
          ],
          footer: { text: 'AFF Concierge · LC Daily Digest' },
          timestamp: new Date().toISOString(),
        }],
      })
      discordOk = true
    }
  } catch (err) {
    console.warn('[lc-daily-digest] discord failed:', err)
  }

  // Record / update the run ledger.
  await db.lcDigestRun.upsert({
    where: { digestDate },
    create: { digestDate, emailOk, discordOk },
    update: { emailOk, discordOk, sentAt: new Date() },
  })

  return NextResponse.json({
    ok: true,
    digestDate,
    counts: { newBusiness: newBusiness.length, licensing: licensing.length, breezy: breezyCount },
    emailOk,
    discordOk,
    recipient,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
