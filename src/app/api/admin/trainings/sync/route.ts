import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { listPublicFolder, downloadPublicFile, filterTrainingFlyers, type DriveFile } from '@/lib/google-drive'
import { parseTrainingFlyer, type ParsedTrainingEvent } from '@/lib/training-parser'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/trainings/sync
// Admin-triggered manual sync. Same logic as the cron but available from
// a button in the admin UI so admins don't have to wait an hour.
// Optional ?force=true bypasses dedup.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const folderId = process.env.GDRIVE_TRAINING_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'GDRIVE_TRAINING_FOLDER_ID not configured' }, { status: 500 })
  }

  const force = new URL(req.url).searchParams.get('force') === 'true'
  const stats = { scanned: 0, skippedExisting: 0, parsed: 0, parseErrors: 0, upserted: 0, errors: [] as { fileName: string; error: string }[] }

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
      const existing = await db.trainingEvent.findFirst({
        where: { driveFileId: file.id },
        select: { id: true, driveModifiedTime: true, manuallyEdited: true },
      })
      const fileModified = new Date(file.modifiedTime)

      if (existing && !force) {
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

      await db.trainingEvent.deleteMany({ where: { driveFileId: file.id, manuallyEdited: false } })

      let idx = 0
      for (const ev of result.events) {
        await db.trainingEvent.create({ data: shapeEventForDb(ev, idx, file, fileModified, result) })
        idx += 1
        stats.upserted += 1
      }
    } catch (err) {
      stats.parseErrors += 1
      stats.errors.push({ fileName: file.name, error: err instanceof Error ? err.message : String(err) })
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
