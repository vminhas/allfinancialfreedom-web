import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole, isAdmin } from '@/lib/permissions'

// PATCH /api/vault/licensing-notes/[id] — edit a note (author or admin)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const viewerId = (session!.user as { id?: string }).id

  const existing = await db.licensingNote.findUnique({
    where: { id },
    select: { authorId: true, scope: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // LC can never touch an admin-only note (treat as 404 to avoid leaking existence)
  if (!isAdmin(session) && existing.scope === 'ADMIN_ONLY') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Author can edit own notes; admins can edit any
  if (!isAdmin(session) && existing.authorId !== viewerId) {
    return NextResponse.json({ error: 'You can only edit your own notes' }, { status: 403 })
  }

  const body = await req.json() as { body: string }
  if (!body.body || body.body.trim().length === 0) {
    return NextResponse.json({ error: 'Note body required' }, { status: 400 })
  }

  const note = await db.licensingNote.update({
    where: { id },
    data: { body: body.body.trim() },
    include: { author: { select: { id: true, name: true, role: true } } },
  })
  return NextResponse.json({ note })
}

// DELETE /api/vault/licensing-notes/[id] — delete (author or admin)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const viewerId = (session!.user as { id?: string }).id

  const existing = await db.licensingNote.findUnique({
    where: { id },
    select: { authorId: true, scope: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!isAdmin(session) && existing.scope === 'ADMIN_ONLY') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!isAdmin(session) && existing.authorId !== viewerId) {
    return NextResponse.json({ error: 'You can only delete your own notes' }, { status: 403 })
  }

  await db.licensingNote.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
