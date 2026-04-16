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

      // Attach the flyer image via multipart for reliable rendering.
      // Prefer Blob URL (CDN, fast), fall back to Drive thumbnail URL.
      let attachments: { filename: string; contentType: string; data: Buffer }[] | undefined
      let embedImageUrl: string | undefined

      const imageSource = ev.flyerImageUrl ?? ev.driveThumbnailUrl
      if (imageSource) {
        try {
          const res = await fetch(imageSource)
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            const ct = res.headers.get('content-type') ?? 'image/jpeg'
            const ext = ct.includes('png') ? 'png' : 'jpg'
            const filename = `reminder-${ev.id}.${ext}`
            attachments = [{ filename, contentType: ct, data: buf }]
            embedImageUrl = `attachment://${filename}`
          }
        } catch {
          // Image fetch failed — embed without image
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
          timestamp: startsAt.toISOString(),
        }],
        allowedMentions: { parse: isRestricted ? [] : ['everyone'] },
        attachments,
      })

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
