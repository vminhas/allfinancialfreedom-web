import { db } from './db'
import { listPublicFolder, downloadPublicFile, filterTrainingFlyers, type DriveFile } from './google-drive'
import { parseTrainingFlyer, type ParsedTrainingEvent } from './training-parser'
import { createGuildScheduledEvent } from './discord'

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
        select: { id: true, driveModifiedTime: true, manuallyEdited: true },
      })
      const fileModified = new Date(file.modifiedTime)

      if (existing && !opts.force) {
        if (existing.manuallyEdited) { stats.skippedExisting += 1; continue }
        if (existing.driveModifiedTime.getTime() >= fileModified.getTime()) { stats.skippedExisting += 1; continue }
      }

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

        // Try to create the Discord scheduled event. Failures are non-fatal —
        // we mark them but continue so the row still lands and the T-15
        // reminder can still post via the cron.
        try {
          if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID && created.startsAt > new Date()) {
            const startsAt = created.startsAt
            const endsAt = new Date(startsAt.getTime() + (created.durationMinutes ?? 60) * 60_000)
            const presenters = Array.isArray(created.presenters) ? (created.presenters as { name: string; role: string }[]) : []
            const presenterLine = presenters.map(p => p.name).join(' · ')
            const description = [
              created.subtitle,
              presenterLine && `Presenters: ${presenterLine}`,
              created.audienceRestriction && `🔒 ${created.audienceRestriction}`,
              created.partnerBrand && `Partner: ${created.partnerBrand}`,
            ].filter(Boolean).join('\n')

            const location = created.streamRoomName
              ? `${created.streamRoomName} · ID ${created.streamId ?? '—'}${created.passcode ? ` · pw ${created.passcode}` : ''}`
              : `Stream ID ${created.streamId ?? '—'}`

            const discordEvent = await createGuildScheduledEvent({
              name: created.title,
              description,
              scheduledStartTime: startsAt.toISOString(),
              scheduledEndTime: endsAt.toISOString(),
              location,
            })

            await db.trainingEvent.update({
              where: { id: created.id },
              data: {
                discordEventId: discordEvent.id,
                discordEventCreatedAt: new Date(),
              },
            })
            stats.discordEventsCreated += 1
          }
        } catch (err) {
          stats.discordErrors += 1
          stats.errors.push({
            fileName: `${file.name} (Discord event)`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
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
