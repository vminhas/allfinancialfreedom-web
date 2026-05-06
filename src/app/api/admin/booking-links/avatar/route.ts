import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { put } from '@vercel/blob'
import { getBookingLinks, saveBookingLinks } from '@/lib/booking-links'

// POST   /api/admin/booking-links/avatar
//   Multipart upload. Body: file=<jpeg|png|webp>, linkId=<id>.
//   Stores the image in Vercel Blob and patches the matching
//   BookingLink's avatarUrl. Returns the saved URL.
//
// DELETE /api/admin/booking-links/avatar?linkId=<id>
//   Clears the avatarUrl on the matching link. Doesn't bother
//   deleting the underlying blob — they're cheap and we may want
//   to recover an undo.

const MAX_BYTES = 5 * 1024 * 1024  // 5MB plenty for headshots
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const form = await req.formData()
  const file = form.get('file') as File | null
  const linkId = form.get('linkId')
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (typeof linkId !== 'string' || !linkId) {
    return NextResponse.json({ error: 'linkId is required' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Image exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Use JPG, PNG, or WebP' }, { status: 400 })
  }

  const links = await getBookingLinks()
  const idx = links.findIndex(l => l.id === linkId)
  if (idx < 0) {
    return NextResponse.json({ error: 'Booking link not found' }, { status: 404 })
  }

  const safeName = (file.name || 'avatar').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
  const data = Buffer.from(await file.arrayBuffer())
  const blob = await put(`booking-avatars/${linkId}/${safeName}`, data, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true,
  })

  links[idx] = { ...links[idx], avatarUrl: blob.url }
  await saveBookingLinks(links)

  return NextResponse.json({ avatarUrl: blob.url })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const linkId = req.nextUrl.searchParams.get('linkId')
  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 })

  const links = await getBookingLinks()
  const idx = links.findIndex(l => l.id === linkId)
  if (idx < 0) return NextResponse.json({ error: 'Booking link not found' }, { status: 404 })

  links[idx] = { ...links[idx], avatarUrl: undefined }
  await saveBookingLinks(links)
  return NextResponse.json({ ok: true })
}
