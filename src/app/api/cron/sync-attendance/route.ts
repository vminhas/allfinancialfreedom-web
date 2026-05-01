import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncTrainingAttendance } from '@/lib/attendance-sync'
import { ZoomApiError, ZoomConfigError } from '@/lib/zoom'

// GET /api/cron/sync-attendance
//
// Runs hourly (vercel.json). For each ZOOM training that:
//   - has ended in the last 14 days,
//   - hasn't been synced yet OR was last synced > 1h ago and is < 24h
//     past start (window for late stragglers),
// pull the participant report and update attendance rows.
//
// We cap concurrency and per-event work because a fresh deployment
// (or a config flip) could otherwise try to backfill the entire month
// in one cron tick. The grid's "Sync now" button is the right
// affordance for ad-hoc backfills.

const LOOKBACK_DAYS = 14
const LATE_STRAGGLER_WINDOW_HOURS = 24
const RESYNC_WHEN_OLDER_THAN_MS = 60 * 60_000  // 1 hour
const MAX_EVENTS_PER_TICK = 30

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const lookbackStart = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000)

  // Candidates: ended in the lookback window, were Zoom-streamed.
  // We pull a generous set and then filter in-memory by syncedAt
  // recency since Prisma's OR + nullable comparator gets ugly.
  const candidates = await db.trainingEvent.findMany({
    where: {
      streamType: 'ZOOM',
      streamId: { not: null },
      startsAt: { gte: lookbackStart, lte: now },
      // Skip events the admin opted out of attendance tracking.
      trackAttendance: true,
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      streamId: true,
      streamType: true,
      attendanceSyncedAt: true,
    },
    orderBy: { startsAt: 'desc' },
  })

  const due = candidates.filter(ev => {
    if (!ev.attendanceSyncedAt) return true
    const ageSinceSync = now.getTime() - ev.attendanceSyncedAt.getTime()
    const ageSinceStart = now.getTime() - ev.startsAt.getTime()
    // Re-sync if it's still within the late-straggler window (24h
    // post-start) AND more than an hour has passed since the last try.
    return ageSinceStart < LATE_STRAGGLER_WINDOW_HOURS * 3_600_000
      && ageSinceSync > RESYNC_WHEN_OLDER_THAN_MS
  }).slice(0, MAX_EVENTS_PER_TICK)

  if (due.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, skipped: candidates.length, message: 'Nothing due' })
  }

  let synced = 0
  let configErrors = 0
  let notReady = 0
  let otherErrors = 0
  const errors: { id: string; title: string; error: string }[] = []

  for (const ev of due) {
    try {
      await syncTrainingAttendance(ev)
      synced++
    } catch (err) {
      if (err instanceof ZoomConfigError) {
        // Whole-account config issue; bail early -- no point hammering
        // Zoom's OAuth endpoint with the same broken creds.
        configErrors++
        errors.push({ id: ev.id, title: ev.title, error: err.message })
        break
      }
      if (err instanceof ZoomApiError && err.status === 404) {
        // Participant report not finalized yet; we'll catch it on the
        // next tick.
        notReady++
        continue
      }
      otherErrors++
      errors.push({
        id: ev.id,
        title: ev.title,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    ok: configErrors === 0,
    synced,
    notReady,
    otherErrors,
    configErrors,
    errors: errors.slice(0, 5),
  })
}
