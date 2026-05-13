// Single source of truth for "what title does this agent hold?"
//
// Title is normally derived from phase number (PHASE_TITLE in discord-card),
// but a handful of phase items are admin-approval-gated rank earns that
// bump the title mid-phase. An agent in Phase 2 with associate_promotion
// completed is a Senior Associate even though PHASE_TITLE[2] = 'Agent'.
//
// Precedence (highest first):
//   nvp_promotion       -> NVP
//   emd_promotion       -> EMD
//   md_promotion        -> Marketing Director
//   associate_promotion -> Senior Associate
//   default             -> PHASE_TITLE[phase]
//
// Each promoter item should be Admin Only + announces, gated through
// /api/vault/promotion-requests so leadership controls when the rank
// flips.

import { db } from './db'
import { PHASE_TITLE } from './discord-card'

// Item key -> title override. Ordered by precedence; the first hit
// wins, so once an agent earns md_promotion their title stays MD even
// after a hypothetical title-removing edit to associate_promotion.
const RANK_OVERRIDES: Array<{ itemKey: string; title: string }> = [
  { itemKey: 'nvp_promotion',       title: 'NVP' },
  { itemKey: 'emd_promotion',       title: 'EMD' },
  { itemKey: 'md_promotion',        title: 'Marketing Director' },
  { itemKey: 'associate_promotion', title: 'Senior Associate' },
]

export function resolveAgentTitle(args: {
  phase: number
  // Caller passes the agent's completed phase-item keys. Don't pass
  // items that are completed=false; this function does no filtering.
  completedItemKeys: string[]
}): string {
  const set = new Set(args.completedItemKeys)
  for (const ov of RANK_OVERRIDES) {
    if (set.has(ov.itemKey)) return ov.title
  }
  return PHASE_TITLE[args.phase] ?? `Phase ${args.phase}`
}

// Convenience for callers that don't already have phaseItems in hand.
// Issues one extra query, so prefer the sync form when you can.
export async function resolveAgentTitleById(agentProfileId: string): Promise<string> {
  const agent = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: {
      phase: true,
      phaseItems: {
        where: { completed: true, itemKey: { in: RANK_OVERRIDES.map(r => r.itemKey) } },
        select: { itemKey: true },
      },
    },
  })
  if (!agent) return 'Agent'
  return resolveAgentTitle({
    phase: agent.phase,
    completedItemKeys: agent.phaseItems.map(i => i.itemKey),
  })
}

// Exposed for callers that need to know whether a given item key is
// one of the title-override gates (e.g. for triggering a re-fetch of
// agent identity after that specific item changes).
export const TITLE_OVERRIDE_ITEM_KEYS: string[] = RANK_OVERRIDES.map(r => r.itemKey)
