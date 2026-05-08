import { db } from './db'

// Centralized badge registry + auto-management. Adding a new badge
// is two lines (BADGES + an entry in the recompute logic when there
// is one). Storage lives on AgentProfile.badges so we can query
// "all active CFTs" without joining anything.
//
// Source of truth for CFT-ness: the four Phase-3 signoff items below.
// When all four are completed, the agent is a CFT. When any flips
// off, the badge is removed. Admin can also manually toggle via the
// agent edit drawer (PUT /api/admin/agents/[id] with badges in body)
// — a manual set persists until the auto-rule disagrees on the next
// recompute.

export const BADGE_KEYS = ['CFT'] as const
export type BadgeKey = typeof BADGE_KEYS[number]

export const BADGES: Record<BadgeKey, {
  label: string
  longLabel: string
  description: string
  // Tailwind / inline-style hex; reused for both the pill and the star.
  color: string
  // Pill background gradient, dark-navy text on top.
  pillBg: string
}> = {
  CFT: {
    label: 'CFT',
    longLabel: 'Certified Field Trainer',
    description: 'Has signed off on all four Phase 3 CFT certification items: CFT classes, trainer sign-off, coordinator sign-off, and EMD sign-off.',
    color: '#C9A96E',
    pillBg: 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)',
  },
}

// The four Phase-3 PhaseItem keys that gate CFT. Mirrors the set in
// agent-constants.ts; centralized here so the auto-grant rule has
// one place to edit if the curriculum ever changes.
export const CFT_GATE_ITEM_KEYS = [
  'cft_classes',
  'cft_trainer_signoff',
  'cft_coordinator_signoff',
  'emd_signoff',
] as const

// Recompute every auto-managed badge for an agent. Called from any
// path that toggles a Phase-3 signoff item (the admin progress PUT
// is the only one today; if agent-side self-toggle paths ever cover
// these keys, hook them here too).
//
// Conservative behavior: only adds / removes the auto-managed
// portion. A badge that admins explicitly granted manually for a
// non-rule reason (e.g. an EMD lateral hire who was a CFT at their
// previous shop) would get removed on the next recompute if the
// signoff items aren't checked. That's by design — if you want it
// permanent, mark the four signoff items complete too.
export async function recomputeBadges(agentProfileId: string): Promise<string[]> {
  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { badges: true },
  })
  if (!profile) return []

  const items = await db.phaseItem.findMany({
    where: {
      agentProfileId,
      phase: 3,
      itemKey: { in: CFT_GATE_ITEM_KEYS as unknown as string[] },
    },
    select: { itemKey: true, completed: true },
  })

  const completedKeys = new Set(items.filter(i => i.completed).map(i => i.itemKey))
  const isCft = CFT_GATE_ITEM_KEYS.every(k => completedKeys.has(k))

  const current = new Set(profile.badges)
  if (isCft) current.add('CFT')
  else current.delete('CFT')

  const next = Array.from(current)
  // Only write if changed; saves a no-op DB roundtrip on most calls.
  const same = next.length === profile.badges.length && next.every(b => profile.badges.includes(b))
  if (same) return profile.badges

  await db.agentProfile.update({
    where: { id: agentProfileId },
    data: { badges: next },
  })
  return next
}

// Cheap synchronous check for use in API serializers.
export function hasBadge(badges: string[] | null | undefined, key: BadgeKey): boolean {
  return Array.isArray(badges) && badges.includes(key)
}
