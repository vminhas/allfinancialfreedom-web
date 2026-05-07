import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'

// POST /api/agents/feedback/upload
//
// Accepts a single image file (multipart form, field name 'screenshot')
// and uploads it to Vercel Blob under feedback-screenshots/. Returns the
// public CDN URL. The agent then submits the feedback message together
// with the array of returned URLs via POST /api/agents/feedback.
//
// We keep the upload as its own endpoint rather than a multipart variant
// of the feedback POST because (a) it lets the UI show progress per file
// and a remove-before-submit flow, and (b) it mirrors the avatar pattern
// already used elsewhere.
//
// Trust model: agents are vetted humans, not arbitrary internet users,
// so we skip server-side virus / EXIF / image-bomb scanning. Whitelist
// MIME types and cap size to keep surface area small.

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }
  const agentUser = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!agentUser?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('screenshot') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPG, WebP, or GIF allowed' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 })
  }

  // Path is scoped under the agent profile id so an admin can later
  // sweep an agent's orphaned uploads if/when we add a cleanup pass.
  // addRandomSuffix avoids collisions when an agent attaches multiple
  // screenshots with the same source filename.
  const ext = file.type.split('/')[1] ?? 'png'
  const path = `feedback-screenshots/${agentUser.profile.id}/${Date.now()}.${ext}`
  const blob = await put(path, file, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true,
  })

  return NextResponse.json({ url: blob.url })
}
