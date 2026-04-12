import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGhlConfig, ghlGet } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pipelineId = await getSetting('GHL_PIPELINE_ID')
  if (!pipelineId) return NextResponse.json({ notConfigured: true })

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) {
    return NextResponse.json({ notConfigured: true })
  }

  // Fetch opportunities grouped by stage
  const pipelineRes = await ghlGet(
    `/opportunities/pipelines/${pipelineId}?locationId=${config.locationId}`,
    config
  )

  if (!pipelineRes.ok) {
    return NextResponse.json({ error: `GHL returned ${pipelineRes.status}` })
  }

  const pipelineData = await pipelineRes.json()
  const rawStages: { id: string; name: string }[] = pipelineData.pipeline?.stages ?? pipelineData.stages ?? []

  // For each stage, fetch a few opportunities to show names
  const stages = await Promise.all(rawStages.map(async (stage) => {
    const oppRes = await ghlGet(
      `/opportunities/search?location_id=${config.locationId}&pipeline_id=${pipelineId}&pipeline_stage_id=${stage.id}&limit=5`,
      config
    )

    let contacts: { name: string; email: string }[] = []
    let count = 0

    if (oppRes.ok) {
      const oppData = await oppRes.json()
      count = oppData.meta?.total ?? oppData.total ?? (oppData.opportunities?.length ?? 0)
      contacts = (oppData.opportunities ?? []).slice(0, 4).map((o: { name: string; contact?: { email?: string } }) => ({
        name: o.name ?? 'Unknown',
        email: o.contact?.email ?? '',
      }))
    }

    return { id: stage.id, name: stage.name, count, contacts }
  }))

  return NextResponse.json({ stages })
}
