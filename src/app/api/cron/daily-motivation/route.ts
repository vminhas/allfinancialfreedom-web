import { NextRequest, NextResponse } from 'next/server'
import { sendChannelMessage } from '@/lib/discord'
import { getSetting, setSetting } from '@/lib/settings'
import { pickDailyMotivation } from '@/lib/motivation-quotes'

// GET /api/cron/daily-motivation
//
// Posts one short motivational line to the team channel, Monday through
// Friday. Scheduled in vercel.json at 13:00 UTC Mon-Fri (~8am ET). Auth
// is the standard Vercel cron Bearer secret.
//
// The quote is deterministic by date (see pickDailyMotivation), so a
// cron retry posts the same line, not a new one. A second guard records
// the last posted date in settings and skips if we already posted today,
// so a manual hit or a double fire cannot spam the channel. Pass
// ?force=1 (still authed) to bypass that guard for a one-off test post.

const ANNOUNCEMENTS_CHANNEL =
  process.env.DISCORD_MOTIVATION_CHANNEL_ID ??
  process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID ??
  '1295044213590982724'

const LAST_POSTED_KEY = 'MOTIVATION_LAST_POSTED_DATE'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const force = new URL(req.url).searchParams.get('force') === '1'

  // Weekends off. The schedule already restricts to Mon-Fri, but a
  // manual call or a schedule edit should never surprise the team with
  // a Saturday post. 0 = Sunday, 6 = Saturday.
  const dow = now.getUTCDay()
  if (!force && (dow === 0 || dow === 6)) {
    return NextResponse.json({ ok: true, skipped: 'weekend' })
  }

  // Once per calendar day, even across retries / double fires.
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD
  if (!force) {
    const last = await getSetting(LAST_POSTED_KEY)
    if (last === today) {
      return NextResponse.json({ ok: true, skipped: 'already_posted_today' })
    }
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  const { text, index } = pickDailyMotivation(now)

  try {
    await sendChannelMessage(ANNOUNCEMENTS_CHANNEL, {
      embeds: [{
        title: '✦  D A I L Y   M O T I V A T I O N  ✦',
        description: `> ${text}`,
        color: 0xc9a84c,
        footer: { text: 'All Financial Freedom · Make today count' },
        timestamp: now.toISOString(),
      }],
      // Explicitly no pings. This is a daily nudge, not an announcement.
      allowedMentions: { parse: [] },
    })
  } catch (err) {
    console.error('[daily-motivation] Discord post failed:', err)
    return NextResponse.json({ error: 'Discord post failed' }, { status: 502 })
  }

  await setSetting(LAST_POSTED_KEY, today)
  return NextResponse.json({ ok: true, posted: true, index })
}
