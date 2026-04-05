import { NextRequest, NextResponse } from 'next/server'

const GHL_API_KEY = process.env.GHL_API_KEY ?? 'pit-3413ea2a-3a3f-460b-98c3-6ab3b77153ee'
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? 'tDxu4bUObV7zIes3OGOS'
const RECRUIT_PIPELINE_ID = 'mnZ9OIMMkjGo30LAxLDj'
const STAGE_DISCOVERY_BOOKED = '289575e7-21d9-4839-8609-54afdf2150d3'

const GHL_HEADERS = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Version': '2021-07-28',
  'Content-Type': 'application/json',
}

function formatDateTime(iso: string) {
  try {
    const date = new Date(iso)
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

async function getContact(contactId: string) {
  const res = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    headers: GHL_HEADERS,
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.contact ?? null
}

async function getOpportunityForContact(contactId: string) {
  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&contact_id=${contactId}&pipeline_id=${RECRUIT_PIPELINE_ID}`,
    { headers: GHL_HEADERS }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.opportunities?.[0] ?? null
}

async function advancePipelineStage(opportunityId: string) {
  await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunityId}`, {
    method: 'PUT',
    headers: GHL_HEADERS,
    body: JSON.stringify({ pipelineStageId: STAGE_DISCOVERY_BOOKED }),
  })
}

async function sendConfirmationEmail(contact: { id: string; email: string; firstName: string }, appointmentTime: string) {
  const formatted = formatDateTime(appointmentTime)

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">

      <!-- Gold top bar -->
      <div style="height:4px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>

      <!-- Header -->
      <div style="background:#142D48;padding:40px 48px 36px;">
        <p style="color:#C9A96E;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;margin:0 0 10px;font-weight:600;">All Financial Freedom</p>
        <h1 style="color:#ffffff;font-size:26px;font-weight:300;margin:0;line-height:1.25;letter-spacing:-0.01em;">
          Your discovery call<br/>is confirmed, ${contact.firstName}.
        </h1>
      </div>

      <!-- Gold rule -->
      <div style="height:1px;background:linear-gradient(90deg,#C9A96E,rgba(201,169,110,0.2));"></div>

      <!-- Body -->
      <div style="padding:44px 48px;">

        <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 24px;">
          We are looking forward to connecting with you. This call is our opportunity to learn about your goals, answer your questions, and explore whether All Financial Freedom is the right fit for where you want to go.
        </p>

        <!-- Appointment box -->
        <div style="background:#F5F9FF;border:1px solid rgba(201,169,110,0.25);border-left:4px solid #C9A96E;border-radius:4px;padding:28px 32px;margin:0 0 32px;">
          <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 12px;">Your Appointment</p>
          <p style="color:#142D48;font-size:17px;font-weight:600;margin:0 0 4px;">Discovery Call &nbsp;·&nbsp; 30 Minutes</p>
          <p style="color:#4B5563;font-size:14px;margin:0;">${formatted}</p>
        </div>

        <!-- How to prepare -->
        <div style="margin:0 0 32px;">
          <p style="color:#C9A96E;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;margin:0 0 16px;">How to Prepare</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${[
              ['Think about your current financial situation', 'Where you are today, what is working, and what is not.'],
              ['Know your goals', 'Income targets, timeline to retirement, protection needs, legacy plans.'],
              ['Write down your questions', 'No question is too basic. We are here to give you real answers.'],
            ].map(([title, desc]) => `
            <tr>
              <td width="20" valign="top" style="padding-bottom:16px;">
                <div style="width:6px;height:6px;background:#C9A96E;border-radius:50%;margin-top:6px;"></div>
              </td>
              <td valign="top" style="padding-left:12px;padding-bottom:16px;">
                <p style="color:#142D48;font-size:14px;font-weight:600;margin:0 0 2px;">${title}</p>
                <p style="color:#6B8299;font-size:13px;margin:0;line-height:1.6;">${desc}</p>
              </td>
            </tr>`).join('')}
          </table>
        </div>

        <!-- Reschedule note -->
        <div style="background:#142D48;border-radius:4px;padding:24px 32px;margin:0 0 32px;">
          <p style="color:rgba(235,244,255,0.6);font-size:13px;margin:0;line-height:1.7;">
            Need to reschedule? No problem.
            <a href="https://api.leadconnectorhq.com/widget/booking/ZOedxdwvtOnTS6Sg5n7Z"
              style="color:#C9A96E;text-decoration:underline;">Click here to pick a new time.</a>
            We ask for at least 4 hours notice so we can serve everyone well.
          </p>
        </div>

        <p style="color:#4B5563;font-size:15px;line-height:1.85;margin:0 0 32px;">
          Any questions before we connect? Reach us at
          <a href="mailto:contact@allfinancialfreedom.com" style="color:#1B3A5C;text-decoration:underline;font-weight:500;">contact@allfinancialfreedom.com</a>.
          We will see you soon.
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
          Licensed insurance professionals. Products and availability vary by state. You received this because you scheduled a call at allfinancialfreedom.com.
        </p>
      </div>

      <!-- Gold bottom bar -->
      <div style="height:3px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>

    </div>
  `

  await fetch('https://services.leadconnectorhq.com/conversations/messages', {
    method: 'POST',
    headers: GHL_HEADERS,
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

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    console.log('GHL Webhook received:', JSON.stringify(payload, null, 2))

    const eventType = payload.type ?? payload.event

    // Appointment booked
    if (eventType === 'AppointmentCreate' || eventType === 'appointment.created') {
      const contactId = payload.contactId
      const startTime = payload.startTime

      if (!contactId) return NextResponse.json({ ok: true, skipped: 'no contactId' })

      // Run in parallel: fetch contact + find opportunity
      const [contact, opportunity] = await Promise.all([
        getContact(contactId),
        getOpportunityForContact(contactId),
      ])

      // Advance pipeline stage if they're in the recruit pipeline
      if (opportunity?.id) {
        await advancePipelineStage(opportunity.id)
      }

      // Send confirmation email if we have contact details
      if (contact?.email && contact?.firstName) {
        await sendConfirmationEmail(
          { id: contact.id, email: contact.email, firstName: contact.firstName },
          startTime
        )
      }

      return NextResponse.json({ ok: true, advanced: !!opportunity?.id, emailed: !!contact?.email })
    }

    // Unhandled event type — log and return ok
    return NextResponse.json({ ok: true, skipped: eventType })

  } catch (err) {
    console.error('GHL webhook error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
