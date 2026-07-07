import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { parseTrainingFlyer } from '@/lib/training-parser'
import { uploadFlyerToBlob } from '@/lib/blob-upload'
import { createGuildScheduledEvent } from '@/lib/discord'
import { stepOccurrence, createDiscordEventForOccurrence } from '@/lib/training-recurrence'

function buildJoinUrl(streamId: string | null, passcode?: string | null): string | null {
  if (!streamId) return null
  const digits = streamId.replace(/[\s-]/g, '')
  if (!/^\d{8,}$/.test(digits)) return null
  const base = `https://zoom.us/j/${digits}`
  return passcode ? `${base}?pwd=${encodeURIComponent(passcode)}` : base
}

// POST /api/admin/trainings/parse-image
// Accepts a single image file, parses it with Claude vision, creates
// the training event(s) in the DB, and optionally creates Discord events.
export async function POST(req: NextRequest) {
  // Allow auth via admin session OR cron secret (for Discord bot server-to-server calls)
  const cronSecret = req.headers.get('x-cron-secret')
  const isCronAuth = cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET

  if (!isCronAuth) {
    const session = await getServerSession(authOptions)
    const denied = requireRole(session, 'admin')
    if (denied) return denied
  }

  const form = await req.formData()
  const file = form.get('image') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // Detect actual image type from magic bytes — Discord/mobile uploads
  // sometimes send the wrong Content-Type header.
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  const mimeType: 'image/jpeg' | 'image/png' = isPng ? 'image/png' : 'image/jpeg'

  // Parse the flyer with Claude vision
  let parsed
  try {
    parsed = await parseTrainingFlyer({ imageBytes: bytes, mimeType, fileName: file.name })
  } catch (err) {
    return NextResponse.json({
      error: `Failed to parse image: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }

  if (parsed.events.length === 0) {
    return NextResponse.json({ error: 'No events found in the image' }, { status: 400 })
  }

  // Upload flyer to blob storage
  let flyerImageUrl: string | null = null
  try {
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    flyerImageUrl = await uploadFlyerToBlob(`drop-${Date.now()}.${ext}`, bytes, mimeType)
  } catch { /* non-fatal */ }

  const created: Array<{
    id: string
    title: string
    startsAt: string
    presenters: string[]
    discordEvent: 'created' | 'skipped (past date)' | 'duplicate' | false
    discordError?: string
    duplicateOfId?: string
    duplicateReason?: string
    duplicateTitle?: string
    recurrence?: string
    recurrenceLabel?: string
    occurrences?: number
  }> = []
  let duplicates = 0

  // Dedupe window: Claude vision is deterministic on the same flyer, but
  // tiny rounding differences (or DST edge cases on weekly recurrences)
  // mean we shouldn't require exact-equality on startsAt. ±5 minutes is
  // tight enough that two genuinely-back-to-back trainings won't collide.
  const DEDUPE_WINDOW_MS = 5 * 60_000

  const norm = (s: string | null | undefined) =>
    (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

  for (const ev of parsed.events) {
    let startsAt: Date
    try {
      startsAt = new Date(ev.startsAtET)
      if (isNaN(startsAt.getTime())) throw new Error('invalid date')
    } catch {
      startsAt = new Date()
    }

    // Look for an existing TrainingEvent in the dedupe window. We compare
    // normalized title in JS (Prisma can't normalize whitespace server-
    // side) and fall back to streamId match for robustness when Claude
    // re-cases or re-spaces the title between two reads of the same
    // flyer.
    //
    // Unpublished events do NOT count as conflicts. If an admin
    // unpublishes an old training and uploads a new flyer that takes
    // the same time slot (e.g., the speaker changed and we kept the
    // old row for history), the new event needs to land cleanly
    // without a misleading "duplicate" report. The training-reminders
    // cron already ignores unpublished events, so suppressing them
    // here too keeps the whole pipeline consistent on the rule
    // "unpublished = not on the schedule."
    const candidates = await db.trainingEvent.findMany({
      where: {
        published: true,
        startsAt: {
          gte: new Date(startsAt.getTime() - DEDUPE_WINDOW_MS),
          lte: new Date(startsAt.getTime() + DEDUPE_WINDOW_MS),
        },
      },
      select: { id: true, title: true, streamId: true, startsAt: true, discordEventId: true, flyerImageUrl: true, durationMinutes: true, presenters: true, streamType: true, streamRoomName: true, passcode: true },
    })
    const titleN = norm(ev.title)
    const streamIdN = norm(ev.streamId)
    let dupReason = ''
    const dup = candidates.find(c => {
      const ct = norm(c.title)
      const cs = norm(c.streamId)
      if (streamIdN && cs && streamIdN === cs) { dupReason = `streamId match (${streamIdN})`; return true }
      if (ct === titleN) { dupReason = 'exact title match'; return true }
      if (titleN.length >= 8 && ct.length >= 8) {
        const shorter = Math.min(titleN.length, ct.length)
        const longer = Math.max(titleN.length, ct.length)
        if (shorter / longer >= 0.75 && (titleN.includes(ct) || ct.includes(titleN))) {
          dupReason = `fuzzy title ("${ct}" ~ "${titleN}")`; return true
        }
      }
      return false
    })
    if (dup) {
      // If the DB record exists but has no Discord event (e.g. created by
      // Drive sync with a failed Discord call), create the Discord event
      // now so re-posting a flyer actually fixes the gap.
      let discordStatus: 'duplicate' | 'created' = 'duplicate'
      if (!dup.discordEventId && dup.startsAt > new Date() && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
        try {
          const dupPresenters = Array.isArray(dup.presenters) ? (dup.presenters as { name: string; role: string }[]) : []
          const presenterLine = dupPresenters.map(p => `${p.name} (${p.role})`).join(' · ')
          const dupJoinUrl = buildJoinUrl(dup.streamId, dup.passcode)
          const durationMins = dup.durationMinutes ?? 60
          const endsAtDup = new Date(dup.startsAt.getTime() + durationMins * 60_000)
          const description = [
            presenterLine && `**Presenters:** ${presenterLine}`,
            dup.streamRoomName && `**Stream:** ${dup.streamRoomName}`,
            dup.streamId && `**ID:** \`${dup.streamId}\``,
            dup.passcode && `**Passcode:** \`${dup.passcode}\``,
            dupJoinUrl && `**Join:** ${dupJoinUrl}`,
          ].filter(Boolean).join('\n')
          const passcodeStr = dup.passcode ? ` · pw ${dup.passcode}` : ''
          const location = dupJoinUrl
            ? `${dupJoinUrl}${passcodeStr}`.slice(0, 100)
            : `${dup.streamRoomName ?? 'Stream'} · ID ${dup.streamId ?? '—'}${passcodeStr}`.slice(0, 100)

          const discordEvent = await createGuildScheduledEvent({
            name: dup.title,
            description,
            scheduledStartTime: dup.startsAt.toISOString(),
            scheduledEndTime: endsAtDup.toISOString(),
            location,
          })
          await db.trainingEvent.update({
            where: { id: dup.id },
            data: { discordEventId: discordEvent.id, discordEventCreatedAt: new Date() },
          })
          discordStatus = 'created'
        } catch { /* best effort */ }
      }

      // Also backfill the flyer image if the DB record is missing one
      if (!dup.flyerImageUrl && flyerImageUrl) {
        await db.trainingEvent.update({ where: { id: dup.id }, data: { flyerImageUrl } }).catch(() => {})
      }

      if (discordStatus !== 'created') duplicates++
      created.push({
        id: dup.id,
        title: ev.title,
        startsAt: dup.startsAt.toISOString(),
        presenters: (ev.presenters ?? []).map(p => p.name),
        discordEvent: discordStatus === 'created' ? 'created' : 'duplicate',
        duplicateOfId: dup.id,
        duplicateReason: dupReason,
        duplicateTitle: dup.title,
      })
      continue
    }

    // Recurring weekday series (the flyer says Mon-Fri). Seed a small
    // initial batch now for a fast Discord reply, and set roll-forward so
    // the daily cron fills the series out to its full window and keeps it
    // topped up. Only this parse flow acts on recurrence; Drive auto-sync
    // ignores it and keeps making one-offs.
    if (ev.recurrence === 'WEEKDAYS') {
      const durationMinutes = ev.durationMinutes ?? 60
      const presenters = ev.presenters ?? []
      const SEED = 5
      const occ: Date[] = []
      const cur = new Date(startsAt)
      while (cur.getUTCDay() === 0 || cur.getUTCDay() === 6) cur.setUTCDate(cur.getUTCDate() + 1)
      occ.push(new Date(cur))
      for (let i = 1; i < SEED; i++) occ.push(stepOccurrence(occ[i - 1], 'WEEKDAYS'))

      const shared = {
        title: ev.title,
        subtitle: ev.subtitle,
        category: ev.category,
        durationMinutes,
        presenters: presenters as object,
        streamType: (ev.streamType === 'ZOOM' ? 'ZOOM' : 'GFI_LIVE') as 'ZOOM' | 'GFI_LIVE',
        streamRoomName: ev.streamRoomName,
        streamId: ev.streamId,
        passcode: ev.passcode,
        audienceRestriction: ev.audienceRestriction,
        partnerBrand: ev.partnerBrand,
        targetRegion: ev.targetRegion,
        flyerImageUrl,
        published: true,
        manuallyEdited: false,
        parsedAt: new Date(),
        rawParseJson: parsed.rawJson as object,
        modelId: parsed.modelId,
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
      }
      const parentEvent = await db.trainingEvent.create({
        data: { ...shared, startsAt: occ[0], recurrenceFrequency: 'WEEKDAYS', recurrenceRollForward: true },
      })
      const childEvents = await Promise.all(
        occ.slice(1).map(d => db.trainingEvent.create({
          data: { ...shared, startsAt: d, recurrenceParentId: parentEvent.id, recurrenceFrequency: 'WEEKDAYS' },
        })),
      )
      let disc = 0
      for (const e of [parentEvent, ...childEvents]) {
        if (await createDiscordEventForOccurrence(e)) disc++
        await new Promise(r => setTimeout(r, 1500))
      }
      // The Concierge bot renders `title` (and often a count) in its
      // confirmation. Annotate the title so the message reflects that this
      // is a recurring Mon-Fri series that auto-extends, not a single event.
      // The stored event keeps the clean title (ev.title).
      created.push({
        id: parentEvent.id,
        title: `${ev.title} (recurring Mon-Fri · auto-extends)`,
        startsAt: occ[0].toISOString(),
        presenters: presenters.map(p => p.name),
        discordEvent: disc > 0 ? 'created' : false,
        recurrence: 'WEEKDAYS',
        recurrenceLabel: 'Every weekday (Mon-Fri), auto-extends',
        occurrences: occ.length,
      })
      continue
    }

    const durationMinutes = ev.durationMinutes ?? 60
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)
    const presenters = ev.presenters ?? []
    const presenterLine = presenters.map(p => `${p.name} (${p.role})`).join(' · ')
    const joinUrl = buildJoinUrl(ev.streamId, ev.passcode)

    const event = await db.trainingEvent.create({
      data: {
        title: ev.title,
        subtitle: ev.subtitle,
        category: ev.category,
        startsAt,
        durationMinutes,
        presenters: presenters as object,
        streamType: ev.streamType === 'ZOOM' ? 'ZOOM' : 'GFI_LIVE',
        streamRoomName: ev.streamRoomName,
        streamId: ev.streamId,
        passcode: ev.passcode,
        audienceRestriction: ev.audienceRestriction,
        partnerBrand: ev.partnerBrand,
        targetRegion: ev.targetRegion,
        flyerImageUrl,
        published: true,
        manuallyEdited: false,
        parsedAt: new Date(),
        rawParseJson: parsed.rawJson as object,
        modelId: parsed.modelId,
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
      },
    })

    // Create Discord scheduled event if in the future
    if (startsAt > new Date() && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
      try {
        const description = [
          ev.subtitle,
          presenterLine && `**Presenters:** ${presenterLine}`,
          ev.streamRoomName && `**Stream:** ${ev.streamRoomName}`,
          ev.streamId && `**ID:** \`${ev.streamId}\``,
          ev.passcode && `**Passcode:** \`${ev.passcode}\``,
          joinUrl && `**Join:** ${joinUrl}`,
          ev.audienceRestriction && `🔒 ${ev.audienceRestriction}`,
        ].filter(Boolean).join('\n')

        const passcodeStr = ev.passcode ? ` · pw ${ev.passcode}` : ''
        const location = joinUrl
          ? `${joinUrl}${passcodeStr}`.slice(0, 100)
          : `${ev.streamRoomName ?? 'Stream'} · ID ${ev.streamId ?? '—'}${passcodeStr}`.slice(0, 100)

        const discordEvent = await createGuildScheduledEvent({
          name: ev.title,
          description,
          scheduledStartTime: startsAt.toISOString(),
          scheduledEndTime: endsAt.toISOString(),
          location,
        })

        await db.trainingEvent.update({
          where: { id: event.id },
          data: { discordEventId: discordEvent.id, discordEventCreatedAt: new Date() },
        })
      } catch (discordErr) {
        created.push({
          id: event.id,
          title: ev.title,
          startsAt: startsAt.toISOString(),
          presenters: presenters.map(p => p.name),
          discordEvent: false,
          discordError: discordErr instanceof Error ? discordErr.message : String(discordErr),
        })
        continue
      }
    }

    created.push({
      id: event.id,
      title: ev.title,
      startsAt: startsAt.toISOString(),
      presenters: presenters.map(p => p.name),
      discordEvent: startsAt > new Date() ? 'created' : 'skipped (past date)',
    })

    // Rate limit spacing for Discord
    if (parsed.events.length > 1) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  return NextResponse.json({
    parsed: created.length,
    duplicates,
    events: created,
  })
}
