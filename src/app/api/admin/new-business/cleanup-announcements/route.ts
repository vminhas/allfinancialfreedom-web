import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/new-business/cleanup-announcements
// Deletes the "Application Submitted" teaser posts from the announcements
// channel that were fired in the last N hours (default 6). Runs in prod
// where DISCORD_BOT_TOKEN + the channel id actually exist. Admin only.
// ?dryRun=1 returns the count without deleting. ?hours=N (1-72).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const token = process.env.DISCORD_BOT_TOKEN
  const channel = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID
  if (!token || !channel) {
    return NextResponse.json({ error: 'Discord bot token / announcements channel not configured' }, { status: 503 })
  }

  const url = new URL(req.url)
  const hours = Math.min(Math.max(parseInt(url.searchParams.get('hours') ?? '6', 10) || 6, 1), 72)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const cutoff = Date.now() - hours * 3_600_000

  const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages?limit=100`, {
    headers: { Authorization: `Bot ${token}` },
  })
  if (!res.ok) {
    return NextResponse.json({ error: `Discord fetch failed (${res.status})` }, { status: 502 })
  }
  const msgs = await res.json() as Array<{
    id: string
    timestamp: string
    embeds?: { footer?: { text?: string } }[]
  }>

  // Only the "Application Submitted" teasers, only within the window.
  const targets = msgs
    .filter(m => new Date(m.timestamp).getTime() >= cutoff)
    .filter(m => (m.embeds ?? []).some(e => (e.footer?.text ?? '').includes('Application Submitted')))
    .map(m => m.id)

  if (dryRun) return NextResponse.json({ found: targets.length, deleted: 0, dryRun: true, hours })
  if (targets.length === 0) return NextResponse.json({ found: 0, deleted: 0, hours })

  let deleted = 0
  if (targets.length >= 2) {
    // Bulk delete (2-100 messages, each < 14 days old).
    const del = await fetch(`https://discord.com/api/v10/channels/${channel}/messages/bulk-delete`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: targets.slice(0, 100) }),
    })
    if (del.ok) deleted = Math.min(targets.length, 100)
    else return NextResponse.json({ error: `Bulk delete failed (${del.status})`, found: targets.length, deleted: 0 }, { status: 502 })
  } else {
    const del = await fetch(`https://discord.com/api/v10/channels/${channel}/messages/${targets[0]}`, {
      method: 'DELETE',
      headers: { Authorization: `Bot ${token}` },
    })
    if (del.ok) deleted = 1
  }

  return NextResponse.json({ found: targets.length, deleted, hours })
}
