import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { sendChannelMessage } from '@/lib/discord'

// POST /api/admin/attendance/[id]/publish-discord
//
// Posts a compact attendance summary embed to the admin activity
// channel. The summary lists who attended, who missed, who was
// excused, and the overall %. Used as a one-click way to recap each
// training in Discord without copying numbers by hand from the grid.

const MAX_NAMES_INLINE = 25  // truncate long lists with "and N more"

function joinNames(names: string[]): string {
  if (names.length === 0) return '—'
  if (names.length <= MAX_NAMES_INLINE) return names.join(', ')
  const head = names.slice(0, MAX_NAMES_INLINE).join(', ')
  return `${head}, and ${names.length - MAX_NAMES_INLINE} more`
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const channelId = process.env.DISCORD_ADMIN_CHANNEL_ID
  if (!channelId) {
    return NextResponse.json({ error: 'DISCORD_ADMIN_CHANNEL_ID not configured' }, { status: 500 })
  }

  const { id } = await ctx.params
  const event = await db.trainingEvent.findUnique({
    where: { id },
    select: {
      id: true, title: true, subtitle: true, startsAt: true, presenters: true,
      flyerImageUrl: true, attendanceSyncedAt: true, durationMinutes: true,
    },
  })
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!event.attendanceSyncedAt) {
    return NextResponse.json({
      error: "This event hasn't been synced yet. Pull the participant report from Zoom first.",
    }, { status: 400 })
  }

  // Pull the dense attendance + agent rows for this event.
  const rows = await db.trainingAttendance.findMany({
    where: { trainingEventId: event.id },
    include: {
      agentProfile: {
        select: { firstName: true, lastName: true, status: true, icaDate: true },
      },
    },
  })

  // Effective status applies the manual override; anything non-active
  // or pre-icaDate is excluded from the present/absent tally so the
  // % matches what the grid shows.
  const presentNames: string[] = []
  const absentNames: string[] = []
  const excusedNames: string[] = []
  for (const r of rows) {
    if (r.agentProfile.status !== 'ACTIVE') continue
    if (r.agentProfile.icaDate && r.agentProfile.icaDate > event.startsAt) continue
    const status = r.manualStatus ?? r.status
    const name = `${r.agentProfile.firstName} ${r.agentProfile.lastName}`
    if (status === 'PRESENT') presentNames.push(name)
    else if (status === 'EXCUSED') excusedNames.push(name)
    else if (status === 'ABSENT') absentNames.push(name)
  }
  presentNames.sort()
  absentNames.sort()
  excusedNames.sort()

  const counted = presentNames.length + absentNames.length + excusedNames.length
  const attendedCounted = presentNames.length + excusedNames.length  // excused still counts as attended
  const pct = counted > 0 ? Math.round((attendedCounted / counted) * 100) : null

  const presenterStr = Array.isArray(event.presenters) && event.presenters.length > 0
    ? (event.presenters as { name: string; role: string }[]).map(p => p.name).join(' · ')
    : null

  const dateStr = event.startsAt.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York',
  })

  const fields: { name: string; value: string; inline?: boolean }[] = []
  if (presentNames.length > 0) {
    fields.push({ name: `✅ Present (${presentNames.length})`, value: joinNames(presentNames) })
  }
  if (excusedNames.length > 0) {
    fields.push({ name: `🟣 Excused (${excusedNames.length})`, value: joinNames(excusedNames) })
  }
  if (absentNames.length > 0) {
    fields.push({ name: `❌ Missing (${absentNames.length})`, value: joinNames(absentNames) })
  }

  const titleLine = event.subtitle ? `${event.title} · ${event.subtitle}` : event.title

  const embed: {
    title: string
    description?: string
    color: number
    fields: { name: string; value: string; inline?: boolean }[]
    thumbnail?: { url: string }
    footer?: { text: string }
    timestamp?: string
  } = {
    title: `📊 ${titleLine}`.slice(0, 256),
    description: [
      `**${dateStr}**`,
      pct != null ? `${attendedCounted}/${counted} attended (${pct}%)` : 'No tally yet',
      presenterStr ? `_Presented by ${presenterStr}_` : null,
    ].filter(Boolean).join(' · '),
    color: pct == null ? 0x6B8299 : pct >= 80 ? 0x4ADE80 : pct >= 50 ? 0xFBBF24 : 0xEF4444,
    fields,
    footer: { text: 'AFF Concierge · Attendance recap' },
    timestamp: new Date().toISOString(),
  }
  if (event.flyerImageUrl) {
    embed.thumbnail = { url: event.flyerImageUrl }
  }

  try {
    const msg = await sendChannelMessage(channelId, { embeds: [embed] })
    return NextResponse.json({
      ok: true,
      messageId: msg.id,
      counts: {
        present: presentNames.length,
        absent: absentNames.length,
        excused: excusedNames.length,
        pct,
      },
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Discord post failed',
    }, { status: 500 })
  }
}
