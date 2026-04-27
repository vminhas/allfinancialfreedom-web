import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { deleteGuildScheduledEvent } from '@/lib/discord'

const API = 'https://discord.com/api/v10'

// POST /api/admin/trainings/purge-orphan-events
//
// Fetches ALL scheduled events from the Discord guild, compares against
// DB rows' discordEventIds, and deletes any Discord events that don't
// have a matching row. Fixes the "18 events in Discord but only 9 in
// the dashboard" problem caused by earlier sync runs that orphaned
// events when rows were deleted without cleaning up Discord.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const token = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID
  if (!token || !guildId) {
    return NextResponse.json({ error: 'Discord not configured' }, { status: 500 })
  }

  // 1. Fetch all scheduled events from Discord
  const res = await fetch(`${API}/guilds/${guildId}/scheduled-events`, {
    headers: { Authorization: `Bot ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Discord fetch failed: ${text.slice(0, 300)}` }, { status: 500 })
  }
  const discordEvents = await res.json() as { id: string; name: string; status: number }[]

  // 2. Fetch all known discordEventIds from our DB
  const dbRows = await db.trainingEvent.findMany({
    where: { discordEventId: { not: null } },
    select: { discordEventId: true },
  })
  const knownIds = new Set(dbRows.map(r => r.discordEventId!))

  // 3. Find orphans — Discord events that have no matching DB row
  const orphans = discordEvents.filter(e => !knownIds.has(e.id))

  // 4. Delete orphans (with spacing to avoid rate limits)
  let deleted = 0
  const errors: string[] = []
  for (const orphan of orphans) {
    try {
      await deleteGuildScheduledEvent(orphan.id)
      deleted += 1
      await new Promise(r => setTimeout(r, 1500))
    } catch (err) {
      errors.push(`${orphan.name} (${orphan.id}): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    totalInDiscord: discordEvents.length,
    knownInDb: knownIds.size,
    orphansFound: orphans.length,
    orphansDeleted: deleted,
    errors,
    remaining: discordEvents.length - deleted,
  })
}
