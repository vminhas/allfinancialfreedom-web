import { NextRequest, NextResponse } from 'next/server'

const GHL_API_KEY = process.env.GHL_API_KEY ?? 'pit-3413ea2a-3a3f-460b-98c3-6ab3b77153ee'
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? 'tDxu4bUObV7zIes3OGOS'

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

    // Add to Recruit Pipeline if we got a contact ID
    if (contact?.contact?.id) {
      const pipelines = await fetch(
        `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`,
        {
          headers: {
            'Authorization': `Bearer ${GHL_API_KEY}`,
            'Version': '2021-07-28',
          },
        }
      )
      const pipelineData = await pipelines.json()
      const recruitPipeline = pipelineData?.pipelines?.find(
        (p: { name: string }) => p.name.toLowerCase().includes('recruit')
      )

      if (recruitPipeline) {
        const firstStage = recruitPipeline.stages?.[0]
        await fetch('https://services.leadconnectorhq.com/opportunities/', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GHL_API_KEY}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pipelineId: recruitPipeline.id,
            locationId: GHL_LOCATION_ID,
            name: `${firstName} ${lastName} - Application`,
            pipelineStageId: firstStage?.id,
            contactId: contact.contact.id,
            status: 'open',
          }),
        })
      }
    }

    return NextResponse.json({ ok: true, ghl: true })
  } catch (err) {
    console.error('Join API error:', err)
    return NextResponse.json({ ok: true, ghl: false })
  }
}
