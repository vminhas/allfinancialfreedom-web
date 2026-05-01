import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import type { TrainingAttendanceStatus } from '@/generated/prisma/client'

const VALID_OVERRIDES: TrainingAttendanceStatus[] = [
  'PRESENT', 'ABSENT', 'EXCUSED', 'NOT_TRACKING', 'NOT_JOINED_YET',
]

// POST /api/admin/attendance/cell
// body: { trainingEventId, agentProfileId, manualStatus, note }
//
// Sets (or clears, when manualStatus === null) the admin override on
// a single grid cell. Upserts the row so an admin can mark someone
// EXCUSED for an event we haven't synced yet -- the next Zoom sync
// will preserve the override.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    trainingEventId?: string
    agentProfileId?: string
    manualStatus?: TrainingAttendanceStatus | null
    note?: string | null
  }
  const { trainingEventId, agentProfileId } = body
  if (!trainingEventId || !agentProfileId) {
    return NextResponse.json({ error: 'trainingEventId and agentProfileId are required' }, { status: 400 })
  }
  const manual = body.manualStatus
  if (manual !== null && manual !== undefined && !VALID_OVERRIDES.includes(manual)) {
    return NextResponse.json({ error: `Invalid manualStatus: ${manual}` }, { status: 400 })
  }

  // Confirm both records exist so we don't write dangling rows.
  const [event, agent] = await Promise.all([
    db.trainingEvent.findUnique({ where: { id: trainingEventId }, select: { id: true } }),
    db.agentProfile.findUnique({ where: { id: agentProfileId }, select: { id: true } }),
  ])
  if (!event) return NextResponse.json({ error: 'Training event not found' }, { status: 404 })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Effective status used for the cell render. When clearing the
  // override we fall back to the underlying auto-computed status if
  // there's already a row; otherwise the next sync fills it in.
  const existing = await db.trainingAttendance.findUnique({
    where: {
      trainingEventId_agentProfileId: { trainingEventId, agentProfileId },
    },
  })

  const manualStatus = manual ?? null
  const note = body.note?.trim() || null
  const effective = manualStatus ?? existing?.status ?? 'ABSENT'

  const updated = await db.trainingAttendance.upsert({
    where: {
      trainingEventId_agentProfileId: { trainingEventId, agentProfileId },
    },
    create: {
      trainingEventId,
      agentProfileId,
      status: effective,
      manualStatus,
      manualNote: note,
      source: 'manual',
    },
    update: {
      status: effective,
      manualStatus,
      manualNote: note,
    },
  })

  return NextResponse.json({
    cell: {
      trainingEventId: updated.trainingEventId,
      agentProfileId: updated.agentProfileId,
      status: updated.status,
      manualStatus: updated.manualStatus,
      manualNote: updated.manualNote,
    },
  })
}
