import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGhlConfig, ghlPost, ghlGet } from '@/lib/ghl'
import { setSetting } from '@/lib/settings'

const PIPELINE_STAGES = [
  { name: 'Application Received' },
  { name: 'Contacted' },
  { name: 'Responded' },
  { name: 'Discovery Booked' },
  { name: 'Not Responding' },
  { name: 'Not Interested' },
  { name: 'Qualified' },
  { name: 'Ready to Onboard' },
]

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) {
    return NextResponse.json({ error: 'GHL not configured' }, { status: 400 })
  }

  // Check if pipeline already exists
  const existingRes = await ghlGet(`/opportunities/pipelines?locationId=${config.locationId}`, config)
  if (existingRes.ok) {
    const existing = await existingRes.json()
    const pipelines = existing.pipelines ?? []
    const found = pipelines.find((p: { name: string }) => p.name === 'AFF Recruit')
    if (found) {
      // Save existing IDs
      await setSetting('GHL_PIPELINE_ID', found.id)
      for (const stage of found.stages ?? []) {
        const key = `GHL_STAGE_${stage.name.replace(/\s+/g, '_').toUpperCase()}`
        await setSetting(key, stage.id)
      }
      return NextResponse.json({ ok: true, pipelineId: found.id, existing: true })
    }
  }

  // Create new pipeline
  const createRes = await ghlPost('/opportunities/pipelines', {
    locationId: config.locationId,
    name: 'AFF Recruit',
    stages: PIPELINE_STAGES.map((s, i) => ({ name: s.name, position: i + 1 })),
  }, config)

  if (!createRes.ok) {
    const err = await createRes.text()
    return NextResponse.json({ error: `GHL pipeline creation failed: ${err}` }, { status: 500 })
  }

  const pipeline = await createRes.json()
  const pipelineId = pipeline.pipeline?.id ?? pipeline.id

  await setSetting('GHL_PIPELINE_ID', pipelineId)

  // Fetch and save stage IDs
  const stagesRes = await ghlGet(`/opportunities/pipelines/${pipelineId}?locationId=${config.locationId}`, config)
  if (stagesRes.ok) {
    const stagesData = await stagesRes.json()
    for (const stage of stagesData.pipeline?.stages ?? stagesData.stages ?? []) {
      const key = `GHL_STAGE_${stage.name.replace(/\s+/g, '_').toUpperCase()}`
      await setSetting(key, stage.id)
    }
  }

  return NextResponse.json({ ok: true, pipelineId, existing: false })
}
