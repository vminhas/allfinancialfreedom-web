import { db } from './db'
import { listPublicFolder, downloadPublicFile, filterTrainingFlyers, type DriveFile } from './google-drive'
import { parseTrainingFlyer, type ParsedTrainingEvent } from './training-parser'
import { createGuildScheduledEvent, sendChannelMessage, editChannelMessage } from './discord'
import { getSetting, setSetting } from './settings'
import { uploadFlyerToBlob } from './blob-upload'

// Setting key for the Discord message ID of the current weekly roundup
// message. When we post a roundup, we save the message ID here so the
// next call can edit the same message in place instead of creating
// duplicates.
const ROUNDUP_MESSAGE_KEY = 'DISCORD_WEEKLY_ROUNDUP_MESSAGE_ID'

// Setting keys for sync activity timestamps, surfaced in the admin UI
// so admins can see when the cron last ran and when it last did real work.
const SYNC_LAST_CHECKED_KEY = 'TRAINING_SYNC_LAST_CHECKED_AT'
const SYNC_LAST_UPDATED_KEY = 'TRAINING_SYNC_LAST_UPDATED_AT'

/**
 * Build a clickable Zoom-style join URL from a stream/meeting ID.
 * Both "GFI Live - Impact TV" and direct Zoom meetings share the format
 * https://zoom.us/j/{digits}, so we treat them the same way.
 */
function buildJoinUrl(streamId: string | null): string | null {
  if (!streamId) return null
  const digits = streamId.replace(/[\s-]/g, '')
  if (!/^\d{8,}$/.test(digits)) return null
  return `https://zoom.us/j/${digits}`
}

/**
 * Try to create the Discord scheduled event for a TrainingEvent row.
 * Skips silently if Discord env isn't configured or the event is in the
 * past. Returns true on success, false on failure (writes the error to
 * the row's parseError field for visibility, but doesn't throw).
 */
