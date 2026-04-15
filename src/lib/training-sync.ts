import { db } from './db'
import { listPublicFolder, downloadPublicFile, filterTrainingFlyers, type DriveFile } from './google-drive'
import { parseTrainingFlyer, type ParsedTrainingEvent } from './training-parser'
import { createGuildScheduledEvent } from './discord'

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
      data: { discordEventId: discordEvent.id, discordEventCreatedAt: new Date() },
    })
    return true
  } catch (err) {
    // Log the error onto the row so the admin UI can surface it
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
    errors: [],
  }

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
        || (!existing.manuallyEdited && existing.driveModifiedTime.getTime() < fileModified.getTime())

      if (!needsReparse) {
        stats.skippedExisting += 1
        // Even if we skip parsing, retroactively backfill missing Discord events
        // (covers the case where Discord env was set AFTER the row was first parsed).
        if (existing && !existing.discordEventId && existing.startsAt > new Date()) {
          const ok = await ensureDiscordEvent(existing.id)
          if (ok) stats.discordEventsCreated += 1
          else stats.discordErrors += 1
          // Small spacing between Discord create calls — Discord rate-limits
          // scheduled-event creation per-guild aggressively. discordFetch
          // also handles 429s with retry-after, but spacing reduces churn.
          // Discord per-guild rate limit on scheduled-event creation is
          // around 5 per 10 seconds. Sleep 3s between calls so we stay
          // comfortably under it. Total time for 14 events: ~42s, well
          // within Vercel function timeout on Pro.
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

      // Wipe non-manual rows for this file and recreate
      await db.trainingEvent.deleteMany({ where: { driveFileId: file.id, manuallyEdited: false } })

      let idx = 0
      for (const ev of result.events) {
        const created = await db.trainingEvent.create({
          data: shapeEventForDb(ev, idx, file, fileModified, result),
        })
        idx += 1
        stats.upserted += 1

        const ok = await ensureDiscordEvent(created.id)
        if (ok) stats.discordEventsCreated += 1
        else if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID && created.startsAt > new Date()) {
          // Only count as an error if Discord is configured but we still failed
          stats.discordErrors += 1
          stats.errors.push({ fileName: `${file.name} (Discord)`, error: 'Discord event creation failed — see row parseError' })
        }
        await new Promise(r => setTimeout(r, 300))
      }
    } catch (err) {
      stats.parseErrors += 1
      stats.errors.push({
        fileName: file.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return stats
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
