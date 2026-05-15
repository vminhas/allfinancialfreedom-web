import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// Manage the permanent training do-not-track list. Agents on it
// render red (NOT_TRACKING) across every training in the attendance
// grid without per-cell clicks, unless an explicit per-event manual
// override says otherwise.
//
//   GET    -> list current exclusions (+ agent name for the UI)
//   POST   -> add { agentProfileId, reason? }
//   DELETE -> remove ?agentProfileId=...

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const rows = await db.trainingAttendanceExclusion.findMany({
    include: {
      agentProfile: {
        select: { id: true, agentCode: true, firstName: true, lastName: true, preferredName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    exclusions: rows.map(r => ({
      id: r.id,
      agentProfileId: r.agentProfileId,
      agentCode: r.agentProfile.agentCode,
      name: `${(r.agentProfile.preferredName?.trim() || r.agentProfile.firstName)} ${r.agentProfile.lastName}`.trim(),
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { agentProfileId?: string; reason?: string }
  if (!body.agentProfileId) {
    return NextResponse.json({ error: 'agentProfileId required' }, { status: 400 })
  }

  const actor = (session!.user as { name?: string; email?: string }).name
    ?? (session!.user as { email?: string }).email
    ?? 'admin'

  const row = await db.trainingAttendanceExclusion.upsert({
    where: { agentProfileId: body.agentProfileId },
    update: { reason: body.reason?.trim() || null },
    create: {
      agentProfileId: body.agentProfileId,
      reason: body.reason?.trim() || null,
      createdBy: actor,
    },
  })
  return NextResponse.json({ ok: true, id: row.id })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const agentProfileId = new URL(req.url).searchParams.get('agentProfileId')
  if (!agentProfileId) {
    return NextResponse.json({ error: 'agentProfileId required' }, { status: 400 })
  }
  await db.trainingAttendanceExclusion.deleteMany({ where: { agentProfileId } })
  return NextResponse.json({ ok: true })
}
