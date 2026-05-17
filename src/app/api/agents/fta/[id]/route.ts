import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import type { FtaCategory, FtaStatus } from '@/generated/prisma/client'

const VALID_CATEGORIES: FtaCategory[] = [
  'UNDER_50', 'FIFTY_PLUS', 'FIFTY_NINE_HALF_PLUS',
  'JUST_RETIRED', 'TRANSITIONING_JOBS', 'RECEIVED_INHERITANCE',
]

const VALID_STATUSES: FtaStatus[] = [
  'SCHEDULED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED', 'NO_SHOW',
]

// Phase 2 checklist keys that mirror the FTA appointments. Keep them
// in order so the auto-tick on COMPLETED fills the lowest unticked
// slot first and an undo unticks the highest currently checked slot.
const FTA_PHASE_KEYS = [
  'fta_1', 'fta_2', 'fta_3', 'fta_4', 'fta_5',
  'fta_6', 'fta_7', 'fta_8', 'fta_9', 'fta_10',
] as const

const EDITABLE = [
  'name', 'phone', 'timeZone', 'age', 'married', 'children',
  'homeowner', 'occupation60kPlus', 'appointmentDate', 'notes', 'category',
  'status', 'outcomeNotes', 'businessPartnerId',
] as const

async function getAgentProfileId() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') return null
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) return null
  const p = await db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true },
  })
  return p?.id ?? null
}

async function ownsFta(profileId: string, ftaId: string): Promise<boolean> {
  const f = await db.fieldTrainingAppointment.findUnique({ where: { id: ftaId }, select: { agentProfileId: true } })
  return !!f && f.agentProfileId === profileId
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profileId = await getAgentProfileId()
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.fieldTrainingAppointment.findUnique({
    where: { id },
    select: { agentProfileId: true, status: true, appointmentDate: true, originalDate: true },
  })
  if (!existing || existing.agentProfileId !== profileId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json() as Record<string, unknown>
  const data: Record<string, unknown> = {}
  for (const f of EDITABLE) {
    if (!(f in body)) continue
    const v = body[f]
    if (f === 'appointmentDate') data[f] = v ? new Date(v as string) : undefined
    else if (f === 'age' || f === 'children') data[f] = v == null || v === '' ? null : Number(v)
    else if (f === 'married' || f === 'homeowner' || f === 'occupation60kPlus') data[f] = v == null ? null : Boolean(v)
    else if (f === 'category') {
      if (v != null && v !== '' && !VALID_CATEGORIES.includes(v as FtaCategory)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
      }
      data[f] = v || null
    } else if (f === 'status') {
      if (v != null && !VALID_STATUSES.includes(v as FtaStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      data[f] = v
    } else if (f === 'businessPartnerId') {
      // Allow clearing or swapping the linked FTA contact. When set,
      // verify the BP belongs to the agent so they can't link to
      // someone else's contact by guessing IDs.
      if (v && typeof v === 'string') {
        const bp = await db.businessPartner.findUnique({
          where: { id: v },
          select: { agentProfileId: true },
        })
        if (!bp || bp.agentProfileId !== profileId) {
          return NextResponse.json({ error: 'Invalid FTA contact' }, { status: 400 })
        }
        data[f] = v
      } else {
        data[f] = null
      }
    } else data[f] = v === '' ? null : v
  }

  // Lifecycle stamps + reschedule history. We snapshot the very first
  // appointment date into originalDate the first time the agent moves
  // an FTA to RESCHEDULED, so subsequent reschedules keep showing the
  // original time in the UI.
  const newStatus = data.status as FtaStatus | undefined
  if (newStatus) {
    if (newStatus === 'COMPLETED') {
      data.completedAt = new Date()
      data.cancelledAt = null
    } else if (newStatus === 'CANCELLED' || newStatus === 'NO_SHOW') {
      data.cancelledAt = new Date()
      data.completedAt = null
    } else if (newStatus === 'SCHEDULED' || newStatus === 'RESCHEDULED') {
      data.completedAt = null
      data.cancelledAt = null
    }
    if (newStatus === 'RESCHEDULED' && !existing.originalDate) {
      data.originalDate = existing.appointmentDate
    }
  }

  const updated = await db.fieldTrainingAppointment.update({ where: { id }, data })

  // Auto-tick the Phase 2 fta_N checklist items off completed appointments.
  // Each COMPLETED FTA fills the lowest unchecked slot; reverting away from
  // COMPLETED unfills the highest checked slot. Keeps the agent's checklist
  // in sync with reality without forcing them to maintain two lists.
  const wasCompleted = existing.status === 'COMPLETED'
  const isCompleted = updated.status === 'COMPLETED'
  if (wasCompleted !== isCompleted) {
    const currentItems = await db.phaseItem.findMany({
      where: { agentProfileId: profileId, phase: 2, itemKey: { in: FTA_PHASE_KEYS as unknown as string[] } },
      select: { itemKey: true, completed: true, linkedFtaId: true },
    })
    const completedKeys = new Set(currentItems.filter(i => i.completed).map(i => i.itemKey))

    if (isCompleted) {
      const next = FTA_PHASE_KEYS.find(k => !completedKeys.has(k))
      if (next) {
        await db.phaseItem.upsert({
          where: { agentProfileId_phase_itemKey: { agentProfileId: profileId, phase: 2, itemKey: next } },
          update: { completed: true, completedAt: new Date(), linkedFtaId: id },
          create: { agentProfileId: profileId, phase: 2, itemKey: next, completed: true, completedAt: new Date(), linkedFtaId: id },
        })
      }
    } else {
      // Find the slot linked to THIS FTA and untick it specifically.
      const linkedSlot = currentItems.find(i => i.completed && (i as { linkedFtaId?: string }).linkedFtaId === id)
      const keyToUntick = linkedSlot?.itemKey ?? [...FTA_PHASE_KEYS].reverse().find(k => completedKeys.has(k))
      if (keyToUntick) {
        await db.phaseItem.update({
          where: { agentProfileId_phase_itemKey: { agentProfileId: profileId, phase: 2, itemKey: keyToUntick } },
          data: { completed: false, completedAt: null, linkedFtaId: null },
        })
      }
    }
  }

  return NextResponse.json({ fta: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profileId = await getAgentProfileId()
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!(await ownsFta(profileId, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.fieldTrainingAppointment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