async function ensureDiscordEvent(rowId: string): Promise<boolean> {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID) return false

  const row = await db.trainingEvent.findUnique({ where: { id: rowId } })
  if (!row) return false
  if (row.discordEventId) return true            // already has one
  if (!row.published) return false               // unpublished — don't create
  if (row.startsAt <= new Date()) return false   // in the past, no point

  const presenters = Array.isArray(row.presenters) ? (row.presenters as { name: string; role: string }[]) : []
  const presenterLine = presenters.map(p => `${p.name} (${p.role})`).join(' · ')
  const joinUrl = buildJoinUrl(row.streamId)

  const description = [
    row.subtitle,
    presenterLine && `**Presenters:** ${presenterLine}`,
    row.streamRoomName && `**Stream:** ${row.streamRoomName}`,
    row.streamId && `**ID:** \`${row.streamId}\``,
    row.passcode && `**Passcode:** \`${row.passcode}\``,
    joinUrl && `**Join:** ${joinUrl}`,
    row.audienceRestriction && `🔒 ${row.audienceRestriction}`,
    row.partnerBrand && `🤝 Partner: ${row.partnerBrand}`,
  ].filter(Boolean).join('\n')

  // Discord scheduled-event location must be a string under 100 chars.
  // Prefer the actual join URL — Discord shows it as a clickable link in
  // the event UI. Fall back to a human-readable string.
  const location = joinUrl
    ?? (row.streamRoomName ? `${row.streamRoomName} · ID ${row.streamId ?? '—'}` : `Stream ID ${row.streamId ?? '—'}`)

  const endsAt = new Date(row.startsAt.getTime() + (row.durationMinutes ?? 60) * 60_000)

  try {
    const discordEvent = await createGuildScheduledEvent({
      name: row.title,
      description,
      scheduledStartTime: row.startsAt.toISOString(),
      scheduledEndTime: endsAt.toISOString(),
      location,
    })
    await db.trainingEvent.update({
      where: { id: row.id },
      data: {
        discordEventId: discordEvent.id,
        discordEventCreatedAt: new Date(),
        // Clear any stale error from a previous failed attempt so the
        // T-15 reminder cron doesn't keep excluding this row.
        parseError: null,
      },
    })
    return true
  } catch (err) {
    // Log the error onto the row so the admin UI can surface it.
    // The T-15 reminder cron no longer filters on parseError so this
    // won't prevent reminders from firing.
    await db.trainingEvent.update({
      where: { id: row.id },
      data: {
        parseError: `Discord event creation failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    })
    return false
  }
}

export interface SyncStats {
  scanned: number
  skippedExisting: number
  parsed: number
  parseErrors: number
  upserted: number
  discordEventsCreated: number
  discordErrors: number
  roundupPosted: boolean
  errors: { fileName: string; error: string }[]
}

interface SyncOptions {
  force?: boolean
}

export async function syncTrainingsFromDrive(opts: SyncOptions = {}): Promise<SyncStats> {
  const folderId = process.env.GDRIVE_TRAINING_FOLDER_ID
  if (!folderId) throw new Error('GDRIVE_TRAINING_FOLDER_ID not configured')

  const stats: SyncStats = {
    scanned: 0,
    skippedExisting: 0,
    parsed: 0,
    parseErrors: 0,
    upserted: 0,
    discordEventsCreated: 0,
    discordErrors: 0,
    roundupPosted: false,
    errors: [],
  }

  // Track the IDs of TrainingEvent rows that get a fresh Discord scheduled
  // event during this sync. We post a single @everyone roundup message at
  // the end so members get notified about all the new events at once
  // (instead of pinging on each one).
  const newDiscordRowIds: string[] = []

  // Mark this sync run as "checked" immediately so the admin UI shows
  // activity even if the run ends up as a no-op (no changes detected).
  await setSetting(SYNC_LAST_CHECKED_KEY, new Date().toISOString())

  const all = await listPublicFolder(folderId)
  const files = filterTrainingFlyers(all)
  stats.scanned = files.length

  for (const file of files) {
    try {
      const existing = await db.trainingEvent.findFirst({
        where: { driveFileId: file.id },
        select: { id: true, driveModifiedTime: true, manuallyEdited: true, discordEventId: true, startsAt: true },
      })
      const fileModified = new Date(file.modifiedTime)

      // Decide whether to re-parse this file
      const needsReparse = !existing
        || (opts.force && !existing.manuallyEdited)
        || (!existing.manuallyEdited && (existing.driveModifiedTime?.getTime() ?? 0) < fileModified.getTime())

      if (!needsReparse) {
        stats.skippedExisting += 1
        // Even if we skip parsing, retroactively backfill missing Discord events
        // (covers the case where Discord env was set AFTER the row was first parsed).
        if (existing && !existing.discordEventId && existing.startsAt > new Date()) {
          const ok = await ensureDiscordEvent(existing.id)
          if (ok) {
            stats.discordEventsCreated += 1
            newDiscordRowIds.push(existing.id)
          } else {
            stats.discordErrors += 1
          }
          // Discord per-guild rate limit on scheduled-event creation is ~5 per
          // 10 seconds. 3s spacing keeps us comfortably under it.
          await new Promise(r => setTimeout(r, 3000))
        }
        continue
      }

      // Re-parse path
      const bytes = await downloadPublicFile(file.id)
      const mimeType: 'image/jpeg' | 'image/png' = file.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
      const result = await parseTrainingFlyer({ imageBytes: bytes, mimeType, fileName: file.name })
      stats.parsed += 1

      if (result.events.length === 0) {
        stats.parseErrors += 1
        stats.errors.push({ fileName: file.name, error: 'Claude returned 0 events' })
        continue
      }

      // Mirror the flyer image to Vercel Blob for reliable Discord embeds.
      // This replaces the Drive thumbnail URL (which Discord often can't fetch).
      let flyerImageUrl: string | null = null
      try {
        const ext = mimeType === 'image/png' ? 'png' : 'jpg'
        flyerImageUrl = await uploadFlyerToBlob(`${file.id}.${ext}`, bytes, mimeType)
      } catch (err) {
        console.error('[sync] Blob upload failed for', file.name, err)
      }

      // Wipe non-manual rows for this file and recreate
      await db.trainingEvent.deleteMany({ where: { driveFileId: file.id, manuallyEdited: false } })

      let idx = 0
      for (const ev of result.events) {
        const created = await db.trainingEvent.create({
          data: { ...shapeEventForDb(ev, idx, file, fileModified, result), flyerImageUrl },
        })
        idx += 1
        stats.upserted += 1

        const ok = await ensureDiscordEvent(created.id)
        if (ok) {
          stats.discordEventsCreated += 1
          newDiscordRowIds.push(created.id)
        } else if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID && created.startsAt > new Date()) {
          // Only count as an error if Discord is configured but we still failed
          stats.discordErrors += 1
          stats.errors.push({ fileName: `${file.name} (Discord)`, error: 'Discord event creation failed — see row parseError' })
        }
        await new Promise(r => setTimeout(r, 3000))
      }
    } catch (err) {
      stats.parseErrors += 1
      stats.errors.push({
        fileName: file.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // If the sync actually produced changes (new parses, new Discord events,
  // or updated rows), record the "last updated" timestamp so the admin UI
  // can distinguish a no-op check from a meaningful update.
  if (stats.upserted > 0 || stats.parsed > 0 || stats.discordEventsCreated > 0) {
    await setSetting(SYNC_LAST_UPDATED_KEY, new Date().toISOString())
  }

  // After the loop — if we created any new Discord scheduled events,
  // post a single @everyone roundup message in the training-and-events
  // channel so members get notified about the new week of trainings
  // and can mark themselves Interested with one tap.
  if (newDiscordRowIds.length > 0 && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
    try {
      const newRows = await db.trainingEvent.findMany({
        where: { id: { in: newDiscordRowIds } },
        orderBy: { startsAt: 'asc' },
        select: { id: true, title: true, startsAt: true, discordEventId: true, audienceRestriction: true },
      })
      const result = await postWeeklyRoundupForRows(newRows)
      stats.roundupPosted = result.posted
    } catch (err) {
      stats.errors.push({
        fileName: '(roundup post)',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return stats
}

/**
 * Posts a single @everyone announcement message in the configured
 * training channel, listing the given scheduled events. Each event
 * is rendered as a clickable Discord event link so members can tap
 * through and mark themselves Interested with one click.
 *
 * Exported so the "Post Weekly Roundup" button in the admin UI can
 * call it directly with a custom list of rows (e.g. all upcoming
 * events, not just newly created ones).
 */
export async function postWeeklyRoundupForRows(
  rows: { id: string; title: string; startsAt: Date; discordEventId: string | null; audienceRestriction: string | null }[]
): Promise<{ posted: boolean; eventCount: number; action: 'edited' | 'created' | 'skipped' }> {
  const channelId = process.env.DISCORD_TRAINING_CHANNEL_ID ?? '1295044213590982725'
  const guildId = process.env.DISCORD_GUILD_ID
  if (!guildId || !process.env.DISCORD_BOT_TOKEN) {
    return { posted: false, eventCount: 0, action: 'skipped' }
  }

  // Only include rows that actually have a Discord event ID — we can't
  // link to non-existent events.
  const linkable = rows.filter(r => r.discordEventId)
  if (linkable.length === 0) return { posted: false, eventCount: 0, action: 'skipped' }

  // Group by date so the post reads as a week-at-a-glance
  const groups = new Map<string, typeof linkable>()
  for (const r of linkable) {
    const key = r.startsAt.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      timeZone: 'America/New_York',
    })
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr)
  }

  // Build the embed
  const fields: { name: string; value: string; inline?: boolean }[] = []
  for (const [day, dayRows] of groups) {
    const lines = dayRows.map(r => {
      const time = r.startsAt.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
        timeZone: 'America/New_York', timeZoneName: 'short',
      })
      const link = `https://discord.com/events/${guildId}/${r.discordEventId}`
      const titleCleaned = r.title.replace(/\*/g, '')
      return `**${time}** — [${titleCleaned}](${link})${r.audienceRestriction ? ` 🔒` : ''}`
    })
    fields.push({ name: `📆 ${day}`, value: lines.join('\n'), inline: false })
  }

  const eventCount = linkable.length
  const dayCount = groups.size

  const embed = {
    title: `${eventCount} training${eventCount === 1 ? '' : 's'} this week`,
    description: [
      `${eventCount} GFI training session${eventCount === 1 ? '' : 's'} ${eventCount === 1 ? 'is' : 'are'} on the calendar across ${dayCount} day${dayCount === 1 ? '' : 's'}.`,
      '',
      '**Tap any session below** to open the event and click **Interested** — Discord will send you a personal reminder one hour before it starts and again when it goes live.',
      '',
      'A 15-minute heads-up will also post here for every session.',
    ].join('\n'),
    color: 0xC9A96E,
    fields,
    footer: { text: 'AFF Concierge · last updated' },
    timestamp: new Date().toISOString(),
  }

  // Prefer editing the existing roundup message in place so there's only
  // ever ONE roundup in the channel, always up to date, and we don't re-ping
  // members every time it's refreshed. If the stored message was deleted in
  // Discord, catch the 404 and fall through to posting a fresh one.
  const existingMessageId = await getSetting(ROUNDUP_MESSAGE_KEY)

  if (existingMessageId) {
    try {
      await editChannelMessage(channelId, existingMessageId, {
        content: '@everyone',
        embeds: [embed],
        // Empty parse array = no re-ping on edit (Discord doesn't re-notify
        // for edits anyway, but explicit for clarity)
        allowedMentions: { parse: [] },
      })
      return { posted: true, eventCount, action: 'edited' }
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status !== 404) {
        // Non-404 error — propagate so caller sees it
        throw err
      }
      // 404 means the message was deleted in Discord — clear the stale ID
      // and fall through to create a fresh message (which will re-ping).
      await setSetting(ROUNDUP_MESSAGE_KEY, '')
    }
  }

  // No existing message (or previous one was deleted) — create fresh
  const created = await sendChannelMessage(channelId, {
    content: '@everyone',
    embeds: [embed],
    allowedMentions: { parse: ['everyone'] },
  })
  await setSetting(ROUNDUP_MESSAGE_KEY, created.id)

  return { posted: true, eventCount, action: 'created' }
}

