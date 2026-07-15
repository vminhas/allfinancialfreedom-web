import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/attendance/bulk-untrack
// body: { eventIds?: string[]; from?: string; to?: string; scope?: 'range' | 'all' }
//
// Flips trackAttendance=false on TrainingEvents. Three modes, in priority order:
//   - eventIds: untrack exactly those events (the multiselect "stop tracking
//     these" action on the attendance grid). This is the targeted path.
//   - range (default when from/to given): untrack every tracked event in the
//     date range ("wipe the slate for this range").
//   - scope=all: untrack every tracked event in the DB.
// After this runs, the untracked events drop off the grid; re-enable them from
// the per-event toggle on /vault/trainings or the 'N untracked' panel.
// Returns the count of rows updated.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as {
    eventIds?: unknown
    from?: string
    to?: string
    scope?: 'range' | 'all'
  }

  const where: Record<string, unknown> = { trackAttendance: true }

  // Targeted multiselect: untrack exactly the events the admin picked.
  const eventIds = Array.isArray(body.eventIds)
    ? body.eventIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (eventIds.length > 0) {
    where.id = { in: eventIds }
  } else if (body.scope !== 'all' && body.from && body.to) {
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
