// Generic "satisfy a coordinator request" path: complete ANY of the
// agent's outstanding phase items and resolve the ticket in one step.
// The completion side-effects (Discord announcement + CFT badge
// recompute) mirror the canonical admin progress route
// (src/app/api/admin/agents/[id]/progress/route.ts) so an item
// fulfilled from the LC inbox behaves identically to an admin ticking
// the box. We only ever COMPLETE here (never retract), so the
// retraction branch from that route is intentionally omitted.

import { db } from '@/lib/db'
import { PHASE_ITEMS } from '@/lib/agent-constants'
import { recomputeBadges, CFT_GATE_ITEM_KEYS } from '@/lib/agent-badges'

export interface OutstandingItem {
  phase: number
  itemKey: string
  label: string
}

// Every defined phase item the agent has NOT completed yet, across all
// phases (so the LC can clear an earlier-phase leftover or grant the
// next promotion gate regardless of the agent's current phase).
export async function listOutstandingItems(
  agentProfileId: string,
): Promise<OutstandingItem[]> {
  const done = await db.phaseItem.findMany({
    where: { agentProfileId, completed: true },
    select: { phase: true, itemKey: true },
  })
  const doneSet = new Set(done.map(d => `${d.phase}:${d.itemKey}`))

  const out: OutstandingItem[] = []
  for (const [phaseStr, items] of Object.entries(PHASE_ITEMS)) {
    const phase = Number(phaseStr)
    for (const it of items) {
      if (!doneSet.has(`${phase}:${it.key}`)) {
        out.push({ phase, itemKey: it.key, label: it.label })
      }
    }
  }
  return out
}

export interface FulfillResult {
  ok: boolean
  error?: string
  agentName?: string
  label?: string
}

export async function fulfillRequestWithItem(
  requestId: string,
  phase: number,
  itemKey: string,
): Promise<FulfillResult> {
  const request = await db.coordinatorRequest.findUnique({
    where: { id: requestId },
    include: {
      agentProfile: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  if (!request) return { ok: false, error: 'Request not found' }

  const defs = PHASE_ITEMS[phase]
  const def = defs?.find(d => d.key === itemKey)
  if (!def) {
    return { ok: false, error: `Unknown item ${itemKey} for phase ${phase}` }
  }

  const agentProfileId = request.agentProfile.id
  const agentName = `${request.agentProfile.firstName} ${request.agentProfile.lastName}`
  const label = def.label

  const prior = await db.phaseItem.findUnique({
    where: { agentProfileId_phase_itemKey: { agentProfileId, phase, itemKey } },
    select: { completed: true, announcementMsgId: true, activityMsgId: true },
  })

  await db.phaseItem.upsert({
    where: { agentProfileId_phase_itemKey: { agentProfileId, phase, itemKey } },
    update: { completed: true, completedAt: new Date() },
    create: { agentProfileId, phase, itemKey, completed: true, completedAt: new Date() },
  })

  // Fire the celebration only on a real false->true transition that
  // hasn't been announced before (same guard as the admin route, so a
  // re-fulfill or inbox+Discord double-action never double-posts).
  const shouldAnnounce =
    !prior?.completed && !prior?.announcementMsgId && !prior?.activityMsgId
  if (shouldAnnounce) {
    const { announcePhaseItemCompletion } = await import('@/lib/phase-item-announce')
    const ids = await announcePhaseItemCompletion({ agentProfileId, itemKey, phase })
      .catch(() => ({ activityMsgId: null, announcementMsgId: null }))
    if (ids.activityMsgId || ids.announcementMsgId) {
      await db.phaseItem.update({
        where: { agentProfileId_phase_itemKey: { agentProfileId, phase, itemKey } },
        data: { activityMsgId: ids.activityMsgId, announcementMsgId: ids.announcementMsgId },
      }).catch(() => {})
    }
  }

  // CFT-gating Phase 3 signoffs drive the auto-managed CFT badge.
  if ((CFT_GATE_ITEM_KEYS as unknown as string[]).includes(itemKey) && phase === 3) {
    recomputeBadges(agentProfileId).catch(err =>
      console.warn('[fulfill-request] recomputeBadges failed:', err),
    )
  }

  // Auto-resolve the ticket unless it's already closed out.
  if (request.status !== 'RESOLVED' && request.status !== 'CLOSED') {
    await db.coordinatorRequest.update({
      where: { id: requestId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolutionNote: `Completed: ${label}`,
      },
    })
  }

  return { ok: true, agentName, label }
}
