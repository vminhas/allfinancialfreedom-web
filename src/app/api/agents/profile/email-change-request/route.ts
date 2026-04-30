// Agent self-serve email change, step 1: request.
//
// Generates a verification token, writes pending fields to AgentUser,
// emails the NEW address with the verify link, and emails the OLD
// address with a "wasn't me, cancel this" link. Pings the admin
// Discord channel so we have an audit trail beyond the email itself.
//
// Email isn't actually swapped until the user clicks the link in the
// new mailbox (see /api/agents/profile/email-verify). If they cancel
// or let the token expire (24h), no change happens.
//
// Hardening:
//   - Email validated as a basic well-formed string
//   - Reject if the new email matches an existing AdminUser/AgentUser
//     (don't allow account collisions)
//   - 5-minute cooldown between change requests on the same account
//     so a stolen session can't spam the user with repeated alerts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getGhlConfig, sendGhlEmail, ghlPost, OPS_MAILBOX } from '@/lib/ghl'
import { buildEmailVerificationHtml, buildEmailChangeAlertHtml } from '@/lib/email-change-templates'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionEmail = (session.user as { email?: string }).email
  if (typeof sessionEmail !== 'string' || sessionEmail.length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { newEmail?: string }
  const newEmail = (body.newEmail ?? '').trim().toLowerCase()
  if (!newEmail || !EMAIL_RE.test(newEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  // Resolve the calling agent. Case-insensitive lookup since the
  // session email casing isn't guaranteed to match what's stored.
  const me = await db.agentUser.findFirst({
    where: { email: { equals: sessionEmail, mode: 'insensitive' } },
    include: { profile: { select: { firstName: true, lastName: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (newEmail === me.email.toLowerCase()) {
    return NextResponse.json({ error: 'That is already your current email' }, { status: 400 })
  }

  // Cooldown: 5 minutes between change requests. Slows down a session
  // takeover spamming us with verification emails, without being
  // annoying for legit retry cases.
  const COOLDOWN_MS = 5 * 60 * 1000
  if (me.pendingEmailExpires && me.pendingEmailExpires.getTime() - 24 * 3600 * 1000 + COOLDOWN_MS > Date.now()) {
    return NextResponse.json({ error: 'You just requested a change. Please wait a few minutes before trying again.' }, { status: 429 })
  }

  // Collision check across BOTH user tables. Don't let an agent claim
  // an email that's already on the system as anyone (admin OR agent).
  const [collidingAgent, collidingAdmin] = await Promise.all([
    db.agentUser.findFirst({ where: { email: { equals: newEmail, mode: 'insensitive' } }, select: { id: true } }),
    db.adminUser.findFirst({ where: { email: { equals: newEmail, mode: 'insensitive' } }, select: { id: true } }),
  ])
  if (collidingAgent || collidingAdmin) {
    return NextResponse.json({ error: 'That email is already in use by another account' }, { status: 409 })
  }

  const token = randomUUID()
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await db.agentUser.update({
    where: { id: me.id },
    data: { pendingEmail: newEmail, pendingEmailToken: token, pendingEmailExpires: expires },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'
  const verifyUrl = `${baseUrl}/agents/email-verify?token=${token}`
  const cancelUrl = `${baseUrl}/agents/email-cancel?token=${token}`
  const firstName = me.profile?.firstName ?? me.email.split('@')[0]

  // Send both emails best-effort. We don't block on GHL send failures
  // because the change can still complete via the URL (the user has
  // the token already in DB, technically — but we still want to send
  // the alert to give them a chance to cancel from old).
  const config = await getGhlConfig()
  if (config.apiKey && config.locationId) {
    try {
      // Verification email -> new address
      const verify = buildEmailVerificationHtml({
        firstName, oldEmail: me.email, newEmail, verifyUrl, cancelUrl,
      })
      await sendToEmail({
        config, email: newEmail, name: firstName,
        subject: verify.subject, html: verify.html,
      })

      // Security alert -> old address
      const alert = buildEmailChangeAlertHtml({
        firstName, oldEmail: me.email, newEmail, verifyUrl, cancelUrl,
      })
      await sendToEmail({
        config, email: me.email, name: firstName,
        subject: alert.subject, html: alert.html,
      })
    } catch { /* swallow; user still has the link in their dashboard if needed */ }
  }

  // Discord ping so the admin team has visibility regardless of email
  // delivery quirks. Lets us catch suspicious change requests in real
  // time even if both addresses are compromised.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: '✏️ Agent email change requested',
          description: [
            `**${firstName}** asked to change their AFF login email.`,
            '',
            `From: \`${me.email}\``,
            `To:   \`${newEmail}\``,
            '',
            '_Pending verification in the new mailbox. The change finalizes only after they click the link, or fails if they cancel from the old mailbox._',
          ].join('\n'),
          color: 0xF59E0B,
          footer: { text: 'AFF Concierge · Account audit' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {})
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, pendingEmail: newEmail })
}

// Wraps the GHL send so we can target ANY email (the agent's old + new
// addresses). Unlike most existing call sites which already have a GHL
// contactId, here we may need to create one inline if the email isn't
// in GHL yet.
async function sendToEmail(args: {
  config: { apiKey: string; locationId: string }
  email: string
  name: string
  subject: string
  html: string
}) {
  // Find or create a GHL contact for this email so /conversations/messages
  // has a contactId to attach to. Best-effort throughout.
  let ghlContactId: string | undefined
  const searchRes = await fetch(
    `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${args.config.locationId}&email=${encodeURIComponent(args.email)}`,
    { headers: { Authorization: `Bearer ${args.config.apiKey}`, Version: '2021-07-28' } }
  )
  if (searchRes.ok) {
    const data = await searchRes.json() as { contact?: { id: string } }
    ghlContactId = data.contact?.id
  }
  if (!ghlContactId) {
    const createRes = await ghlPost('/contacts/', {
      locationId: args.config.locationId,
      email: args.email,
      firstName: args.name,
      tags: ['agent-email-change-flow'],
    }, args.config)
    const created = await createRes.json() as { contact?: { id: string } }
    ghlContactId = created.contact?.id
  }
  if (!ghlContactId) return

  await sendGhlEmail({
    contactId: ghlContactId,
    emailTo: args.email,
    subject: args.subject,
    html: args.html,
    config: args.config,
    emailFrom: OPS_MAILBOX.email,
    emailFromName: OPS_MAILBOX.name,
  })
}
