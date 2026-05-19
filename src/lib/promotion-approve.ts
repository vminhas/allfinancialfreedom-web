// Shared promotion-approval logic. A "promotion request" is a
// CoordinatorRequest whose phaseItemKey is one of the admin-approval
// gated items (see /api/vault/promotion-requests). Approving it
// resolves the ticket, marks the gated phase item complete (which the
// title resolver in lib/agent-title.ts picks up immediately), and
// fires the same Discord celebration the agent-self tick would.
//
// Extracted so both surfaces share one code path:
//   - PATCH /api/vault/promotion-requests   (LC inbox button)
//   - the promo-approve Discord button       (/api/discord/interactions)

import { db } from '@/lib/db'

// phaseItemKey -> phase number it lives on.
export const GATED_ITEMS: Record<string, number> = {
  associate_promotion: 2,
  emd_signoff: 3,
  md_promotion: 4,
  emd_promotion: 5,
  nvp_promotion: 6,
}
export const GATED_KEYS = Object.keys(GATED_ITEMS)

// Human label for buttons / messages. Mirrors lib/agent-title.ts.
export const GATED_LABEL: Record<string, string> = {
  associate_promotion: 'Senior Associate Promotion',
  emd_signoff: 'EMD Sign-Off',
  md_promotion: 'Marketing Director Promotion',
  emd_promotion: 'EMD Promotion',
  nvp_promotion: 'NVP Promotion',
}

export function isGatedPromotionKey(key: string | null | undefined): key is string {
  return !!key && key in GATED_ITEMS
}

export interface PromotionActionResult {
  ok: boolean
  error?: string
  agentName?: string
  label?: string
}

export async function approvePromotionRequest(
  requestId: string,
): Promise<PromotionActionResult> {
  const request = await db.coordinatorRequest.findUnique({
    where: { id: requestId },
    include: {
      agentProfile: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  if (!request) return { ok: false, error: 'Request not found' }

  const itemKey = request.phaseItemKey
  if (!isGatedPromotionKey(itemKey)) {
    return { ok: false, error: `Not a gated promotion request (key: ${itemKey ?? 'null'})` }
  }
  const phase = GATED_ITEMS[itemKey]
  const agentName = `${request.agentProfile.firstName} ${request.agentProfile.lastName}`
  const label = GATED_LABEL[itemKey] ?? 'Promotion'

  // Already resolved/closed: treat as a no-op success so a double
  // click (inbox + Discord, or a retry) doesn't error.
  if (request.status === 'RESOLVED' || request.status === 'CLOSED') {
    return { ok: true, agentName, label }
  }

  await db.$transaction([
    db.coordinatorRequest.update({
      where: { id: requestId },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'Approved' },
    }),
    db.phaseItem.upsert({
      where: {
        agentProfileId_phase_itemKey: {
          agentProfileId: request.agentProfileId,
          phase,
          itemKey,
        },
      },
      create: {
        agentProfileId: request.agentProfileId,
        phase,
        itemKey,
        completed: true,
        completedAt: new Date(),
      },
      update: { completed: true, completedAt: new Date() },
    }),
  ])

  // Same celebration the agent-self path fires (announcement +
  // activity feed), gated by the PhaseItemDefinition flags. Non-fatal.
  const { announcePhaseItemCompletion } = await import('@/lib/phase-item-announce')
  const ids = await announcePhaseItemCompletion({
    agentProfileId: request.agentProfileId,
    itemKey,
    phase,
  }).catch(() => ({ activityMsgId: null, announcementMsgId: null }))
  if (ids.activityMsgId || ids.announcementMsgId) {
    await db.phaseItem.update({
      where: {
        agentProfileId_phase_itemKey: {
          agentProfileId: request.agentProfileId,
          phase,
          itemKey,
        },
      },
      data: {
        activityMsgId: ids.activityMsgId,
        announcementMsgId: ids.announcementMsgId,
      },
    }).catch(() => {})
  }

  return { ok: true, agentName, label }
}

export async function rejectPromotionRequest(
  requestId: string,
): Promise<PromotionActionResult> {
  const request = await db.coordinatorRequest.findUnique({
    where: { id: requestId },
    include: {
      agentProfile: { select: { firstName: true, lastName: true } },
    },
  })
  if (!request) return { ok: false, error: 'Request not found' }
  const itemKey = request.phaseItemKey
  if (!isGatedPromotionKey(itemKey)) {
    return { ok: false, error: `Not a gated promotion request (key: ${itemKey ?? 'null'})` }
  }
  const agentName = `${request.agentProfile.firstName} ${request.agentProfile.lastName}`
  const label = GATED_LABEL[itemKey] ?? 'Promotion'

  if (request.status === 'CLOSED' || request.status === 'RESOLVED') {
    return { ok: true, agentName, label }
  }

  await db.coordinatorRequest.update({
    where: { id: requestId },
    data: { status: 'CLOSED', resolvedAt: new Date(), resolutionNote: 'Declined' },
  })
  return { ok: true, agentName, label }
}
