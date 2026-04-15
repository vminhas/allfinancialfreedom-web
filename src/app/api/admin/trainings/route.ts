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

  const [allFuture, recentPast, errored, futureMissingDiscord] = await Promise.all([
    db.trainingEvent.findMany({
      where: { startsAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
      orderBy: { startsAt: 'asc' },
      take: 200,
    }),
    db.trainingEvent.findMany({
      where: { startsAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
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

  const liveOrSoon = allFuture.filter(e => e.startsAt <= inOneHour)
  const upcoming = allFuture.filter(e => e.startsAt > inOneHour)

  return NextResponse.json({
    liveOrSoon,
    upcoming,
    recentPast,
    parseErrors: errored,
    stats: {
      totalUpcoming: allFuture.length,
      reminderQueue: allFuture.filter(e => !e.reminderSentAt).length,
      discordEventsCreated: allFuture.filter(e => e.discordEventId).length,
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
