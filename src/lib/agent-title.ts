// Single source of truth for "what title does this agent hold?"
//
// Every AFF agent starts as an Associate. Title is bumped strictly by
// completing the corresponding admin-approval-gated promotion item:
//
//   nvp_promotion       -> NVP
//   emd_promotion       -> EMD
//   md_promotion        -> Marketing Director
//   associate_promotion -> Senior Associate
//   (none completed)    -> Associate
//
// Phase number is no longer used to derive a title. It still tracks the
// agent's current focus area (onboarding / FTAs / CFT / MD-focus / etc.)
// but a brand-new Phase 1 agent and a seasoned Phase 4 agent who hasn't
// been promoted yet are both "Associate" until Vick checks their next
// promotion box.
//
// Each promoter item is admin-only, surfaces in the tracker's promotion
// queue via /api/vault/promotion-requests, and broadcasts to
// #announcements via src/lib/phase-item-announce.ts (the ALWAYS_ANNOUNCE
// set hardcodes these keys so the broadcast can't be turned off).

import { db } from './db'

// Item key -> title override. Ordered by precedence; the first hit
// wins, so once an agent earns md_promotion their title stays MD even
// after a hypothetical title-removing edit to associate_promotion.
const RANK_OVERRIDES: ReadonlyArray<{ itemKey: string; title: string }> = [
  { itemKey: 'nvp_promotion',       title: 'NVP' },
  { itemKey: 'emd_promotion',       title: 'EMD' },
  { itemKey: 'md_promotion',        title: 'Marketing Director' },
  { itemKey: 'associate_promotion', title: 'Senior Associate' },
]

// Default title for every AFF agent. CEO direction: everybody starts as
// an Associate. Higher ranks are earned by checking the matching
// promotion item.
export const DEFAULT_AGENT_TITLE = 'Associate'

// Map an individual promotion itemKey -> the title that completing it
// awards. Used by the announce helper to render "Promoted to: MD" in
// the milestone embed the moment that box gets checked, instead of
// generic phase numbers.
export function titleForPromotionItem(itemKey: string): string | null {
  return RANK_OVERRIDES.find(r => r.itemKey === itemKey)?.title ?? null
}

export function resolveAgentTitle(args: {
  // phase is accepted for back-compat with existing call sites but is
  // no longer used to derive a title. Safe to drop from new callers.
  phase?: number
  // Caller passes the agent's completed phase-item keys. Don't pass
  // items that are completed=false; this function does no filtering.
  completedItemKeys: string[]
}): string {
  const set = new Set(args.completedItemKeys)
  for (const ov of RANK_OVERRIDES) {
    if (set.has(ov.itemKey)) return ov.title
  }
  return DEFAULT_AGENT_TITLE
}

// Convenience for callers that don't already have phaseItems in hand.
// Issues one extra query, so prefer the sync form when you can.
export async function resolveAgentTitleById(agentProfileId: string): Promise<string> {
  const agent = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: {
      phaseItems: {
        where: { completed: true, itemKey: { in: RANK_OVERRIDES.map(r => r.itemKey) } },
        select: { itemKey: true },
      },
    },
  })
  if (!agent) return DEFAULT_AGENT_TITLE
  return resolveAgentTitle({
    completedItemKeys: agent.phaseItems.map(i => i.itemKey),
  })
}

// Exposed for callers that need to know whether a given item key is
// one of the title-override gates (e.g. for triggering a re-fetch of
// agent identity after that specific item changes).
export const TITLE_OVERRIDE_ITEM_KEYS: string[] = RANK_OVERRIDES.map(r => r.itemKey)
