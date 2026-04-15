import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listPublicFolder, downloadPublicFile, filterTrainingFlyers, type DriveFile } from '@/lib/google-drive'
import { parseTrainingFlyer, type ParsedTrainingEvent } from '@/lib/training-parser'

interface SyncStats {
  scanned: number
  skippedExisting: number
  parsed: number
  parseErrors: number
  upserted: number
  errors: { fileName: string; error: string }[]
}

// GET /api/cron/sync-trainings — protected by CRON_SECRET
// Optional ?force=true bypasses the modifiedTime check and re-parses every file
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const folderId = process.env.GDRIVE_TRAINING_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'GDRIVE_TRAINING_FOLDER_ID not configured' }, { status: 500 })
  }

  const force = new URL(req.url).searchParams.get('force') === 'true'
  const stats: SyncStats = { scanned: 0, skippedExisting: 0, parsed: 0, parseErrors: 0, upserted: 0, errors: [] }

  let files: DriveFile[]
  try {
    const all = await listPublicFolder(folderId)
    files = filterTrainingFlyers(all)
  } catch (err) {
    return NextResponse.json({ error: `Drive list failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }

  stats.scanned = files.length

  for (const file of files) {
    try {
      // Check if we've already processed this file at this version
      const existing = await db.trainingEvent.findFirst({
        where: { driveFileId: file.id },
        select: { id: true, driveModifiedTime: true, manuallyEdited: true },
      })
      const fileModified = new Date(file.modifiedTime)

      if (existing && !force) {
        if (existing.manuallyEdited) {
          stats.skippedExisting += 1
          continue
        }
        if (existing.driveModifiedTime.getTime() >= fileModified.getTime()) {
          stats.skippedExisting += 1
          continue
        }
      }

      // Download the bytes
      const bytes = await downloadPublicFile(file.id)
      const mimeType: 'image/jpeg' | 'image/png' = file.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'

      // Parse with Claude vision
      const result = await parseTrainingFlyer({ imageBytes: bytes, mimeType, fileName: file.name })
      stats.parsed += 1

      if (result.events.length === 0) {
        stats.parseErrors += 1
        stats.errors.push({ fileName: file.name, error: 'Claude returned 0 events' })
        await db.trainingEvent.upsert({
          where: { driveFileId_eventIndex: { driveFileId: file.id, eventIndex: 0 } },
          create: {
            driveFileId: file.id,
            eventIndex: 0,
            driveFileName: file.name,
            driveModifiedTime: fileModified,
            driveThumbnailUrl: file.thumbnailLink ?? null,
            title: '(parse failed — no events)',
            startsAt: new Date(),
            presenters: [],
            parseError: 'Claude returned 0 events',
            modelId: result.modelId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            rawParseJson: result.rawJson as object,
          },
          update: {
            parseError: 'Claude returned 0 events',
            modelId: result.modelId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            rawParseJson: result.rawJson as object,
          },
        })
        continue
      }

      // Wipe any rows for this file (handles event count changes between parses)
      // Then create one row per parsed event (usually just one).
      await db.trainingEvent.deleteMany({ where: { driveFileId: file.id, manuallyEdited: false } })

      let idx = 0
      for (const ev of result.events) {
        await db.trainingEvent.create({
          data: shapeEventForDb(ev, idx, file, fileModified, result),
        })
        idx += 1
        stats.upserted += 1
      }
    } catch (err) {
      stats.parseErrors += 1
      stats.errors.push({
        fileName: file.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json(stats)
}

function shapeEventForDb(
  ev: ParsedTrainingEvent,
  index: number,
  file: DriveFile,
  fileModified: Date,
  result: { modelId: string; inputTokens: number; outputTokens: number; rawJson: unknown }
) {
  // Convert ISO-with-offset string to a JS Date (UTC under the hood)
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
