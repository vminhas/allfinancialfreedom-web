import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { del } from '@vercel/blob'

// PATCH  partial update of a team member (any of the editable fields)
// DELETE remove the member from the team page entirely
//
// Patching `imageUrl` to a different value or DELETE-ing the row will
// best-effort delete the old blob if it lives on Vercel Blob.

const EDITABLE = new Set([
  'name', 'title', 'credentials', 'specialty', 'location',
  'initials', 'imageUrl', 'bio', 'calendly', 'isActive',
])

function isOnVercelBlob(url: string | null | undefined): boolean {
  return !!url && /^https:\/\/[a-z0-9.-]*\.public\.blob\.vercel-storage\.com\//i.test(url)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const existing = await db.teamMember.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>
  const data: Record<string, string | boolean | null> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue
    if (k === 'isActive') {
      data[k] = !!v
    } else if (typeof v === 'string') {
      const trimmed = v.trim()
      data[k] = trimmed === '' ? null : trimmed
    } else if (v === null) {
      data[k] = null
    }
  }
  if (typeof data.name === 'string' && data.name.length === 0) {
    return NextResponse.json({ error: 'name cannot be blank' }, { status: 400 })
  }

  const member = await db.teamMember.update({ where: { id }, data })

  // Best-effort cleanup of the old blob if we just swapped the photo.
  if (
    'imageUrl' in data &&
    isOnVercelBlob(existing.imageUrl) &&
    existing.imageUrl !== member.imageUrl
  ) {
    del(existing.imageUrl as string).catch(() => { /* non-critical */ })
  }

  return NextResponse.json({ member })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const existing = await db.teamMember.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ ok: true })

  await db.teamMember.delete({ where: { id } })
  if (isOnVercelBlob(existing.imageUrl)) {
    del(existing.imageUrl as string).catch(() => { /* non-critical */ })
  }
  return NextResponse.json({ ok: true })
}
