import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET    /api/admin/attendance/dismissals      list permanently-dismissed guests
// DELETE /api/admin/attendance/dismissals?id=  un-dismiss (they can surface again)
//
// Dismissals are created from the orphan queue (DELETE on
// /api/admin/attendance/orphans). Removing one here lets that guest
// reappear as an orphan on the next sync so they can be matched
// manually if they turn out to be an agent after all.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const dismissals = await db.attendanceDismissal.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({
    dismissals: dismissals.map(d => ({
      id: d.id,
      displayName: d.displayName,
      email: d.email,
      createdAt: d.createdAt.toISOString(),
    })),
  })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.attendanceDismissal.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
