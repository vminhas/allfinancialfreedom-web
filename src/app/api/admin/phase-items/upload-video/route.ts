import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { put } from '@vercel/blob'

// POST /api/admin/phase-items/upload-video
//
// Stores a downloaded walkthrough video in Vercel Blob and returns the
// public URL. The admin then pastes that URL into the phase item's videoUrl
// field via the existing phase-items PUT route — same field a Loom URL goes
// into, so the agent-side renderer can swap players without caring about
// the source.
//
// Limits: 500MB to keep storage costs reasonable, common video mimetypes only.
const MAX_BYTES = 500 * 1024 * 1024
const ALLOWED = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Unsupported video type: ${file.type}. Use MP4, WebM, MOV, or MKV.` }, { status: 400 })
  }

  const itemKey = (form.get('itemKey') as string | null) ?? 'general'
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'video.mp4'
  const data = Buffer.from(await file.arrayBuffer())

  const blob = await put(`phase-videos/${itemKey}/${safeName}`, data, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true,
  })

  return NextResponse.json({ url: blob.url, size: file.size, contentType: file.type })
}
