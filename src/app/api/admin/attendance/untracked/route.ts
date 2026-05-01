import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/attendance/untracked
//
// Lists every ZOOM-streamed event currently flipped to
// trackAttendance=false, so the attendance page can show a
// re-enable list. Limited to the past 6 months because anything
// older is unlikely to be re-tracked and bloats the modal.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const cutoff = new Date(Date.now() - 180 * 86_400_000)

  const events = await db.trainingEvent.findMany({
    where: {
      streamType: 'ZOOM',
      streamId: { not: null },
      trackAttendance: false,
      startsAt: { gte: cutoff },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      flyerImageUrl: true,
      presenters: true,
    },
    orderBy: { startsAt: 'desc' },
  })

  return NextResponse.json({
    events: events.map(ev => ({
      id: ev.id,
      title: ev.title,
      startsAt: ev.startsAt.toISOString(),
      flyerImageUrl: ev.flyerImageUrl,
      presenters: Array.isArray(ev.presenters) ? ev.presenters : null,
    })),
  })
}