function shapeEventForDb(
  ev: ParsedTrainingEvent,
  index: number,
  file: DriveFile,
  fileModified: Date,
  result: { modelId: string; inputTokens: number; outputTokens: number; rawJson: unknown }
) {
  let startsAt: Date
  try {
    startsAt = new Date(ev.startsAtET)
    if (isNaN(startsAt.getTime())) throw new Error('invalid date')
  } catch {
    startsAt = new Date()
  }

  return {
    driveFileId: file.id,
    eventIndex: index,
    driveFileName: file.name,
    driveModifiedTime: fileModified,
    driveThumbnailUrl: file.thumbnailLink ?? null,
    title: ev.title,
    subtitle: ev.subtitle,
    category: ev.category,
    startsAt,
    durationMinutes: ev.durationMinutes ?? 60,
    presenters: ev.presenters as object,
    streamType: ev.streamType === 'ZOOM' ? ('ZOOM' as const) : ('GFI_LIVE' as const),
    streamRoomName: ev.streamRoomName,
    streamId: ev.streamId,
    passcode: ev.passcode,
    audienceRestriction: ev.audienceRestriction,
    partnerBrand: ev.partnerBrand,
    targetRegion: ev.targetRegion,
    parsedAt: new Date(),
    parseError: null,
    rawParseJson: result.rawJson as object,
    modelId: result.modelId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}
