import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { ghlDelete } from '@/lib/ghl'
import { leadValueUsd } from '@/lib/annuity-leads'
import { sendGa4Event } from '@/lib/ga4-mp'
import type { LeadStatus } from '@/generated/prisma/client'

const VALID_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'BOOKED', 'NURTURE', 'WON', 'DEAD']

// Down-funnel value for a converted (WON) client. Placeholder: a closed
// annuity is worth far more than a raw lead. Tune to real commission economics
// (or make it a Setting) when that data exists. qualify uses the lead-score
// value already used for generate_lead so value-based bidding stays consistent.
const CONVERTED_LEAD_VALUE_USD = 1000

// PATCH /api/vault/leads/[id] — staff update of a lead's follow-up state.
// Body: { status?, notes?, markContacted? }. Setting status to anything
// past NEW (or passing markContacted) stamps lastContacted.
//
// Down-funnel conversions: moving a lead to BOOKED fires GA4 qualify_lead, and
// moving it to WON fires close_convert_lead (a WON lead also fires qualify_lead
// if it never did, since a closed client is definitionally qualified). Both go
// to GA4 via the Measurement Protocol using the client_id captured at landing,
// and each fires at most once (qualify_event_at / convert_event_at guard).
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

  const existing = await db.annuityLead.findUnique({
    where: { id },
    select: {
      status: true, score: true, gaClientId: true, gclid: true,
      qualifyEventAt: true, convertEventAt: true,
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  // Decide which down-funnel events this transition triggers. Only fire on a
  // real change into the target status, and only if not already sent.
  const newStatus = data.status
  const becameBooked = newStatus === 'BOOKED' && existing.status !== 'BOOKED'
  const becameWon = newStatus === 'WON' && existing.status !== 'WON'
  const fireQualify = (becameBooked || becameWon) && !existing.qualifyEventAt
  const fireConvert = becameWon && !existing.convertEventAt

  if ((fireQualify || fireConvert) && existing.gaClientId) {
    const common = { clientId: existing.gaClientId, gclid: existing.gclid ?? undefined, leadId: id }
    // Fire best-effort and stamp only what actually sent, so a not-yet-configured
    // secret or a transient failure can still be retried by re-setting status.
    if (fireQualify) {
      const ok = await sendGa4Event({
        ...common, eventName: 'qualify_lead',
        value: leadValueUsd(existing.score), currency: 'USD',
      })
      if (ok) await db.annuityLead.update({ where: { id }, data: { qualifyEventAt: new Date() } }).catch(() => {})
    }
    if (fireConvert) {
      const ok = await sendGa4Event({
        ...common, eventName: 'close_convert_lead',
        value: CONVERTED_LEAD_VALUE_USD, currency: 'USD',
      })
      if (ok) await db.annuityLead.update({ where: { id }, data: { convertEventAt: new Date() } }).catch(() => {})
    }
  }

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
