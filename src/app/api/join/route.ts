import { NextRequest, NextResponse } from 'next/server'

const GHL_API_KEY = process.env.GHL_API_KEY ?? 'pit-3413ea2a-3a3f-460b-98c3-6ab3b77153ee'
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? 'tDxu4bUObV7zIes3OGOS'
const RECRUIT_PIPELINE_ID = 'mnZ9OIMMkjGo30LAxLDj'
const RECRUIT_STAGE_ID = '21995b1a-d5f7-45e0-9897-b8e22dd494c6' // Application Received

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { firstName, lastName, email, phone, licensed, message } = body

  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    // Create contact in GHL
    const contactRes = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        firstName,
        lastName,
        email,
        phone,
        source: 'Join Form',
        tags: ['join-applicant', licensed === 'yes' ? 'licensed' : 'unlicensed'],
        customFields: [
          { key: 'licensed', field_value: licensed },
          { key: 'join_message', field_value: message },
        ],
      }),
    })

    const contact = await contactRes.json()

    if (!contactRes.ok) {
      console.error('GHL contact error:', contact)
      // Still return success to user — we got the data
      return NextResponse.json({ ok: true, ghl: false })
    }

    if (contact?.contact?.id) {
      const contactId = contact.contact.id

      // Add to Recruit Pipeline — Application Received stage
      await fetch('https://services.leadconnectorhq.com/opportunities/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GHL_API_KEY}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pipelineId: RECRUIT_PIPELINE_ID,
          pipelineStageId: RECRUIT_STAGE_ID,
          locationId: GHL_LOCATION_ID,
          name: `${firstName} ${lastName} - Application`,
          contactId,
          status: 'open',
        }),
      })

      // Send confirmation email to applicant
      const emailHtml = `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">

          <!-- Gold top bar -->
          <div style="height:4px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>

          <!-- Header -->
          <div style="background:#142D48;padding:40px 48px 36px;">
            <p style="color:#C9A96E;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;margin:0 0 10px;font-weight:600;">All Financial Freedom</p>
            <h1 style="color:#ffffff;font-size:26px;font-weight:300;margin:0;line-height:1.25;letter-spacing:-0.01em;">
              Your application has<br/>been received, ${firstName}.
            </h1>
          </div>

          <!-- Gold rule -->
          <div style="height:1px;background:linear-gradient(90deg,#C9A96E,rgba(201,169,110,0.2));"></div>

          <!-- Body -->
          <div style="padding:44px 48px;">

            <p style="color:#1A2B3C;font-size:16px;line-height:1.85;margin:0 0 20px;font-weight:400;">
              Dear ${firstName},
            </p>

            <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 18px;">
              On behalf of our leadership team, thank you for your interest in building your future with All Financial Freedom. We have received your application and are reviewing it with the care and attention it deserves.
            </p>

            <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 32px;">
              We take every application seriously because we understand that this decision represents more than a career change. It is a commitment to a mission. We are committed to giving you an equally thoughtful response.
            </p>

            <!-- What Happens Next box -->
            <div style="background:#F5F9FF;border:1px solid rgba(201,169,110,0.2);border-radius:4px;padding:32px 36px;margin:0 0 32px;">
              <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 20px;">What Happens Next</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="32" valign="top" style="padding-bottom:20px;">
                    <div style="width:24px;height:24px;background:#142D48;border-radius:50%;text-align:center;line-height:24px;color:#C9A96E;font-size:11px;font-weight:700;">1</div>
                  </td>
                  <td valign="top" style="padding-left:14px;padding-bottom:20px;">
                    <p style="color:#142D48;font-size:14px;font-weight:600;margin:0 0 3px;">Application Review</p>
                    <p style="color:#6B8299;font-size:13px;margin:0;line-height:1.6;">Our leadership team reviews every application personally within 24 to 48 business hours.</p>
                  </td>
                </tr>
                <tr>
                  <td width="32" valign="top" style="padding-bottom:20px;">
                    <div style="width:24px;height:24px;background:#142D48;border-radius:50%;text-align:center;line-height:24px;color:#C9A96E;font-size:11px;font-weight:700;">2</div>
                  </td>
                  <td valign="top" style="padding-left:14px;padding-bottom:20px;">
                    <p style="color:#142D48;font-size:14px;font-weight:600;margin:0 0 3px;">Discovery Call</p>
                    <p style="color:#6B8299;font-size:13px;margin:0;line-height:1.6;">We will reach out to schedule a focused 30-minute conversation to explore your goals and answer your questions.</p>
                  </td>
                </tr>
                <tr>
                  <td width="32" valign="top">
                    <div style="width:24px;height:24px;background:#142D48;border-radius:50%;text-align:center;line-height:24px;color:#C9A96E;font-size:11px;font-weight:700;">3</div>
                  </td>
                  <td valign="top" style="padding-left:14px;">
                    <p style="color:#142D48;font-size:14px;font-weight:600;margin:0 0 3px;">Onboarding and Launch</p>
                    <p style="color:#6B8299;font-size:13px;margin:0;line-height:1.6;">If we are the right fit for one another, we will walk you through licensing, training, and your first week with a clear action plan.</p>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Calendar CTA -->
            <div style="background:#142D48;border-radius:4px;padding:32px 36px;margin:0 0 32px;text-align:center;">
              <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 10px;">Skip the Wait</p>
              <p style="color:#ffffff;font-size:18px;font-weight:300;margin:0 0 8px;line-height:1.4;">Ready to talk now?</p>
              <p style="color:rgba(235,244,255,0.6);font-size:13px;margin:0 0 24px;line-height:1.6;">Pick a time that works for you and we will come prepared to answer every question you have.</p>
              <a href="https://api.leadconnectorhq.com/widget/booking/ZOedxdwvtOnTS6Sg5n7Z"
                style="display:inline-block;background:#C9A96E;color:#142D48;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:14px 32px;border-radius:3px;">
                Schedule Your Discovery Call
              </a>
            </div>

            <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 32px;">
              If you have any questions before we connect, our team is available at
              <a href="mailto:contact@allfinancialfreedom.com" style="color:#1B3A5C;text-decoration:underline;font-weight:500;">contact@allfinancialfreedom.com</a>.
              We look forward to learning more about you.
            </p>

            <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:0 0 4px;">With appreciation,</p>
            <p style="color:#142D48;font-size:15px;font-weight:700;margin:0 0 2px;">Vick Minhas</p>
            <p style="color:#C9A96E;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0;font-weight:500;">Chief Executive Officer, All Financial Freedom</p>
          </div>

          <!-- Divider -->
          <div style="height:1px;background:#F0F0F0;margin:0 48px;"></div>

          <!-- Footer -->
          <div style="padding:24px 48px 32px;">
            <p style="color:#9BB0C4;font-size:11px;margin:0 0 6px;line-height:1.7;">
              <strong style="color:#6B8299;">All Financial Freedom</strong> &nbsp;&bull;&nbsp; contact@allfinancialfreedom.com
            </p>
            <p style="color:#C4D0DB;font-size:10px;margin:0;line-height:1.6;">
              Licensed insurance professionals. Products and availability vary by state. This message was sent because you submitted an application at allfinancialfreedom.com.
            </p>
          </div>

          <!-- Gold bottom bar -->
          <div style="height:3px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>

        </div>
      `

      await fetch('https://services.leadconnectorhq.com/conversations/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GHL_API_KEY}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'Email',
          contactId,
          emailFrom: 'contact@allfinancialfreedom.com',
          emailFromName: 'All Financial Freedom',
          emailTo: email,
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
