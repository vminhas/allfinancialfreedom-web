import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { postDailyMotivation } from '@/lib/motivation'

// POST /api/admin/motivation/send-now
//
// Manual send from the vault. Deliberately bypasses the enabled toggle,
// the weekend skip, and the once-per-day guard (the admin is explicitly
// asking for it). postDailyMotivation records today's date, so the
// scheduled cron later the same day will skip and not double-post.

export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  try {
    const { text } = await postDailyMotivation()
    return NextResponse.json({ ok: true, text })
  } catch (err) {
    console.error('[motivation send-now] failed:', err)
    const message = err instanceof Error ? err.message : 'send failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
