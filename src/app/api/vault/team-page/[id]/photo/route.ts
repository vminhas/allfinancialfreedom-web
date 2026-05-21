import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { put, del } from '@vercel/blob'

// Upload a new headshot for a team member.
// multipart/form-data: field name "photo".
// Replaces the existing imageUrl on the row. Best-effort deletes the
// old blob if it was on Vercel Blob (skips local /team/*.jpg paths).

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function isOnVercelBlob(url: string | null | undefined): boolean {
  return !!url && /^https:\/\/[a-z0-9.-]*\.public\.blob\.vercel-storage\.com\//i.test(url)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const existing = await db.teamMember.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('photo')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'photo file is required' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Photo must be 8 MB or smaller' }, { status: 400 })
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, WEBP, or GIF allowed' }, { status: 400 })
  }

  const safeName = (file.name || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_')
  const bytes = Buffer.from(await file.arrayBuffer())
  const blob = await put(`team/${id}/${safeName}`, bytes, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true,
  })

  const member = await db.teamMember.update({
    where: { id },
    data: { imageUrl: blob.url },
  })

  if (isOnVercelBlob(existing.imageUrl)) {
    del(existing.imageUrl as string).catch(() => { /* non-critical */ })
  }

  return NextResponse.json({ member })
}
