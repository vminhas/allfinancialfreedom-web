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
  inputTokens?: number
  outputTokens?: number
}

function wrapInBrandedHtml(firstName: string, body: string, bookingUrl: string, email = ''): string {
  void firstName
  void bookingUrl
  const paragraphs = body.trim().split(/\n\n+/).map(p =>
    `<p style="margin:0 0 16px;line-height:1.7;">${p.replace(/\n/g, '<br/>')}</p>`
  ).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:Georgia,serif;font-size:15px;color:#222222;max-width:560px;margin:0 auto;padding:40px 24px;">

  ${paragraphs}

  <p style="margin:0 0 4px;line-height:1.7;">Best,</p>
  <p style="margin:0 0 2px;font-weight:bold;">Vick Minhas</p>
  <p style="margin:0 0 2px;font-size:13px;color:#555555;">All Financial Freedom</p>
  <p style="margin:0 0 24px;font-size:13px;color:#555555;">contact@allfinancialfreedom.com</p>

  <hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;">
  <p style="font-size:11px;color:#999999;margin:0;line-height:1.6;">
    All Financial Freedom &bull; Licensed insurance professionals &bull; Products vary by state.<br>
    <a href="https://www.allfinancialfreedom.com/unsubscribe?email=${encodeURIComponent(email)}" style="color:#999999;">Unsubscribe</a>
  </p>

</div>
</body></html>`
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

      const html = wrapInBrandedHtml(contact.firstName, msg.body, prophogBookingUrl, contact.email ?? '')

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
          inputTokens: msg.inputTokens ?? 0,
          outputTokens: msg.outputTokens ?? 0,
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
