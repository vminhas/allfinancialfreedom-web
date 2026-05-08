// PATCH /api/agents/partners/[id]/classify
//
// Single-row mutation for the queue / pipeline flow:
//
//   { action: 'classify', category: 'business_partner' | 'fta_contact' | ... }
//     → moves a PENDING contact out of the queue into a lane (status = NEW).
//
//   { action: 'skip' }
//     → keeps the contact but hides it from the queue. Re-imports of the
//       same person won't re-queue them. Reversible via 'unskip'.
//
//   { action: 'unskip' }
//     → puts a SKIPPED contact back into the queue.
//
//   { action: 'advance', status: 'CONTACTED' | 'BOOKED' | 'CONVERTED' }
//     → moves a contact through the lane stages. Stamps lastContactAt
//       so the upline can see "no activity in 90 days" at a glance.
//
// All actions are idempotent. Bulk classifying is a separate endpoint
// (see ./bulk/route.ts) so this stays simple.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

// Three-bucket model after consolidating life_market / rollover_market
// into business_partner / fta_contact. See migration
// 20260430010000_partner_categories_consolidate.
const ALLOWED_CATEGORIES = new Set([
  'recruit', 'business_partner', 'fta_contact',
])
const ALLOWED_STATUSES = new Set([
  'PENDING', 'NEW', 'CONTACTED', 'INTRO_SENT', 'BOOKED', 'CONVERTED', 'SKIPPED',
])

interface Body {
  action: 'classify' | 'skip' | 'unskip' | 'advance'
  category?: string
  status?: string
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error

  const { id } = await ctx.params
  const body = await req.json() as Body

  const existing = await db.businessPartner.findUnique({ where: { id } })
  if (!existing || existing.agentProfileId !== identity.profileId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let data: { category?: string | null; status?: string; lastContactAt?: Date }

  switch (body.action) {
    case 'classify': {
      if (!body.category || !ALLOWED_CATEGORIES.has(body.category)) {
        return NextResponse.json({ error: 'category required' }, { status: 400 })
      }
      data = { category: body.category, status: 'NEW' }
      break
    }
    case 'skip': {
      data = { status: 'SKIPPED' }
      break
    }
    case 'unskip': {
      // If they had a category set, they keep it; just back to NEW.
      // If not, drop them back into the PENDING queue.
      data = { status: existing.category ? 'NEW' : 'PENDING' }
      break
    }
    case 'advance': {
      if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
        return NextResponse.json({ error: 'valid status required' }, { status: 400 })
      }
      data = { status: body.status, lastContactAt: new Date() }
      break
    }
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const updated = await db.businessPartner.update({ where: { id }, data })

  // Fire-and-forget Discord announcement when a contact becomes a Business Partner
  if (body.action === 'classify' && body.category === 'business_partner') {
    db.agentProfile.findUnique({
      where: { id: existing.agentProfileId },
      select: { firstName: true, lastName: true, agentCode: true, avatarUrl: true },
    }).then(agent => {
      if (!agent) return
      import('@/lib/business-partner-announce').then(({ announceBPWelcome }) =>
        announceBPWelcome({
          agentFirstName: agent.firstName,
          agentLastName: agent.lastName,
          agentCode: agent.agentCode,
          agentAvatarUrl: agent.avatarUrl,
          bpName: updated.name,
        })
      )
    }).catch(() => {})
  }

  return NextResponse.json(updated)
}
