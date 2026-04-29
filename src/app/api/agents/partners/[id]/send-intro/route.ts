// Fires a "warm intro from the CEO" email on behalf of the calling agent.
//
// The agent picks a prospect they want to recruit. We:
//   1. Make sure the prospect belongs to this agent (and isn't already
//      intro'd)
//   2. Upsert the prospect into GHL so we have a contactId to send through
//   3. Send the email via the existing sendGhlEmail path — which already
//      uses vick@allfinancialfreedom.com / "Vick Minhas" as the sender —
//      so the prospect sees the message arriving from the CEO
//   4. Stamp introSentAt + introMessageId on the BusinessPartner row so
//      the UI can show "✓ Intro sent" and disable the button
//
// Body: { personalNote?: string } — optional one-liner the agent adds
// (e.g. "We grabbed coffee last month and I really think you'd love this")
// that gets quoted in the email above Vick's signature.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGhlConfig, ghlPost, sendGhlEmail } from '@/lib/ghl'
import { buildCeoIntroHtml } from '@/lib/ceo-intro-email'
import { resolveAgentIdentity } from '@/lib/agent-identity'

interface SendIntroBody {
  personalNote?: string
}

const PHASE_ROLE_LABEL: Record<number, string> = {
  1: 'an agent on our team',
  2: 'an associate on our team',
  3: 'a certified field trainer on our team',
  4: 'a marketing director on our team',
  5: 'an executive marketing director on our team',
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error

  const { id } = await ctx.params

  const profile = await db.agentProfile.findUnique({
    where: { id: identity.profileId },
    select: { id: true, firstName: true, lastName: true, phase: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const partner = await db.businessPartner.findUnique({ where: { id } })
  if (!partner || partner.agentProfileId !== profile.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!partner.email) {
    return NextResponse.json({ error: 'Prospect has no email on file' }, { status: 400 })
  }
  if (partner.introSentAt) {
    return NextResponse.json({ error: 'Intro already sent', sentAt: partner.introSentAt }, { status: 409 })
  }

  const body = await req.json().catch(() => ({})) as SendIntroBody
  const personalNote = typeof body.personalNote === 'string' && body.personalNote.trim().length > 0
    ? body.personalNote.trim().slice(0, 500)
    : null

  const agentFullName = `${profile.firstName} ${profile.lastName}`.trim()
  const prospectFirstName = partner.name.split(/\s+/)[0]

  // Build the email body before any GHL work — surfaces template errors
  // before we hit external services.
  const { subject, html } = await buildCeoIntroHtml({
    prospectFirstName,
    agentFullName,
    agentRoleLabel: PHASE_ROLE_LABEL[profile.phase] ?? 'an agent on our team',
    agentPersonalNote: personalNote,
  })

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })
  }

  // Upsert into GHL by email so we have a contactId to send through. The
  // prospect may already be in GHL from a different flow — search first,
  // create only if missing.
  let ghlContactId: string | undefined
  try {
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${config.locationId}&email=${encodeURIComponent(partner.email)}`,
      { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } }
    )
    if (searchRes.ok) {
      const data = await searchRes.json() as { contact?: { id: string } }
      ghlContactId = data.contact?.id
    }

    if (!ghlContactId) {
      const [first, ...rest] = partner.name.split(/\s+/)
      const last = rest.join(' ') || undefined
      const createRes = await ghlPost('/contacts/', {
        locationId: config.locationId,
        email: partner.email,
        firstName: first,
        lastName: last,
        phone: partner.phone ?? undefined,
        tags: ['agent-referred-prospect', `referred-by-${agentFullName.toLowerCase().replace(/\s+/g, '-')}`],
      }, config)
      const created = await createRes.json() as { contact?: { id: string } }
      ghlContactId = created.contact?.id
    }
  } catch {
    return NextResponse.json({ error: 'Failed to register prospect with email service' }, { status: 502 })
  }

  if (!ghlContactId) {
    return NextResponse.json({ error: 'Failed to register prospect with email service' }, { status: 502 })
  }

  const sendRes = await sendGhlEmail({
    contactId: ghlContactId,
    emailTo: partner.email,
    subject,
    html,
    config,
  })

  if (!sendRes.ok) {
    const errText = await sendRes.text().catch(() => '')
    return NextResponse.json({ error: `Email service error: ${sendRes.status} ${errText.slice(0, 200)}` }, { status: 502 })
  }

  const sendData = await sendRes.json().catch(() => ({})) as { messageId?: string; id?: string }
  const messageId = sendData.messageId ?? sendData.id ?? null

  const updated = await db.businessPartner.update({
    where: { id: partner.id },
    data: {
      introSentAt: new Date(),
      introMessageId: messageId,
    },
  })

  return NextResponse.json({ ok: true, partner: updated })
}
