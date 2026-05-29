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
  // manualStatus=PRESENT pins the resolution so a future re-sync that
  // still doesn't match the agent natively (e.g. before alias picks
  // them up across instances) doesn't clobber the row back to ABSENT.
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
      manualStatus: 'PRESENT',
      zoomDisplayName: orphan.zoomDisplayName,
      zoomEmail: orphan.zoomEmail,
      zoomUserId: orphan.zoomUserId,
      joinedAt: orphan.joinedAt,
      durationSeconds: orphan.durationSeconds,
      source: 'manual',
    },
    update: {
      status: 'PRESENT',
      manualStatus: 'PRESENT',
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

  // Persist the Zoom alias(es) so the matcher catches this person
  // automatically on every future event. Append-only: if either key
  // is already claimed by a different agent, the upsert reassigns it
  // -- the most recent admin decision wins.
  const nameKey = (orphan.zoomDisplayName ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null
  const emailKey = orphan.zoomEmail?.toLowerCase().trim() || null

  if (nameKey) {
    await db.agentZoomAlias.upsert({
      where: { nameKey },
      create: {
        agentProfileId: agent.id,
        nameKey,
        rawDisplayName: orphan.zoomDisplayName,
        source: 'orphan_resolve',
      },
      update: {
        agentProfileId: agent.id,
        rawDisplayName: orphan.zoomDisplayName,
      },
    })
  }
  if (emailKey) {
    await db.agentZoomAlias.upsert({
      where: { email: emailKey },
      create: {
        agentProfileId: agent.id,
        email: emailKey,
        rawDisplayName: orphan.zoomDisplayName,
        source: 'orphan_resolve',
      },
      update: {
        agentProfileId: agent.id,
      },
    })
  }

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

  // Stamp this orphan resolved so it leaves the queue now.
  await db.trainingAttendanceOrphan.update({
    where: { id: orphanId },
    data: { resolvedAt: new Date(), resolvedAgentId: null },
  })

  // Persist a permanent dismissal so the sync never recreates this
  // guest as an orphan again (across all trainings). Keyed by the
  // normalized display name, with email stored as an extra match
  // signal. Idempotent: re-dismissing the same name updates the row.
  const nameKey = normName(orphan.zoomDisplayName)
  const emailKey = orphan.zoomEmail?.toLowerCase().trim() || null
  if (nameKey) {
    await db.attendanceDismissal.upsert({
      where: { nameKey },
      create: { nameKey, email: emailKey, displayName: orphan.zoomDisplayName },
      update: { email: emailKey, displayName: orphan.zoomDisplayName },
    })
  }

  // Also clear any other still-open orphans for the same guest across
  // events so dismissing once empties the whole queue of that person.
  if (nameKey) {
    const sameGuest = await db.trainingAttendanceOrphan.findMany({
      where: { resolvedAt: null },
      select: { id: true, zoomDisplayName: true, zoomEmail: true },
    })
    const ids = sameGuest
      .filter(o =>
        normName(o.zoomDisplayName) === nameKey ||
        (emailKey && o.zoomEmail?.toLowerCase().trim() === emailKey),
      )
      .map(o => o.id)
    if (ids.length > 0) {
      await db.trainingAttendanceOrphan.updateMany({
        where: { id: { in: ids } },
        data: { resolvedAt: new Date(), resolvedAgentId: null },
      })
    }
  }

  return NextResponse.json({ ok: true })
}

// Normalize a display name the same way attendance-sync does so the
// dismissal key matches what the sync compares against.
function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
