import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendChannelMessage } from '@/lib/discord'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/preview-announcement
//
// Posts a real "starting now" announcement for the next upcoming training
// event to the training-and-events channel. Uses the same embed format as
// the T-15 reminder cron so admins can see exactly how reminders will look
// in production.
//
// Does NOT set reminderSentAt — the real T-15 reminder still fires on
// schedule. Treat this as a manual preview, not a substitute for the cron.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  const channelId = process.env.DISCORD_TRAINING_CHANNEL_ID ?? '1295044213590982725'

  // Find the next upcoming training event (or the one closest to now)
  const now = new Date()
  const ev = await db.trainingEvent.findFirst({
    where: { startsAt: { gte: new Date(now.getTime() - 30 * 60_000) } },
    orderBy: { startsAt: 'asc' },
  })
  if (!ev) {
    return NextResponse.json({ error: 'No upcoming training events found' }, { status: 404 })
  }

  const presenters = Array.isArray(ev.presenters) ? (ev.presenters as { name: string; role: string }[]) : []
  const joinUrl = ev.streamId ? `https://zoom.us/j/${ev.streamId.replace(/[\s-]/g, '')}` : null

  const fields: { name: string; value: string; inline?: boolean }[] = []
  fields.push({
    name: 'When',
    value: `<t:${Math.floor(ev.startsAt.getTime() / 1000)}:F>`,
    inline: true,
  })
  fields.push({ name: 'Duration', value: `${ev.durationMinutes ?? 60} min`, inline: true })

  if (ev.streamRoomName || ev.streamId) {
    const streamParts: string[] = []
    if (ev.streamRoomName) streamParts.push(ev.streamRoomName)
    if (ev.streamId) streamParts.push(`**ID:** \`${ev.streamId}\``)
    if (ev.passcode) streamParts.push(`**Passcode:** \`${ev.passcode}\``)
    if (joinUrl) streamParts.push(`[**Join now →**](${joinUrl})`)
    fields.push({
      name: ev.streamType === 'ZOOM' ? 'Zoom' : 'GFI Live · Impact TV',
      value: streamParts.join('\n'),
      inline: false,
    })
  }

  if (presenters.length > 0) {
    fields.push({
      name: 'Presenters',
      value: presenters.map(p => `**${p.name}** — ${p.role}`).join('\n'),
      inline: false,
    })
  }

  const tagBits: string[] = []
  if (ev.partnerBrand) tagBits.push(`🤝 ${ev.partnerBrand}`)
  if (ev.targetRegion) tagBits.push(`🌍 ${ev.targetRegion}`)
  if (ev.audienceRestriction) tagBits.push(`🔒 ${ev.audienceRestriction}`)
  if (tagBits.length > 0) {
    fields.push({ name: 'Tags', value: tagBits.join(' · '), inline: false })
  }

  const description = [
    '**🔴 Live now — session is starting**',
    ev.subtitle,
    ev.category && `_${ev.category}_`,
  ].filter(Boolean).join('\n')

  const isRestricted = !!ev.audienceRestriction

  await sendChannelMessage(channelId, {
    content: isRestricted ? `📢 ${ev.audienceRestriction} — session is live now!` : '@everyone',
    embeds: [{
      title: `🎯 ${ev.title}`,
      description,
      color: 0xC9A96E,
      fields,
      image: ev.driveThumbnailUrl ? { url: ev.driveThumbnailUrl } : undefined,
      footer: { text: 'AFF Concierge · auto-posted from /vault/trainings' },
      timestamp: ev.startsAt.toISOString(),
    }],
    allowedMentions: { parse: isRestricted ? [] : ['everyone'] },
  })

  return NextResponse.json({
    posted: true,
    channelId,
    event: {
      id: ev.id,
      title: ev.title,
      startsAt: ev.startsAt,
    },
  })
}
