import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  createGuildScheduledEvent,
  deleteGuildScheduledEvent,
  sendChannelMessage,
  getBotIdentity,
  listBotGuilds,
} from '@/lib/discord'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/test-discord
//
// Comprehensive smoke test for the Discord integration. Runs all of these
// in order and surfaces every failure with detail:
//
//   1. Env vars present?
//   2. Bot token valid? (calls /users/@me)
//   3. List all guilds the bot is in
//   4. Configured DISCORD_GUILD_ID matches one of those guilds?
//   5. Create a real scheduled event in that guild + delete it immediately
//   6. Post a tiny test message to the configured channel
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const checks: { step: string; ok: boolean; detail?: string }[] = []
  let botName: string | null = null
  let visibleGuilds: { id: string; name: string }[] = []
  const configuredGuildId = process.env.DISCORD_GUILD_ID ?? null

  // 1. Env vars
  const tokenSet = !!process.env.DISCORD_BOT_TOKEN
  const guildSet = !!configuredGuildId
  checks.push({ step: 'DISCORD_BOT_TOKEN env', ok: tokenSet })
  checks.push({ step: 'DISCORD_GUILD_ID env', ok: guildSet, detail: configuredGuildId ?? 'not set' })
  if (!tokenSet) {
    return NextResponse.json({ checks, summary: 'DISCORD_BOT_TOKEN not set in Vercel env' }, { status: 500 })
  }

  // 2. Bot identity
  try {
    const me = await getBotIdentity()
    botName = me.username
    checks.push({ step: 'Bot token valid', ok: true, detail: `Logged in as @${me.username} (id ${me.id})` })
  } catch (err) {
    checks.push({
      step: 'Bot token valid',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ checks, summary: 'Bot token rejected by Discord' }, { status: 500 })
  }

  // 3. Guild list
  try {
    visibleGuilds = await listBotGuilds()
    checks.push({
      step: `Bot is in ${visibleGuilds.length} guild${visibleGuilds.length === 1 ? '' : 's'}`,
      ok: visibleGuilds.length > 0,
      detail: visibleGuilds.map(g => `${g.name} (${g.id})`).join(' · ') || '— bot not in any guilds',
    })
  } catch (err) {
    checks.push({
      step: 'List bot guilds',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ checks, summary: 'Could not list bot guilds' }, { status: 500 })
  }

  // 4. Match configured guild ID
  const matchingGuild = visibleGuilds.find(g => g.id === configuredGuildId)
  if (!matchingGuild) {
    checks.push({
      step: 'DISCORD_GUILD_ID matches an accessible guild',
      ok: false,
      detail: `Configured value '${configuredGuildId}' does NOT match any guild the bot is in. Use one of the IDs above.`,
    })
    return NextResponse.json({
      checks,
      visibleGuilds,
      botName,
      summary: 'DISCORD_GUILD_ID is wrong — see visibleGuilds and update the env var',
    }, { status: 500 })
  }
  checks.push({
    step: 'DISCORD_GUILD_ID matches an accessible guild',
    ok: true,
    detail: `Matches '${matchingGuild.name}' ✓`,
  })

  // 5. Create + delete a scheduled event
  const startsAt = new Date(Date.now() + 60 * 60_000)
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000)
  let createdEventId: string | null = null
  try {
    const ev = await createGuildScheduledEvent({
      name: 'AFF Concierge connectivity test',
      description: 'Temporary test event from /vault/trainings — will self-delete.',
      scheduledStartTime: startsAt.toISOString(),
      scheduledEndTime: endsAt.toISOString(),
      location: 'https://allfinancialfreedom.com',
    })
    createdEventId = ev.id
    checks.push({ step: 'Create scheduled event', ok: true, detail: `event id ${ev.id}` })
  } catch (err) {
    checks.push({
      step: 'Create scheduled event',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  if (createdEventId) {
    try {
      await deleteGuildScheduledEvent(createdEventId)
      checks.push({ step: 'Delete scheduled event', ok: true })
    } catch (err) {
      checks.push({
        step: 'Delete scheduled event',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 6. Channel post
  const channelId = process.env.DISCORD_TRAINING_CHANNEL_ID ?? '1295044213590982725'
  try {
    await sendChannelMessage(channelId, {
      content: '🛠 AFF Concierge connectivity test from `/vault/trainings` — please ignore.',
      allowedMentions: { parse: [] },
    })
    checks.push({ step: `Post message to channel ${channelId}`, ok: true })
  } catch (err) {
    checks.push({
      step: `Post message to channel ${channelId}`,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  const allOk = checks.every(c => c.ok)
  return NextResponse.json({
    checks,
    visibleGuilds,
    botName,
    summary: allOk
      ? 'All Discord checks passed. The bot can create events and post messages.'
      : 'One or more Discord checks failed — see details above.',
  }, { status: allOk ? 200 : 500 })
}
