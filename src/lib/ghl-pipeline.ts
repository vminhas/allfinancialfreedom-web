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
  const isConversion = (stageName === 'Active Agent' || stageName === 'Ready to Onboard') && !contact.convertedAt
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

/**
 * When a new agent is created (via Tevah sync or ICA approval), find
 * any matching Contact in the recruiting pipeline and auto-advance
 * them to "Active Agent." This closes the loop: lead becomes agent.
 *
 * Matching: email (primary), then phone, then first+last name.
 * Best-effort: failures are logged but never block agent creation.
 */
export async function autoAdvanceContactOnAgentCreation(opts: {
  email?: string | null
  phone?: string | null
  firstName?: string
  lastName?: string
}): Promise<void> {
  try {
    // Try matching by email first (most reliable)
    let contact = opts.email
      ? await db.contact.findFirst({
          where: { email: opts.email.toLowerCase() },
          select: { id: true, ghlPipelineStage: true },
        })
      : null

    // Fallback: phone
    if (!contact && opts.phone) {
      const digits = opts.phone.replace(/\D/g, '')
      if (digits.length >= 10) {
        contact = await db.contact.findFirst({
          where: { phone: { contains: digits.slice(-10) } },
          select: { id: true, ghlPipelineStage: true },
        })
      }
    }

    // Fallback: name match (less reliable, only if both names provided)
    if (!contact && opts.firstName && opts.lastName) {
      contact = await db.contact.findFirst({
        where: {
          firstName: { equals: opts.firstName, mode: 'insensitive' },
          lastName: { equals: opts.lastName, mode: 'insensitive' },
        },
        select: { id: true, ghlPipelineStage: true },
      })
    }

    if (!contact) return // No matching contact in pipeline
    if (contact.ghlPipelineStage === 'Active Agent') return // Already there

    await advanceContactStage(contact.id, 'Active Agent')
    console.log(`[auto-advance] Contact ${contact.id} → Active Agent (agent created)`)
  } catch (err) {
    console.error('[auto-advance] failed:', err)
  }
}
