import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { syncTrainingAttendance } from '@/lib/attendance-sync'
import { ZoomApiError, ZoomConfigError } from '@/lib/zoom'

// POST /api/admin/trainings/[id]/sync-attendance
//
// Pulls the Zoom participant report for a single training and writes
// attendance rows. Used by the "Sync attendance" button on /vault/trainings
// for one-off / on-demand pulls; the hourly cron is the same code path.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const event = await db.trainingEvent.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      streamId: true,
      streamType: true,
    },
  })
  if (!event) return NextResponse.json({ error: 'Training event not found' }, { status: 404 })
  if (event.streamType !== 'ZOOM') {
    return NextResponse.json({
      error: `Attendance sync only works for Zoom-streamed trainings (this is ${event.streamType}).`,
    }, { status: 400 })
  }
  if (!event.streamId) {
    return NextResponse.json({ error: 'Event has no Zoom meeting ID' }, { status: 400 })
  }
  if (event.startsAt > new Date()) {
    return NextResponse.json({ error: "This event hasn't happened yet" }, { status: 400 })
  }

  try {
    const result = await syncTrainingAttendance(event)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    if (err instanceof ZoomConfigError) {
      return NextResponse.json({ error: err.message, kind: 'config' }, { status: 400 })
    }
    if (err instanceof ZoomApiError) {
      // 404 from Zoom typically means the participant report isn't
      // ready yet (a few minutes after the meeting ends), so signal
      // that distinctly so the UI can offer "try again in a bit."
      return NextResponse.json({
        error: err.message,
        kind: err.status === 404 ? 'not_ready' : 'api',
      }, { status: err.status === 404 ? 409 : 502 })
    }
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Sync failed',
      kind: 'unknown',
    }, { status: 500 })
  }
}
