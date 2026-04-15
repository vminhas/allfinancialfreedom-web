import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createGuildScheduledEvent, deleteGuildScheduledEvent, sendChannelMessage } from '@/lib/discord'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/test-discord
//
// Smoke test: creates a real Discord scheduled event in the configured guild
// 1 hour in the future, deletes it immediately, and posts a quick test
// message to the configured channel. Surfaces exact errors so we can debug.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const checks: { step: string; ok: boolean; detail?: string }[] = []

  // 1. Env vars present?
  const tokenSet = !!process.env.DISCORD_BOT_TOKEN
  const guildSet = !!process.env.DISCORD_GUILD_ID
  checks.push({ step: 'DISCORD_BOT_TOKEN env', ok: tokenSet })
  checks.push({ step: 'DISCORD_GUILD_ID env', ok: guildSet })
  if (!tokenSet || !guildSet) {
    return NextResponse.json({ checks, summary: 'Missing required env vars' }, { status: 500 })
  }

  // 2. Try to create a scheduled event
  const startsAt = new Date(Date.now() + 60 * 60_000) // 1 hour from now
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000)
  let createdEventId: string | null = null

  try {
    const ev = await createGuildScheduledEvent({
      name: 'AFF Concierge connectivity test',
      description: 'This is a temporary test event created by /vault/trainings to verify the bot can post scheduled events. Will self-delete in a moment.',
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
    return NextResponse.json({ checks, summary: 'Discord scheduled-event creation failed' }, { status: 500 })
  }

  // 3. Delete the test event
  try {
    if (createdEventId) {
      await deleteGuildScheduledEvent(createdEventId)
      checks.push({ step: 'Delete scheduled event', ok: true })
    }
  } catch (err) {
    checks.push({
      step: 'Delete scheduled event',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 4. Send a test channel message
  const channelId = process.env.DISCORD_TRAINING_CHANNEL_ID ?? '1295044213590982725'
  try {
    await sendChannelMessage(channelId, {
      content: '🛠 AFF Concierge connectivity test from `/vault/trainings` — please ignore. This confirms the bot can post in this channel.',
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
    summary: allOk
      ? 'All Discord checks passed. The bot can create events and post messages.'
      : 'One or more Discord checks failed — see details above.',
  }, { status: allOk ? 200 : 500 })
}
