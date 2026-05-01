import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/attendance/bulk-untrack
// body: { from?: string; to?: string; scope?: 'range' | 'all' }
//
// Flips trackAttendance=false on every TrainingEvent the admin
// currently sees on the grid. Used as the "wipe and start over"
// affordance: after this runs the attendance grid is empty, and the
// admin opts back in just the events they actually want tracked
// (typically Vick's Mon/Thu trainings) via the per-event toggle on
// /vault/trainings or the 'N untracked' re-enable panel.
//
// Defaults to the date range when from/to are passed; scope=all
// untracks every event in the DB. Returns the count of rows updated.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as {
    from?: string
    to?: string
    scope?: 'range' | 'all'
  }

  const where: Record<string, unknown> = { trackAttendance: true }
  if (body.scope !== 'all' && body.from && body.to) {
    const from = new Date(body.from)
    const to = new Date(`${body.to}T23:59:59.999Z`)
    if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
      where.startsAt = { gte: from, lte: to }
    }
  }

  const result = await db.trainingEvent.updateMany({
    where,
    data: { trackAttendance: false },
  })

  return NextResponse.json({ ok: true, updated: result.count })
}
