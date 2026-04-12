import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getGhlConfig, sendGhlEmail } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

interface MessageToSend {
  contactId: string
  subject: string
  body: string
  inputTokens?: number
  outputTokens?: number
  testEmail?: string  // if set, send to this address instead (test mode)
}

function wrapInBrandedHtml(firstName: string, body: string, bookingUrl: string, email = ''): string {
  void firstName
  void bookingUrl
  const unsubUrl = `https://www.allfinancialfreedom.com/unsubscribe?email=${encodeURIComponent(email)}`
  const plainText = `${body.trim()}\n\n--\nVick Minhas\nvick@allfinancialfreedom.com\n\nTo stop receiving emails: ${unsubUrl}`
  const html = plainText.replace(/\n/g, '<br>')
  return html
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, advanceStage, testMode } = await req.json() as {
    messages: MessageToSend[]
    advanceStage?: boolean
    testMode?: boolean
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  const config = await getGhlConfig()
  const contactedStageId = await getSetting('GHL_STAGE_CONTACTED')
  const prophogBookingUrl = await getSetting('GHL_PROPHOG_BOOKING_URL') || 'https://links.allfinancialfreedom.com/widget/bookings/financial-career-discovery-cal'

  let sent = 0
  const errors: string[] = []

  for (const msg of messages) {
    try {
      // Test mode: send directly to testEmail without looking up a real contact
      if (testMode && msg.testEmail) {
        const html = wrapInBrandedHtml('Test', msg.body, prophogBookingUrl, msg.testEmail)
        const headers = {
          'Authorization': `Bearer ${config.apiKey}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        }
        await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method: 'POST', headers,
          body: JSON.stringify({
            type: 'Email',
            contactId: 'test',
            emailFrom: 'vick@allfinancialfreedom.com',
            emailFromName: 'Vick Minhas',
            emailTo: msg.testEmail,
            subject: `[TEST] ${msg.subject}`,
            emailSubject: `[TEST] ${msg.subject}`,
            html,
            text: html,
          }),
        })
        sent++
        continue
      }

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
