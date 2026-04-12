import { NextRequest, NextResponse } from 'next/server'
import { getGhlConfig } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'
import { db } from '@/lib/db'

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    console.log('GHL Webhook received:', JSON.stringify(payload, null, 2))

    const eventType = payload.type ?? payload.event

    if (eventType === 'AppointmentCreate' || eventType === 'appointment.created') {
      const contactId = payload.contactId
      const startTime = payload.startTime

      if (!contactId) return NextResponse.json({ ok: true, skipped: 'no contactId' })

      const config = await getGhlConfig()
      const pipelineId = await getSetting('GHL_PIPELINE_ID') || 'mnZ9OIMMkjGo30LAxLDj'
      const discoveryStageId = await getSetting('GHL_STAGE_DISCOVERY_BOOKED') || '289575e7-21d9-4839-8609-54afdf2150d3'
      const bookingUrl = process.env.GHL_BOOKING_URL || 'https://api.leadconnectorhq.com/widget/booking/ZOedxdwvtOnTS6Sg5n7Z'

      const headers = {
        'Authorization': `Bearer ${config.apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
      }

      // Fetch contact + opportunity in parallel
      const [contactRes, oppRes] = await Promise.all([
        fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, { headers }),
        fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&contact_id=${contactId}&pipeline_id=${pipelineId}`, { headers }),
      ])

      const contact = contactRes.ok ? (await contactRes.json()).contact : null
      const opportunity = oppRes.ok ? (await oppRes.json()).opportunities?.[0] : null

      // Advance pipeline stage
      if (opportunity?.id) {
        await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunity.id}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ pipelineStageId: discoveryStageId }),
        })
      }

      // Send confirmation email
      if (contact?.email && contact?.firstName) {
        const formatted = formatDateTime(startTime)

        const html = `
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
            <div style="height:4px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
            <div style="background:#142D48;padding:40px 48px 36px;">
              <p style="color:#C9A96E;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;margin:0 0 10px;font-weight:600;">All Financial Freedom</p>
              <h1 style="color:#ffffff;font-size:26px;font-weight:300;margin:0;line-height:1.25;">Your discovery call<br/>is confirmed, ${contact.firstName}.</h1>
            </div>
            <div style="height:1px;background:linear-gradient(90deg,#C9A96E,rgba(201,169,110,0.2));"></div>
            <div style="padding:44px 48px;">
              <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 24px;">We are looking forward to connecting with you. This call is our opportunity to learn about your goals, answer your questions, and explore whether All Financial Freedom is the right fit.</p>
              <div style="background:#F5F9FF;border:1px solid rgba(201,169,110,0.25);border-left:4px solid #C9A96E;border-radius:4px;padding:28px 32px;margin:0 0 32px;">
                <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 12px;">Your Appointment</p>
                <p style="color:#142D48;font-size:17px;font-weight:600;margin:0 0 4px;">Discovery Call &nbsp;&middot;&nbsp; 30 Minutes</p>
                <p style="color:#4B5563;font-size:14px;margin:0;">${formatted}</p>
              </div>
              <div style="background:#142D48;border-radius:4px;padding:24px 32px;margin:0 0 32px;">
                <p style="color:rgba(235,244,255,0.6);font-size:13px;margin:0;line-height:1.7;">Need to reschedule? <a href="${bookingUrl}" style="color:#C9A96E;text-decoration:underline;">Click here to pick a new time.</a> We ask for at least 4 hours notice.</p>
              </div>
              <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 32px;">Questions? Reach us at <a href="mailto:contact@allfinancialfreedom.com" style="color:#1B3A5C;text-decoration:underline;">contact@allfinancialfreedom.com</a>.</p>
              <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:0 0 4px;">With appreciation,</p>
              <p style="color:#142D48;font-size:15px;font-weight:700;margin:0 0 2px;">Vick Minhas</p>
              <p style="color:#C9A96E;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0;font-weight:500;">Chief Executive Officer, All Financial Freedom</p>
            </div>
            <div style="height:1px;background:#F0F0F0;margin:0 48px;"></div>
            <div style="padding:20px 48px 28px;">
              <p style="color:#9BB0C4;font-size:11px;margin:0 0 6px;"><strong style="color:#6B8299;">All Financial Freedom</strong> &nbsp;&bull;&nbsp; contact@allfinancialfreedom.com</p>
              <p style="color:#C4D0DB;font-size:10px;margin:0;line-height:1.6;">Licensed insurance professionals. Products and availability vary by state. You received this because you scheduled a call at allfinancialfreedom.com. <a href="https://allfinancialfreedom.com/unsubscribe" style="color:#C4D0DB;text-decoration:none;">Unsubscribe</a></p>
            </div>
            <div style="height:3px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
          </div>
        `

        await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method: 'POST', headers,
          body: JSON.stringify({
            type: 'Email',
            contactId: contact.id,
            emailFrom: 'contact@allfinancialfreedom.com',
            emailFromName: 'All Financial Freedom',
            emailTo: contact.email,
            subject: `Your discovery call is confirmed, ${contact.firstName}.`,
            emailSubject: `Your discovery call is confirmed, ${contact.firstName}.`,
            html,
          }),
        })
      }

      // Send Vick a briefing email if this is a PropHog lead
      const isProphogLead = (contact?.tags ?? []).some((t: string) => t.startsWith('prophog'))
      if (isProphogLead) {
        const vickEmail = await getSetting('VICK_EMAIL') || 'vick@allfinancialfreedom.com'

        // Look up local DB record for extra context
        const localContact = contact?.email
          ? await db.contact.findFirst({
              where: { email: contact.email.toLowerCase() },
              include: { importJob: { select: { contextPrompt: true, fileName: true } } },
            })
          : null

        const briefingHtml = `
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;">
            <div style="height:4px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
            <div style="background:#142D48;padding:28px 36px;">
              <p style="color:#C9A96E;font-size:9px;letter-spacing:0.25em;text-transform:uppercase;margin:0 0 6px;font-weight:600;">PropHog Lead — Discovery Call Booked</p>
              <h2 style="color:#ffffff;font-size:20px;font-weight:400;margin:0;">${contact?.firstName ?? ''} ${contact?.lastName ?? ''}</h2>
            </div>
            <div style="padding:28px 36px;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                ${[
                  ['Appointment', formatDateTime(startTime)],
                  ['Email', contact?.email ?? '—'],
                  ['Phone', contact?.phone ?? '—'],
                  ['License Type', localContact?.licenseType ?? contact?.customFields?.find((f: { key: string }) => f.key === 'license_type')?.fieldValue ?? '—'],
                  ['Current Agency', localContact?.currentAgency ?? '—'],
                  ['State', localContact?.state ?? contact?.address1 ?? '—'],
                  ['Lead Type', localContact?.wornOut ? 'Worn Out (soft touch sequence)' : 'Fresh Lead'],
                  ['Import File', localContact?.importJob?.fileName ?? '—'],
                ].map(([label, value]) => `
                  <tr style="border-bottom:1px solid #f0f0f0;">
                    <td style="padding:8px 12px 8px 0;color:#6B8299;font-weight:500;width:140px;">${label}</td>
                    <td style="padding:8px 0;color:#142D48;">${value}</td>
                  </tr>
                `).join('')}
              </table>
              ${localContact?.importJob?.contextPrompt ? `
              <div style="margin-top:20px;background:#F5F9FF;border-left:3px solid #C9A96E;padding:14px 16px;border-radius:0 4px 4px 0;">
                <p style="color:#6B8299;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;font-weight:600;margin:0 0 6px;">Import Context</p>
                <p style="color:#4B5563;font-size:13px;margin:0;line-height:1.6;">${localContact.importJob.contextPrompt}</p>
              </div>` : ''}
            </div>
            <div style="height:3px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
          </div>
        `

        await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method: 'POST', headers,
          body: JSON.stringify({
            type: 'Email',
            contactId: contact.id,
            emailFrom: 'contact@allfinancialfreedom.com',
            emailFromName: 'All Financial Freedom — Vault',
            emailTo: vickEmail,
            subject: `PropHog lead booked: ${contact?.firstName ?? ''} ${contact?.lastName ?? ''} — ${formatDateTime(startTime)}`,
            emailSubject: `PropHog lead booked: ${contact?.firstName ?? ''} ${contact?.lastName ?? ''} — ${formatDateTime(startTime)}`,
            html: briefingHtml,
          }),
        })
      }

      return NextResponse.json({ ok: true, advanced: !!opportunity?.id, emailed: !!contact?.email })
    }

    return NextResponse.json({ ok: true, skipped: eventType })

  } catch (err) {
    console.error('GHL webhook error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
