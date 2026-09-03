import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import type { FtaCategory, FtaStatus } from '@/generated/prisma/client'

const VALID_CATEGORIES: FtaCategory[] = [
  'UNDER_50', 'FIFTY_PLUS', 'FIFTY_NINE_HALF_PLUS',
  'JUST_RETIRED', 'TRANSITIONING_JOBS', 'RECEIVED_INHERITANCE',
]

const VALID_STATUSES: FtaStatus[] = [
  'SCHEDULED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED', 'NO_SHOW',
]

// Phase 2 checklist keys that mirror the FTA appointments. Mercedes
// (D2161) reported that filling out FTAs from the tab didn't tick
// the checklist — only the [id] PATCH had the auto-tick logic, and
// the create endpoint defaulted everything to SCHEDULED. POST now
// accepts status (typical for back-logging a past FTA) and fires the
// same auto-tick when status comes in as COMPLETED.
const FTA_PHASE_KEYS = [
  'fta_1', 'fta_2', 'fta_3', 'fta_4', 'fta_5',
  'fta_6', 'fta_7', 'fta_8', 'fta_9', 'fta_10',
] as const

async function tickNextFtaPhaseItem(profileId: string, ftaId?: string) {
  const currentItems = await db.phaseItem.findMany({
    where: { agentProfileId: profileId, phase: 2, itemKey: { in: FTA_PHASE_KEYS as unknown as string[] } },
    select: { itemKey: true, completed: true },
  })
  const completedKeys = new Set(currentItems.filter(i => i.completed).map(i => i.itemKey))
  const next = FTA_PHASE_KEYS.find(k => !completedKeys.has(k))
  if (!next) return
  await db.phaseItem.upsert({
    where: { agentProfileId_phase_itemKey: { agentProfileId: profileId, phase: 2, itemKey: next } },
    update: { completed: true, completedAt: new Date(), ...(ftaId ? { linkedFtaId: ftaId } : {}) },
    create: { agentProfileId: profileId, phase: 2, itemKey: next, completed: true, completedAt: new Date(), ...(ftaId ? { linkedFtaId: ftaId } : {}) },
  })
}

export async function GET(req: NextRequest) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error
  const profileId = identity.profileId
  const ftas = await db.fieldTrainingAppointment.findMany({
    where: { agentProfileId: profileId },
    orderBy: { appointmentDate: 'desc' },
    include: {
      businessPartner: {
        select: { id: true, name: true, phone: true, email: true, occupation: true, category: true },
      },
    },
  })
  return NextResponse.json({ ftas })
}

export async function POST(req: NextRequest) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error
  const profileId = identity.profileId
  const body = await req.json() as Record<string, unknown>
  if (!body.appointmentDate) {
    return NextResponse.json({ error: 'appointmentDate is required' }, { status: 400 })
  }
  const category = (body.category as FtaCategory | undefined) || null
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  // If a businessPartnerId is supplied, verify it belongs to the agent
  // and snapshot name/phone from the BP record so the FTA still reads
  // even if the contact is later renamed or deleted.
  const businessPartnerId = (body.businessPartnerId as string) || null
  let snapshotName: string | null = (body.name as string) || null
  let snapshotPhone: string | null = (body.phone as string) || null
  if (businessPartnerId) {
    const bp = await db.businessPartner.findUnique({
      where: { id: businessPartnerId },
      select: { agentProfileId: true, name: true, phone: true },
    })
    if (!bp || bp.agentProfileId !== profileId) {
      return NextResponse.json({ error: 'Invalid FTA contact' }, { status: 400 })
    }
    if (!snapshotName) snapshotName = bp.name
    if (!snapshotPhone) snapshotPhone = bp.phone ?? null
  }

  if (!snapshotName) {
    return NextResponse.json({ error: 'name or businessPartnerId is required' }, { status: 400 })
  }

  const apptDate = new Date(body.appointmentDate as string)
  const existing = await db.fieldTrainingAppointment.findFirst({
    where: {
      agentProfileId: profileId,
      appointmentDate: apptDate,
      ...(businessPartnerId ? { businessPartnerId } : { name: snapshotName }),
    },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: 'This appointment has already been logged' }, { status: 409 })
  }

  // Optional status on create lets the form back-log a past FTA in one
  // step (SCHEDULED → COMPLETED would otherwise need a second PATCH and
  // the agent had to remember to click "Mark completed").
  let status: FtaStatus | undefined
  if (typeof body.status === 'string' && body.status.length > 0) {
    if (!VALID_STATUSES.includes(body.status as FtaStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    status = body.status as FtaStatus
  }

  const fta = await db.fieldTrainingAppointment.create({
    data: {
      agentProfileId: profileId,
      businessPartnerId,
      name: snapshotName,
      phone: snapshotPhone,
      timeZone: (body.timeZone as string) || null,
      age: body.age != null && body.age !== '' ? Number(body.age) : null,
      married: body.married == null ? null : Boolean(body.married),
      children: body.children != null && body.children !== '' ? Number(body.children) : null,
      homeowner: body.homeowner == null ? null : Boolean(body.homeowner),
      occupation60kPlus: body.occupation60kPlus == null ? null : Boolean(body.occupation60kPlus),
      appointmentDate: new Date(body.appointmentDate as string),
      notes: (body.notes as string) || null,
      category,
      ...(status ? { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) } : {}),
    },
  })

  if (status === 'COMPLETED') {
    await tickNextFtaPhaseItem(profileId, fta.id)
  }

  return NextResponse.json({ fta })
}
