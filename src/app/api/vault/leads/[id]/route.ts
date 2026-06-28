import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { ghlDelete } from '@/lib/ghl'
import type { LeadStatus } from '@/generated/prisma/client'

const VALID_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'BOOKED', 'NURTURE', 'WON', 'DEAD']

// PATCH /api/vault/leads/[id] — staff update of a lead's follow-up state.
// Body: { status?, notes?, markContacted? }. Setting status to anything
// past NEW (or passing markContacted) stamps lastContacted.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    status?: unknown
    notes?: unknown
    markContacted?: unknown
  }

  const data: { status?: LeadStatus; notes?: string | null; lastContacted?: Date } = {}

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status as LeadStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = body.status as LeadStatus
    if (body.status !== 'NEW') data.lastContacted = new Date()
  }
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  }
  if (body.markContacted === true) {
    data.lastContacted = new Date()
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const lead = await db.annuityLead.update({ where: { id }, data }).catch(() => null)
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ lead })
}

// DELETE /api/vault/leads/[id] — permanently remove a lead. Used for test
// data and deletion requests. Admin + LC. Pass ?ghl=1 to also delete the
// linked GoHighLevel contact (best-effort; the Postgres row is removed
// regardless).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await ctx.params
  const alsoGhl = new URL(req.url).searchParams.get('ghl') === '1'

  const lead = await db.annuityLead.findUnique({ where: { id }, select: { ghlContactId: true } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (alsoGhl && lead.ghlContactId) {
    // Best-effort: don't let a GHL failure block removing our record.
    await ghlDelete(`/contacts/${lead.ghlContactId}`).catch(() => {})
  }

  await db.annuityLead.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
