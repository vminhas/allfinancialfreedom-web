import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getGhlConfig, sendGhlEmail } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

interface MessageToSend {
  contactId: string   // local DB contact id
  subject: string
  body: string        // plain text from Claude
}

function wrapInBrandedHtml(firstName: string, body: string, bookingUrl: string): string {
  // Convert plain text body to HTML paragraphs
  const paragraphs = body.trim().split(/\n\n+/).map(p =>
    `<p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 18px;">${p.replace(/\n/g, '<br/>')}</p>`
  ).join('')

  return `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">

      <!-- Gold top bar -->
      <div style="height:4px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>

      <!-- Header -->
      <div style="background:#142D48;padding:36px 48px 32px;">
        <p style="color:#C9A96E;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;margin:0 0 10px;font-weight:600;">All Financial Freedom</p>
        <h1 style="color:#ffffff;font-size:22px;font-weight:300;margin:0;line-height:1.3;letter-spacing:-0.01em;">
          A note for ${firstName}
        </h1>
      </div>

      <!-- Gold rule -->
      <div style="height:1px;background:linear-gradient(90deg,#C9A96E,rgba(201,169,110,0.2));"></div>

      <!-- Body -->
      <div style="padding:40px 48px;">
        ${paragraphs}

        <!-- CTA -->
        <div style="margin:28px 0 32px;text-align:center;">
          <a href="${bookingUrl}"
            style="display:inline-block;background:#142D48;color:#C9A96E;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:13px 28px;border-radius:3px;border:1px solid #C9A96E;">
            Schedule a 15-Min Call
          </a>
        </div>

        <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:0 0 4px;">With appreciation,</p>
        <p style="color:#142D48;font-size:15px;font-weight:700;margin:0 0 2px;">Vick Minhas</p>
        <p style="color:#C9A96E;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0;font-weight:500;">
          Chief Executive Officer, All Financial Freedom
        </p>
      </div>

      <!-- Divider -->
      <div style="height:1px;background:#F0F0F0;margin:0 48px;"></div>

      <!-- Footer -->
      <div style="padding:20px 48px 28px;">
        <p style="color:#9BB0C4;font-size:11px;margin:0 0 6px;line-height:1.7;">
          <strong style="color:#6B8299;">All Financial Freedom</strong> &nbsp;&bull;&nbsp; contact@allfinancialfreedom.com
        </p>
        <p style="color:#C4D0DB;font-size:10px;margin:0;line-height:1.6;">
          Licensed insurance professionals. Products and availability vary by state.
          <a href="https://allfinancialfreedom.com/unsubscribe" style="color:#C4D0DB;text-decoration:none;">&nbsp;&nbsp;Unsubscribe</a>
          &nbsp;&bull;&nbsp; 123 Main St, Suite 100, Your City, ST 00000
        </p>
      </div>

      <!-- Gold bottom bar -->
      <div style="height:3px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>

    </div>
  `
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, advanceStage } = await req.json() as {
    messages: MessageToSend[]
    advanceStage?: boolean
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  const config = await getGhlConfig()
  const contactedStageId = await getSetting('GHL_STAGE_CONTACTED')
  const prophogBookingUrl = await getSetting('GHL_PROPHOG_BOOKING_URL') || 'https://api.leadconnectorhq.com/widget/booking/ZOedxdwvtOnTS6Sg5n7Z'

  let sent = 0
  const errors: string[] = []

  for (const msg of messages) {
    try {
      const contact = await db.contact.findUnique({ where: { id: msg.contactId } })
      if (!contact || !contact.email) {
        errors.push(`Contact ${msg.contactId}: not found`)
        continue
      }
      if (!contact.ghlContactId) {
        errors.push(`${contact.email}: not yet imported to GHL`)
        continue
      }

      const html = wrapInBrandedHtml(contact.firstName, msg.body, prophogBookingUrl)

      const res = await sendGhlEmail({
        contactId: contact.ghlContactId,
        emailTo: contact.email,
        subject: msg.subject,
        html,
        config,
      })

      if (!res.ok) {
        const errText = await res.text()
        errors.push(`${contact.email}: GHL error ${res.status} — ${errText}`)
        continue
      }

      const ghlData = await res.json()

      // Save to DB
      await db.outreachMessage.create({
        data: {
          contactId: contact.id,
          subject: msg.subject,
          bodyHtml: html,
          status: 'SENT',
          sentAt: new Date(),
          ghlMessageId: ghlData.messageId ?? ghlData.id ?? null,
        },
      })

      // Update contact outreach status
      await db.contact.update({
        where: { id: contact.id },
        data: { outreachStatus: 'sent' },
      })

      // Advance pipeline stage if requested
      if (advanceStage && contactedStageId && contact.ghlContactId) {
        await fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&contact_id=${contact.ghlContactId}`, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Version': '2021-07-28',
          },
        }).then(async r => {
          if (!r.ok) return
          const data = await r.json()
          const opp = data.opportunities?.[0]
          if (opp?.id) {
            await fetch(`https://services.leadconnectorhq.com/opportunities/${opp.id}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' },
              body: JSON.stringify({ pipelineStageId: contactedStageId }),
            })
          }
        })
      }

      sent++
    } catch (err) {
      errors.push(`Contact ${msg.contactId}: ${String(err)}`)
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.slice(0, 20) })
}
