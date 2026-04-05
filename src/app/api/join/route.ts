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

    // Add to Recruit Pipeline — Application Received stage
    if (contact?.contact?.id) {
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
          contactId: contact.contact.id,
          status: 'open',
        }),
      })
    }

    return NextResponse.json({ ok: true, ghl: true })
  } catch (err) {
    console.error('Join API error:', err)
    return NextResponse.json({ ok: true, ghl: false })
  }
}
