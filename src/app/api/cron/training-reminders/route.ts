import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendChannelMessage } from '@/lib/discord'

// GET /api/cron/training-reminders
// Runs every 5 minutes. Finds events starting in ~10–15 minutes that haven't
// been reminded yet, posts to the AFF training-and-events channel via the
// AFF Concierge bot, and marks reminderSentAt.
//
// Required env:
//   CRON_SECRET
//   DISCORD_BOT_TOKEN
//   DISCORD_TRAINING_CHANNEL_ID — defaults to 1295044213590982725
const DEFAULT_CHANNEL_ID = '1295044213590982725'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 503 })
  }
  const channelId = process.env.DISCORD_TRAINING_CHANNEL_ID ?? DEFAULT_CHANNEL_ID

  const now = Date.now()
  // Window: starts in 8 to 15 minutes from now. The 8-minute lower bound
  // gives us 7 minutes of overlap so a missed cron tick (Vercel skipped one)
  // doesn't drop the reminder. The reminderSentAt check prevents duplicates.
  const windowStart = new Date(now + 8 * 60_000)
  const windowEnd = new Date(now + 16 * 60_000)

  const events = await db.trainingEvent.findMany({
    where: {
      startsAt: { gte: windowStart, lte: windowEnd },
      reminderSentAt: null,
      published: true,          // unpublished events don't get reminders
      title: { not: '' },
    },
    orderBy: { startsAt: 'asc' },
  })

  let sent = 0
  const errors: { id: string; error: string }[] = []

  for (const ev of events) {
    try {
      const presenters = Array.isArray(ev.presenters) ? (ev.presenters as { name: string; role: string }[]) : []
      const startsAt = ev.startsAt
      const minutesAway = Math.max(1, Math.round((startsAt.getTime() - Date.now()) / 60_000))

      const fields: { name: string; value: string; inline?: boolean }[] = []
      fields.push({
        name: 'When',
        value: `<t:${Math.floor(startsAt.getTime() / 1000)}:R>`,
        inline: true,
      })
      fields.push({ name: 'Duration', value: `${ev.durationMinutes ?? 60} min`, inline: true })

      if (ev.streamRoomName || ev.streamId) {
        fields.push({
          name: ev.streamType === 'ZOOM' ? 'Zoom' : 'Stream',
          value: [
            ev.streamRoomName,
            ev.streamId && `**ID:** \`${ev.streamId}\``,
            ev.passcode && `**Passcode:** \`${ev.passcode}\``,
          ].filter(Boolean).join('\n'),
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
        `**Starting in ${minutesAway} minutes**`,
        ev.subtitle,
        ev.category && `_${ev.category}_`,
      ].filter(Boolean).join('\n')

      // Restricted audiences: drop @everyone ping, just post the embed
      const isRestricted = !!ev.audienceRestriction

      // Build the join URL with passcode so one click gets you straight in
      const joinUrl = ev.streamId
        ? `https://zoom.us/j/${ev.streamId.replace(/[\s-]/g, '')}${ev.passcode ? `?pwd=${encodeURIComponent(ev.passcode)}` : ''}`
        : null

      // Make passcode prominent — it's the thing people need most urgently at T-15
      if (ev.streamRoomName || ev.streamId) {
        const streamParts: string[] = []
        if (ev.streamRoomName) streamParts.push(`**${ev.streamRoomName}**`)
        if (ev.streamId) streamParts.push(`ID: \`${ev.streamId}\``)
        if (ev.passcode) streamParts.push(`**Passcode: \`${ev.passcode}\`**`)
        if (joinUrl) streamParts.push(`[**Join now →**](${joinUrl})`)
        // Replace the old stream field with a more prominent version
        const existingStreamIdx = fields.findIndex(f => f.name === 'Stream' || f.name === 'Zoom' || f.name.includes('Live'))
        if (existingStreamIdx >= 0) {
          fields[existingStreamIdx] = {
            name: ev.streamType === 'ZOOM' ? '🎥 Zoom' : '📺 GFI Live · Impact TV',
            value: streamParts.join('\n'),
            inline: false,
          }
        } else {
          fields.push({
            name: ev.streamType === 'ZOOM' ? '🎥 Zoom' : '📺 GFI Live · Impact TV',
            value: streamParts.join('\n'),
            inline: false,
          })
        }
      }

      // Try to attach the flyer image. If it fails for ANY reason, fall back
      // to text-only. The reminder MUST go out even if the image is broken.
      let attachments: { filename: string; contentType: string; data: Buffer }[] | undefined
      let embedImageUrl: string | undefined

      const imageSource = ev.flyerImageUrl ?? ev.driveThumbnailUrl
      if (imageSource) {
        try {
          const imgRes = await fetch(imageSource)
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer())
            if (buf.byteLength > 100) { // sanity check — not an empty response
              const ct = imgRes.headers.get('content-type') ?? 'image/jpeg'
              const ext = ct.includes('png') ? 'png' : 'jpg'
              const filename = `reminder-${ev.id}.${ext}`
              attachments = [{ filename, contentType: ct, data: buf }]
              embedImageUrl = `attachment://${filename}`
            }
          }
        } catch {
          // Image fetch failed — will post without image
        }
      }

      const content = isRestricted ? `📢 ${ev.audienceRestriction} — heads up!` : '@everyone'
      const mentionParse: ('everyone' | 'roles' | 'users')[] = isRestricted ? [] : ['everyone']
      const embed = {
        title: `🎯 ${ev.title}`,
        description,
        color: 0xC9A96E,
        fields,
        image: embedImageUrl ? { url: embedImageUrl } : undefined,
        footer: { text: 'AFF Concierge · auto-posted from /vault/trainings' },
        timestamp: startsAt.toISOString(),
      }

      // Primary attempt: with image attachment
      let posted = false
      if (attachments) {
        try {
          await sendChannelMessage(channelId, {
            content,
            embeds: [embed],
            allowedMentions: { parse: mentionParse },
            attachments,
          })
          posted = true
        } catch {
          // Multipart upload failed — fall through to text-only
        }
      }

      // Fallback: post without image if multipart failed or no image available
      if (!posted) {
        await sendChannelMessage(channelId, {
          content,
          embeds: [{ ...embed, image: undefined }],
          allowedMentions: { parse: mentionParse },
        })
      }

      await db.trainingEvent.update({
        where: { id: ev.id },
        data: { reminderSentAt: new Date() },
      })
      sent += 1
    } catch (err) {
      errors.push({ id: ev.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    candidateCount: events.length,
    sent,
    errors,
  })
}
