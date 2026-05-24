import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGhlConfig, ghlGet } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'

interface GhlOpportunity {
  id: string
  name: string
  status: string
  pipelineStageId: string
  contact: { id: string; name: string; email?: string; phone?: string }
  assignedTo?: string
  monetaryValue?: number
  createdAt: string
  updatedAt: string
}

interface GhlStage {
  id: string
  name: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) {
    return NextResponse.json({ error: 'GHL not configured', synced: 0 })
  }

  const pipelineId = await getSetting('GHL_PIPELINE_ID') ?? 'j8RckwejQ1VaoH7bQbAf'

  // Fetch pipeline stages to map IDs to names
  const stagesRes = await ghlGet(`/opportunities/pipelines?locationId=${config.locationId}`, config)
  let stageMap = new Map<string, string>()
  if (stagesRes.ok) {
    const stagesData = await stagesRes.json() as { pipelines: { id: string; stages: GhlStage[] }[] }
    const pipeline = stagesData.pipelines.find(p => p.id === pipelineId)
    if (pipeline) {
      stageMap = new Map(pipeline.stages.map(s => [s.id, s.name]))
    }
  }

  // Fetch all opportunities from the pipeline (paginated)
  let allOpps: GhlOpportunity[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const res = await ghlGet(
      `/opportunities/search?location_id=${config.locationId}&pipeline_id=${pipelineId}&limit=100&page=${page}`,
      config,
    )
    if (!res.ok) break

    const data = await res.json() as { opportunities: GhlOpportunity[]; meta?: { total?: number; nextPage?: number } }
    allOpps = [...allOpps, ...(data.opportunities ?? [])]

    const total = data.meta?.total ?? 0
    hasMore = allOpps.length < total
    page++
    if (page > 50) break // safety cap
  }

  let synced = 0
  let converted = 0
  const errors: string[] = []

  for (const opp of allOpps) {
    const contactGhlId = opp.contact?.id
    if (!contactGhlId) continue

    const stageName = stageMap.get(opp.pipelineStageId) ?? opp.pipelineStageId

    try {
      const contact = await db.contact.findUnique({ where: { ghlContactId: contactGhlId } })
      if (!contact) continue

      const isConversion = stageName === 'Ready to Onboard' && !contact.convertedAt
      const stageChanged = contact.ghlPipelineStage !== stageName

      if (stageChanged || !contact.ghlOpportunityId) {
        await db.contact.update({
          where: { id: contact.id },
          data: {
            ghlOpportunityId: opp.id,
            ghlPipelineStage: stageName,
            ghlStageUpdatedAt: stageChanged ? new Date() : contact.ghlStageUpdatedAt,
            ...(isConversion ? { convertedAt: new Date() } : {}),
            ...(opp.assignedTo ? { assignedTo: opp.assignedTo } : {}),
          },
        })
        synced++
        if (isConversion) converted++
      }
    } catch (err) {
      errors.push(`${opp.contact?.name ?? opp.id}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // Notify on conversions
  if (converted > 0 && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('@/lib/discord')
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: `${converted} New Conversion${converted > 1 ? 's' : ''}!`,
          description: `${converted} lead${converted > 1 ? 's' : ''} just reached "Ready to Onboard" in the pipeline.`,
          color: 0x4ade80,
          footer: { text: 'AFF Pipeline Sync' },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {})
    } catch {}
  }

  return NextResponse.json({
    synced,
    converted,
    totalOpportunities: allOpps.length,
    errors: errors.slice(0, 10),
  })
}
