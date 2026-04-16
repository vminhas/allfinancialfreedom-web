import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { downloadPublicFile } from '@/lib/google-drive'
import { uploadFlyerToBlob } from '@/lib/blob-upload'

// POST /api/admin/trainings/[id]/resync-image
// Re-downloads the flyer from Drive and re-uploads to Vercel Blob for
// a single training event. Fixes broken images without re-parsing the
// whole folder.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params
  const ev = await db.trainingEvent.findUnique({ where: { id } })
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!ev.driveFileId) {
    return NextResponse.json({ error: 'Manual event — no Drive file to resync. Upload an image via edit instead.' }, { status: 400 })
  }

  // Verify Blob is configured
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN not set in Vercel env — cannot upload images to Blob storage' },
      { status: 500 }
    )
  }

  let bytes: Buffer
  try {
    bytes = await downloadPublicFile(ev.driveFileId)
  } catch (err) {
    return NextResponse.json(
      { error: `Drive download failed: ${err instanceof Error ? err.message : String(err)}`, step: 'download' },
      { status: 500 }
    )
  }

  let flyerImageUrl: string
  try {
    const ext = (ev.driveFileName ?? '').toLowerCase().includes('.png') ? 'png' : 'jpg'
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'
    flyerImageUrl = await uploadFlyerToBlob(`${ev.driveFileId}.${ext}`, bytes, contentType)
  } catch (err) {
    return NextResponse.json(
      { error: `Blob upload failed: ${err instanceof Error ? err.message : String(err)}`, step: 'upload', sizeBytes: bytes.byteLength },
      { status: 500 }
    )
  }

  await db.trainingEvent.update({
    where: { id },
    data: { flyerImageUrl },
  })

  return NextResponse.json({ ok: true, flyerImageUrl, sizeBytes: bytes.byteLength })
}
