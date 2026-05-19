import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { listOutstandingItems, fulfillRequestWithItem } from '@/lib/fulfill-request'

// GET  — outstanding phase items for this request's agent, plus the
//        item the request is linked to (default selection in the UI).
// POST { phase, itemKey } — complete that item for the agent and
//        resolve the request. Admin OR licensing coordinator (they
//        work this inbox).

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const request = await db.coordinatorRequest.findUnique({
    where: { id },
    select: {
      phaseItemKey: true,
      agentProfile: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const items = await listOutstandingItems(request.agentProfile.id)
  return NextResponse.json({
    items,
    defaultKey: request.phaseItemKey,
    agentName: `${request.agentProfile.firstName} ${request.agentProfile.lastName}`,
  })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { phase?: number; itemKey?: string }
  if (typeof body.phase !== 'number' || !body.itemKey) {
    return NextResponse.json({ error: 'phase and itemKey required' }, { status: 400 })
  }

  const result = await fulfillRequestWithItem(id, body.phase, body.itemKey)
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 400 })
  }
  return NextResponse.json({
    ok: true,
    agentName: result.agentName,
    label: result.label,
  })
}
