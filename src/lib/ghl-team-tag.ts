/**
 * "AFF Team Member" GHL tag management.
 *
 * Every active agent's GHL contact should carry this tag so GHL
 * workflows can branch on it (e.g. drop them out of recruiting drips
 * once they're on the team). The tag is applied at onboarding (invite),
 * backfilled on demand from /vault/settings, and re-synced daily so a
 * silent API failure self-heals.
 *
 * Tagging is NON-DESTRUCTIVE: we read the contact's current tags and
 * append ours, never PUT a bare array (GHL's PUT replaces the whole
 * tag set, which would wipe source/segmentation tags).
 */

import { db } from './db'
import { getGhlConfig, ghlGet, ghlPost, ghlPut, type GhlConfig } from './ghl'

// GHL lowercases + dedupes tags server-side, so all comparisons are
// case-insensitive. The display/canonical form we send:
export const AFF_TEAM_TAG = 'AFF Team Member'
const AGENT_PORTAL_TAG = 'agent-portal'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type EnsureResult = 'created' | 'tagged' | 'already' | 'not_found' | 'error'

const GHL_BASE = 'https://services.leadconnectorhq.com'

async function searchContactIdByEmail(email: string, config: GhlConfig): Promise<string | null> {
  const res = await fetch(
    `${GHL_BASE}/contacts/search?locationId=${config.locationId}&query=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } },
  )
  if (!res.ok) return null
  const data = await res.json() as { contacts?: { id: string }[] }
  return data.contacts?.[0]?.id ?? null
}

/**
 * Ensure the AFF Team Member tag is on a contact we already have the id
 * for, preserving every existing tag. Returns 'already' when it was
 * present, 'tagged' when added, 'error' on any API failure.
 */
export async function ensureTeamTagOnContact(
  contactId: string,
  config: GhlConfig,
): Promise<EnsureResult> {
  try {
    const getRes = await ghlGet(`/contacts/${contactId}`, config)
    if (!getRes.ok) return 'error'
    const { contact } = await getRes.json() as { contact?: { tags?: string[] } }
    const existing = contact?.tags ?? []
    if (existing.some(t => t.toLowerCase() === AFF_TEAM_TAG.toLowerCase())) {
      return 'already'
    }
    const putRes = await ghlPut(
      `/contacts/${contactId}`,
      { tags: [...existing, AFF_TEAM_TAG] },
      config,
    )
    return putRes.ok ? 'tagged' : 'error'
  } catch {
    return 'error'
  }
}

/**
 * Find (or create) the agent's GHL contact by email and ensure the tag.
 */
async function ensureTeamTagByContact(
  agent: { email: string; firstName: string; lastName: string; phone: string | null },
  config: GhlConfig,
): Promise<EnsureResult> {
  try {
    const id = await searchContactIdByEmail(agent.email, config)
    if (id) return ensureTeamTagOnContact(id, config)

    // No contact yet (agent never emailed/invited). Create one already
    // tagged so workflows can pick them up.
    const createRes = await ghlPost('/contacts/', {
      locationId: config.locationId,
      email: agent.email,
      firstName: agent.firstName,
      lastName: agent.lastName,
      phone: agent.phone ?? undefined,
      tags: [AGENT_PORTAL_TAG, AFF_TEAM_TAG],
    }, config)
    return createRes.ok ? 'created' : 'error'
  } catch {
    return 'error'
  }
}

export interface TeamTagSyncResult {
  ok: boolean
  reason?: string
  processed: number
  created: number
  tagged: number
  already: number
  failed: number
  errors: string[]
}

/**
 * Backfill / re-sync the AFF Team Member tag across every active,
 * non-test agent. Idempotent and safe to run repeatedly: contacts that
 * already carry the tag are skipped with a single read.
 */
export async function syncAllTeamTags(): Promise<TeamTagSyncResult> {
  const result: TeamTagSyncResult = {
    ok: true, processed: 0, created: 0, tagged: 0, already: 0, failed: 0, errors: [],
  }

  const config = await getGhlConfig()
  if (!config.apiKey || !config.locationId) {
    return { ...result, ok: false, reason: 'GHL not configured (missing API key or location id)' }
  }

  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      agentUser: { select: { email: true } },
    },
  })

  for (const a of agents) {
    const email = a.agentUser?.email
    if (!email) continue
    result.processed++
    const outcome = await ensureTeamTagByContact(
      { email, firstName: a.firstName, lastName: a.lastName, phone: a.phone },
      config,
    )
    if (outcome === 'created') result.created++
    else if (outcome === 'tagged') result.tagged++
    else if (outcome === 'already') result.already++
    else {
      result.failed++
      if (result.errors.length < 25) result.errors.push(`${email}: ${outcome}`)
    }
    // Gentle on GHL's rate limit (burst ~100/10s).
    await sleep(120)
  }

  return result
}
