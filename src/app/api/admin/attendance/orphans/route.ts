import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/attendance/orphans
//   Returns all unresolved orphans from the last 60 days, plus the
//   list of active agents so the admin can pick a match.
//
// POST /api/admin/attendance/orphans
//   body: { orphanId, agentProfileId }
//   Resolves an orphan to an agent: writes a TrainingAttendance row
//   marked as 'manual' / PRESENT (with the orphan's duration), and
//   stamps resolvedAt on the orphan row.
//
// DELETE /api/admin/attendance/orphans?orphanId=...
//   Dismisses the orphan without resolving (e.g. confirmed guest who
//   isn't an agent). Just stamps resolvedAt with a null resolvedAgentId.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const cutoff = new Date(Date.now() - 60 * 86_400_000)

  const orphans = await db.trainingAttendanceOrphan.findMany({
    where: { resolvedAt: null, createdAt: { gte: cutoff } },
    include: {
      trainingEvent: {
        select: { id: true, title: true, startsAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Lightweight agent picker. We only need code/name to render the
  // dropdown; we'll re-validate agentProfileId on POST.
  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, agentCode: true, firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  return NextResponse.json({
    orphans: orphans.map(o => ({
      id: o.id,
      trainingEventId: o.trainingEventId,
      eventTitle: o.trainingEvent.title,
      eventStartsAt: o.trainingEvent.startsAt.toISOString(),
      zoomDisplayName: o.zoomDisplayName,
      zoomEmail: o.zoomEmail,
      joinedAt: o.joinedAt.toISOString(),
      durationSeconds: o.durationSeconds,
      createdAt: o.createdAt.toISOString(),
    })),
    agents,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { orphanId?: string; agentProfileId?: string }
  if (!body.orphanId || !body.agentProfileId) {
    return NextResponse.json({ error: 'orphanId and agentProfileId required' }, { status: 400 })
  }

  const orphan = await db.trainingAttendanceOrphan.findUnique({
    where: { id: body.orphanId },
    include: { trainingEvent: { select: { id: true, startsAt: true } } },
  })
  if (!orphan) return NextResponse.json({ error: 'Orphan not found' }, { status: 404 })
  if (orphan.resolvedAt) {
    return NextResponse.json({ error: 'Orphan already resolved' }, { status: 409 })
  }

  const agent = await db.agentProfile.findUnique({
    where: { id: body.agentProfileId },
    select: { id: true },
  })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Write/update the attendance row. The orphan duration becomes the
  // row's duration so the cell tooltip reflects what Zoom recorded.
  await db.trainingAttendance.upsert({
    where: {
      trainingEventId_agentProfileId: {
        trainingEventId: orphan.trainingEventId,
        agentProfileId: agent.id,
      },
    },
    create: {
      trainingEventId: orphan.trainingEventId,
      agentProfileId: agent.id,
      status: 'PRESENT',
      zoomDisplayName: orphan.zoomDisplayName,
      zoomEmail: orphan.zoomEmail,
      zoomUserId: orphan.zoomUserId,
      joinedAt: orphan.joinedAt,
      durationSeconds: orphan.durationSeconds,
      source: 'manual',
    },
    update: {
      status: 'PRESENT',
      manualStatus: null,        // clear any prior ABSENT manual override
      zoomDisplayName: orphan.zoomDisplayName,
      zoomEmail: orphan.zoomEmail,
      zoomUserId: orphan.zoomUserId,
      joinedAt: orphan.joinedAt,
      durationSeconds: orphan.durationSeconds,
      source: 'manual',
    },
  })

  await db.trainingAttendanceOrphan.update({
    where: { id: orphan.id },
    data: { resolvedAgentId: agent.id, resolvedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const orphanId = searchParams.get('orphanId')
  if (!orphanId) return NextResponse.json({ error: 'orphanId required' }, { status: 400 })

  const orphan = await db.trainingAttendanceOrphan.findUnique({ where: { id: orphanId } })
  if (!orphan) return NextResponse.json({ error: 'Orphan not found' }, { status: 404 })

  await db.trainingAttendanceOrphan.update({
    where: { id: orphanId },
    data: { resolvedAt: new Date(), resolvedAgentId: null },
  })

  return NextResponse.json({ ok: true })
}
