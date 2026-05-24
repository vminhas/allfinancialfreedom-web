import { getGhlConfig, ghlGet, ghlPost } from './ghl'
import { getSetting } from './settings'
import { db } from './db'

// Cached stage map — refreshed once per process lifecycle
let stageMapCache: Map<string, { id: string; name: string }> | null = null
let stageMapPipelineId: string | null = null

export async function getStageMap(pipelineId?: string): Promise<Map<string, { id: string; name: string }>> {
  const pid = pipelineId ?? await getSetting('GHL_PIPELINE_ID') ?? 'j8RckwejQ1VaoH7bQbAf'
  if (stageMapCache && stageMapPipelineId === pid) return stageMapCache

  const config = await getGhlConfig()
  const res = await ghlGet(`/opportunities/pipelines?locationId=${config.locationId}`, config)
  if (!res.ok) return new Map()

  const data = await res.json() as { pipelines: { id: string; stages: { id: string; name: string }[] }[] }
  const pipeline = data.pipelines.find(p => p.id === pid)
  if (!pipeline) return new Map()

  const map = new Map<string, { id: string; name: string }>()
  for (const s of pipeline.stages) {
    map.set(s.name, { id: s.id, name: s.name })
    map.set(s.id, { id: s.id, name: s.name })
  }
  stageMapCache = map
  stageMapPipelineId = pid
  return map
}

/**
 * Advance a contact's pipeline stage in both local DB and GHL.
 * Creates the opportunity in GHL if it doesn't exist yet.
 */
export async function advanceContactStage(contactId: string, stageName: string): Promise<{ ok: boolean; error?: string }> {
  const contact = await db.contact.findUnique({ where: { id: contactId } })
  if (!contact) return { ok: false, error: 'Contact not found' }

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) return { ok: false, error: 'GHL not configured' }

  const pipelineId = await getSetting('GHL_PIPELINE_ID') ?? 'j8RckwejQ1VaoH7bQbAf'
  const stageMap = await getStageMap(pipelineId)
  const stage = stageMap.get(stageName)
  if (!stage) return { ok: false, error: `Unknown stage: ${stageName}` }

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
  }

  let opportunityId = contact.ghlOpportunityId

  // Create opportunity if none exists
  if (!opportunityId && contact.ghlContactId) {
    // Check if one already exists in GHL
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&contact_id=${contact.ghlContactId}&pipeline_id=${pipelineId}`,
      { headers },
    )
    if (searchRes.ok) {
      const searchData = await searchRes.json() as { opportunities?: { id: string }[] }
      opportunityId = searchData.opportunities?.[0]?.id ?? null
    }

    if (!opportunityId) {
      const createRes = await ghlPost('/opportunities/', {
        pipelineId,
        pipelineStageId: stage.id,
        locationId: config.locationId,
        contactId: contact.ghlContactId,
        name: `${contact.firstName} ${contact.lastName}`,
        status: 'open',
      }, config)
      if (createRes.ok) {
        const createData = await createRes.json() as { opportunity?: { id: string } }
        opportunityId = createData.opportunity?.id ?? null
      }
    }
  }

  // Advance the existing opportunity
  if (opportunityId) {
    await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunityId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ pipelineStageId: stage.id }),
    })
  }

  // Update local DB
  const isConversion = stageName === 'Ready to Onboard' && !contact.convertedAt
  await db.contact.update({
    where: { id: contactId },
    data: {
      ghlOpportunityId: opportunityId,
      ghlPipelineStage: stageName,
      ghlStageUpdatedAt: new Date(),
      ...(isConversion ? { convertedAt: new Date() } : {}),
    },
  })

  return { ok: true }
}
