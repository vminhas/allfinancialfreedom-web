import { NextRequest, NextResponse } from 'next/server'
import { getGhlConfig } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { firstName, lastName, email, licensed, pathway, message } = body

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const config = await getGhlConfig()
    const pipelineId = await getSetting('GHL_PIPELINE_ID') || 'mnZ9OIMMkjGo30LAxLDj'
    const stageId = await getSetting('GHL_STAGE_APPLICATION_RECEIVED') || '21995b1a-d5f7-45e0-9897-b8e22dd494c6'

    const GHL_HEADERS = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    }

    // Create contact in GHL
    const contactRes = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: GHL_HEADERS,
      body: JSON.stringify({
        locationId: config.locationId,
        firstName,
        lastName,
        email,
        source: 'Join Form',
        tags: ['join-applicant', licensed === 'yes' ? 'licensed' : 'unlicensed'],
        customFields: [
          { key: 'licensed', field_value: licensed },
          { key: 'pathway', field_value: pathway },
          { key: 'join_message', field_value: message },
        ].filter(f => f.field_value),
      }),
    })

    const contact = await contactRes.json()

    if (!contactRes.ok) {
      console.error('GHL contact error:', contact)
      return NextResponse.json({ ok: true, ghl: false })
    }

    if (contact?.contact?.id) {
      const contactId = contact.contact.id

      // Add to pipeline
      await fetch('https://services.leadconnectorhq.com/opportunities/', {
        method: 'POST',
        headers: GHL_HEADERS,
        body: JSON.stringify({
          pipelineId,
          pipelineStageId: stageId,
          locationId: config.locationId,
          name: `${firstName} ${lastName}${pathway ? ` - ${pathway}` : ' - Application'}`,
          contactId,
          status: 'open',
        }),
      })

      // Send confirmation email
      const bookingUrl = process.env.GHL_BOOKING_URL || 'https://api.leadconnectorhq.com/widget/booking/ZOedxdwvtOnTS6Sg5n7Z'

      const emailHtml = `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
          <div style="height:4px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
          <div style="background:#142D48;padding:40px 48px 36px;">
            <p style="color:#C9A96E;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;margin:0 0 10px;font-weight:600;">All Financial Freedom</p>
            <h1 style="color:#ffffff;font-size:26px;font-weight:300;margin:0;line-height:1.25;">Your application has<br/>been received, ${firstName}.</h1>
          </div>
          <div style="height:1px;background:linear-gradient(90deg,#C9A96E,rgba(201,169,110,0.2));"></div>
          <div style="padding:44px 48px;">
            <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 18px;">Dear ${firstName},</p>
            <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 18px;">On behalf of our leadership team, thank you for your interest in building your future with All Financial Freedom. We have received your application and are reviewing it with the care and attention it deserves.</p>
            <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 32px;">We take every application seriously because we understand that this decision represents more than a career change. It is a commitment to a mission.</p>
            <div style="background:#142D48;border-radius:4px;padding:32px 36px;margin:0 0 32px;text-align:center;">
              <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 10px;">Skip the Wait</p>
              <p style="color:#ffffff;font-size:18px;font-weight:300;margin:0 0 24px;">Ready to talk now?</p>
              <a href="${bookingUrl}" style="display:inline-block;background:#C9A96E;color:#142D48;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:14px 32px;border-radius:3px;">Schedule Your Discovery Call</a>
            </div>
            <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:0 0 4px;">With appreciation,</p>
            <p style="color:#142D48;font-size:15px;font-weight:700;margin:0 0 2px;">Vick Minhas</p>
            <p style="color:#C9A96E;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0;font-weight:500;">Chief Executive Officer, All Financial Freedom</p>
          </div>
          <div style="height:1px;background:#F0F0F0;margin:0 48px;"></div>
          <div style="padding:20px 48px 28px;">
            <p style="color:#9BB0C4;font-size:11px;margin:0 0 6px;"><strong style="color:#6B8299;">All Financial Freedom</strong> &nbsp;&bull;&nbsp; contact@allfinancialfreedom.com</p>
            <p style="color:#C4D0DB;font-size:10px;margin:0;line-height:1.6;">Licensed insurance professionals. Products and availability vary by state. This message was sent because you submitted an application at allfinancialfreedom.com. <a href="https://allfinancialfreedom.com/unsubscribe" style="color:#C4D0DB;text-decoration:none;">Unsubscribe</a></p>
          </div>
          <div style="height:3px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
        </div>
      `

      await fetch('https://services.leadconnectorhq.com/conversations/messages', {
        method: 'POST',
        headers: GHL_HEADERS,
        body: JSON.stringify({
          type: 'Email',
          contactId,
          emailFrom: 'contact@allfinancialfreedom.com',
          emailFromName: 'All Financial Freedom',
          emailTo: email,
          subject: `We received your application, ${firstName}.`,
          emailSubject: `We received your application, ${firstName}.`,
          html: emailHtml,
        }),
      })
    }

    return NextResponse.json({ ok: true, ghl: true })
  } catch (err) {
    console.error('Join API error:', err)
    return NextResponse.json({ ok: true, ghl: false })
  }
}
