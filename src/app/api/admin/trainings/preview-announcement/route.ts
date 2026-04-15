import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendChannelMessage } from '@/lib/discord'
import { downloadPublicFile } from '@/lib/google-drive'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/preview-announcement
//
// Body: { eventId?: string }
//
// Posts a "live now / live soon" Discord announcement to the training
// channel for either a specific training event (if eventId provided) or
// the next upcoming one (if not). Downloads the flyer from Drive and
// attaches it inline so it renders in the embed.
//
// Does NOT set reminderSentAt — the real T-15 reminder cron still fires
// on schedule. Safe to call multiple times as a manual push.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  const channelId = process.env.DISCORD_TRAINING_CHANNEL_ID ?? '1295044213590982725'

  const body = (await req.json().catch(() => ({}))) as { eventId?: string }

  const ev = body.eventId
    ? await db.trainingEvent.findUnique({ where: { id: body.eventId } })
    : await db.trainingEvent.findFirst({
        where: { startsAt: { gte: new Date(Date.now() - 30 * 60_000) } },
        orderBy: { startsAt: 'asc' },
      })

  if (!ev) {
    return NextResponse.json(
      { error: body.eventId ? 'Training event not found' : 'No upcoming training events found' },
      { status: 404 }
    )
  }

  const presenters = Array.isArray(ev.presenters) ? (ev.presenters as { name: string; role: string }[]) : []
  const joinUrl = ev.streamId ? `https://zoom.us/j/${ev.streamId.replace(/[\s-]/g, '')}` : null

  const msUntil = ev.startsAt.getTime() - Date.now()
  const minutesAway = Math.round(msUntil / 60_000)

  // Wording branch: already past → "Starting now", in the future → "Starting in Nm"
  const startingCopy = msUntil <= 60_000
    ? '**🔴 Live now — session is starting**'
    : `**Starting in ${minutesAway} minutes**`

  const description = [
    startingCopy,
    ev.subtitle,
    ev.category && `_${ev.category}_`,
  ].filter(Boolean).join('\n')

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: 'When',
      value: `<t:${Math.floor(ev.startsAt.getTime() / 1000)}:F>`,
      inline: true,
    },
    { name: 'Duration', value: `${ev.durationMinutes ?? 60} min`, inline: true },
  ]

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

  const isRestricted = !!ev.audienceRestriction

  // Try to download the flyer image from Drive and attach it inline.
  // Fall back to a thumbnail URL or no image if download fails.
  let attachments: { filename: string; contentType: string; data: Buffer }[] | undefined
  let embedImageUrl: string | undefined

  try {
    const bytes = await downloadPublicFile(ev.driveFileId)
    const ext = ev.driveFileName.toLowerCase().endsWith('.jpg') || ev.driveFileName.toLowerCase().endsWith('.jpeg')
      ? 'jpg'
      : 'png'
    const contentType = ext === 'jpg' ? 'image/jpeg' : 'image/png'
    const filename = `flyer-${ev.id}.${ext}`
    attachments = [{ filename, contentType, data: bytes }]
    embedImageUrl = `attachment://${filename}`
  } catch (err) {
    console.error('[preview-announcement] Failed to download flyer:', err)
    if (ev.driveThumbnailUrl) {
      embedImageUrl = ev.driveThumbnailUrl
    }
  }

  await sendChannelMessage(channelId, {
    content: isRestricted ? `📢 ${ev.audienceRestriction} — heads up!` : '@everyone',
    embeds: [{
      title: `🎯 ${ev.title}`,
      description,
      color: 0xC9A96E,
      fields,
      image: embedImageUrl ? { url: embedImageUrl } : undefined,
      footer: { text: 'AFF Concierge · auto-posted from /vault/trainings' },
      timestamp: ev.startsAt.toISOString(),
    }],
    allowedMentions: { parse: isRestricted ? [] : ['everyone'] },
    attachments,
  })

  return NextResponse.json({
    posted: true,
    channelId,
    imageAttached: !!attachments,
    event: {
      id: ev.id,
      title: ev.title,
      startsAt: ev.startsAt,
    },
  })
}
