// POST /api/agents/partners/bulk
//
// Bulk operations across many contacts at once. Used by the queue /
// prospect lists for "select all checked → classify as Business Partner"
// or "delete these 30 stale contacts."
//
// Body:
//   { ids: string[], action: 'classify', category: '...' }
//   { ids: string[], action: 'skip' }
//   { ids: string[], action: 'delete' }
//   { ids: string[], action: 'advance', status: '...' }
//
// Filtering by agentProfileId on every operation means a malicious
// caller can't touch someone else's contacts even if they guess ids.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

const ALLOWED_CATEGORIES = new Set([
  'business_partner', 'life_market', 'rollover_market', 'fta_contact', 'recruit',
])
const ALLOWED_STATUSES = new Set([
  'PENDING', 'NEW', 'CONTACTED', 'INTRO_SENT', 'BOOKED', 'CONVERTED', 'SKIPPED',
])

interface Body {
  ids: string[]
  action: 'classify' | 'skip' | 'delete' | 'advance'
  category?: string
  status?: string
}

export async function POST(req: NextRequest) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error

  const body = await req.json() as Body
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }
  if (body.ids.length > 1000) {
    return NextResponse.json({ error: 'Too many ids (1000 max)' }, { status: 413 })
  }

  const where = { id: { in: body.ids }, agentProfileId: identity.profileId }

  switch (body.action) {
    case 'classify': {
      if (!body.category || !ALLOWED_CATEGORIES.has(body.category)) {
        return NextResponse.json({ error: 'category required' }, { status: 400 })
      }
      const r = await db.businessPartner.updateMany({
        where,
        data: { category: body.category, status: 'NEW' },
      })
      return NextResponse.json({ updated: r.count })
    }
    case 'skip': {
      const r = await db.businessPartner.updateMany({
        where,
        data: { status: 'SKIPPED' },
      })
      return NextResponse.json({ updated: r.count })
    }
    case 'advance': {
      if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
        return NextResponse.json({ error: 'status required' }, { status: 400 })
      }
      const r = await db.businessPartner.updateMany({
        where,
        data: { status: body.status, lastContactAt: new Date() },
      })
      return NextResponse.json({ updated: r.count })
    }
    case 'delete': {
      const r = await db.businessPartner.deleteMany({ where })
      return NextResponse.json({ deleted: r.count })
    }
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
}
