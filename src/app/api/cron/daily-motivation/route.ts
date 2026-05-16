import { NextRequest, NextResponse } from 'next/server'
import {
  postDailyMotivation,
  isMotivationEnabled,
  getLastPostedDate,
  todayUtcDate,
} from '@/lib/motivation'

// GET /api/cron/daily-motivation
//
// Posts one short motivational line to the team channel, Monday through
// Friday. Scheduled in vercel.json at 13:00 UTC Mon-Fri (~8am ET). Auth
// is the standard Vercel cron Bearer secret.
//
// Policy lives here; the actual post + line selection live in
// @/lib/motivation (shared with the vault "Send now" button):
//   - off when the vault toggle is set to disabled
//   - weekends skipped (defensive; the schedule already restricts to M-F)
//   - once per calendar day, even across retries / double fires, and also
//     skipped if "Send now" already posted today
// Pass ?force=1 (still authed) to bypass all three for a one-off test.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const force = new URL(req.url).searchParams.get('force') === '1'

  if (!force) {
    if (!(await isMotivationEnabled())) {
      return NextResponse.json({ ok: true, skipped: 'disabled' })
    }
    const dow = now.getUTCDay() // 0 = Sunday, 6 = Saturday
    if (dow === 0 || dow === 6) {
      return NextResponse.json({ ok: true, skipped: 'weekend' })
    }
    if ((await getLastPostedDate()) === todayUtcDate(now)) {
      return NextResponse.json({ ok: true, skipped: 'already_posted_today' })
    }
  }

  try {
    const { text } = await postDailyMotivation(now)
    return NextResponse.json({ ok: true, posted: true, text })
  } catch (err) {
    console.error('[daily-motivation] post failed:', err)
    return NextResponse.json({ error: 'post failed' }, { status: 502 })
  }
}
