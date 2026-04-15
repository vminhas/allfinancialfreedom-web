import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { postWeeklyRoundupForRows } from '@/lib/training-sync'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/post-roundup
//
// Pulls every training event that is either currently in progress
// (startsAt + duration > now) or starts in the next 7 days, and posts
// a fresh @everyone roundup announcement to the training-and-events
// channel. Unlike the sync's automatic roundup (which only covers
// newly created Discord events), this one covers the full week so
// admins can push a corrected view anytime.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID) {
    return NextResponse.json(
      { error: 'DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not configured' },
      { status: 500 }
    )
  }

  const now = new Date()
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Include events that are currently in progress (started but not ended)
  // by looking back 3 hours — Drive flyers are typically 60 min but we
  // give headroom for longer sessions.
  const lookbackStart = new Date(now.getTime() - 3 * 60 * 60 * 1000)

  const rawRows = await db.trainingEvent.findMany({
    where: {
      startsAt: { gte: lookbackStart, lte: sevenDaysOut },
      discordEventId: { not: null },  // only events that exist in Discord
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      discordEventId: true,
      audienceRestriction: true,
    },
  })

  // Filter to: (a) currently live (startsAt <= now < startsAt + duration)
  // OR (b) in the future (startsAt > now). Excludes already-ended sessions.
  const rows = rawRows.filter(r => {
    const ends = r.startsAt.getTime() + (r.durationMinutes ?? 60) * 60_000
    return ends > now.getTime()
  })

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No current or upcoming training events in the next 7 days' },
      { status: 404 }
    )
  }

  try {
    const result = await postWeeklyRoundupForRows(rows)
    return NextResponse.json({
      posted: result.posted,
      eventCount: result.eventCount,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
