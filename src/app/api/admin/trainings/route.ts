import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/trainings
// Returns parsed training events grouped relative to "now":
//   - liveOrSoon: starting within 60 minutes (or in progress)
//   - upcoming: future events ordered ascending
//   - past: completed events, descending (last 30)
//   - parseErrors: rows with parseError set, for surfacing problems
//   - configStatus: which integrations are wired up (so missing env vars surface in the UI)
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const now = new Date()
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000)
  // Look back up to 3 hours so we catch events that started but haven't
  // ended yet (in case a flyer says a 60-min training). Anything older than
  // that lands in Recent Past even if the duration hasn't technically elapsed.
  const lookbackStart = new Date(now.getTime() - 3 * 60 * 60 * 1000)

  const [recentAndFuture, earlierPast, errored, futureMissingDiscord] = await Promise.all([
    db.trainingEvent.findMany({
      where: { startsAt: { gte: lookbackStart } },
      orderBy: { startsAt: 'asc' },
      take: 200,
    }),
    db.trainingEvent.findMany({
      where: { startsAt: { lt: lookbackStart } },
      orderBy: { startsAt: 'desc' },
      take: 30,
    }),
    db.trainingEvent.findMany({
      where: { parseError: { not: null } },
      orderBy: { parsedAt: 'desc' },
      take: 20,
    }),
    // Future events that don't yet have a Discord scheduled event — useful for
    // spotting "Discord env wasn't configured during the sync" situations.
    db.trainingEvent.count({
      where: {
        startsAt: { gte: new Date() },
        discordEventId: null,
      },
    }),
  ])

  // Live Now  : started already AND still within its duration window
  // Starting Soon: hasn't started yet AND starts within 60 minutes
  // Upcoming   : more than 60 minutes out
  // Recent Past: ended (now > startsAt + duration), within the lookback window
  const liveNow: typeof recentAndFuture = []
  const startingSoon: typeof recentAndFuture = []
  const upcoming: typeof recentAndFuture = []
  const endedWithinLookback: typeof recentAndFuture = []

  for (const ev of recentAndFuture) {
    const starts = ev.startsAt.getTime()
    const ends = starts + (ev.durationMinutes ?? 60) * 60_000
    const nowMs = now.getTime()

    if (nowMs >= starts && nowMs < ends) {
      liveNow.push(ev)
    } else if (nowMs < starts && starts <= inOneHour.getTime()) {
      startingSoon.push(ev)
    } else if (nowMs < starts) {
      upcoming.push(ev)
    } else {
      endedWithinLookback.push(ev)
    }
  }

  // Merge already-ended events (within lookback) with older past events,
  // most recent first, capped at 30
  const recentPast = [...endedWithinLookback.reverse(), ...earlierPast].slice(0, 30)

  return NextResponse.json({
    liveNow,
    startingSoon,
    upcoming,
    recentPast,
    parseErrors: errored,
    stats: {
      totalUpcoming: liveNow.length + startingSoon.length + upcoming.length,
      reminderQueue: [...liveNow, ...startingSoon, ...upcoming].filter(e => !e.reminderSentAt).length,
      discordEventsCreated: [...liveNow, ...startingSoon, ...upcoming].filter(e => e.discordEventId).length,
      futureMissingDiscord,
      parseErrorCount: errored.length,
    },
    configStatus: {
      googleApiKey: !!process.env.GOOGLE_API_KEY,
      driveFolderId: !!process.env.GDRIVE_TRAINING_FOLDER_ID,
      anthropicConfigured: true, // stored encrypted in DB, not env — assume true if other things work
      discordBotToken: !!process.env.DISCORD_BOT_TOKEN,
      discordGuildId: !!process.env.DISCORD_GUILD_ID,
      discordChannelId: process.env.DISCORD_TRAINING_CHANNEL_ID || '1295044213590982725 (default)',
      cronSecret: !!process.env.CRON_SECRET,
    },
  })
}
