import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole, isAdmin } from '@/lib/permissions'

// GET /api/vault/licensing-agents/[id]/notes
// LC sees: scope=LICENSING only
// Admin sees: all notes (LICENSING + ADMIN_ONLY)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params

  const notes = await db.licensingNote.findMany({
    where: {
      agentProfileId: id,
      ...(isAdmin(session) ? {} : { scope: 'LICENSING' as const }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, name: true, role: true } },
    },
  })
  return NextResponse.json({ notes })
}

// POST /api/vault/licensing-agents/[id]/notes — add a note
// LC can only create LICENSING-scope notes; admins can create either
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const authorId = (session!.user as { id?: string }).id
  if (!authorId) return NextResponse.json({ error: 'Author missing' }, { status: 400 })

  const body = await req.json() as { body: string; scope?: 'LICENSING' | 'ADMIN_ONLY' }
  if (!body.body || body.body.trim().length === 0) {
    return NextResponse.json({ error: 'Note body required' }, { status: 400 })
  }

  // Force LICENSING scope for non-admin users
  const requestedScope = body.scope === 'ADMIN_ONLY' ? 'ADMIN_ONLY' : 'LICENSING'
  const scope = isAdmin(session) ? requestedScope : 'LICENSING'

  const note = await db.licensingNote.create({
    data: {
      agentProfileId: id,
      authorId,
      body: body.body.trim(),
      scope,
    },
    include: {
      author: { select: { id: true, name: true, role: true } },
    },
  })

  // Mirror to the LC activity feed. ADMIN_ONLY notes are filtered
  // out at the helper level so they stay private.
  const agent = await db.agentProfile.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, agentCode: true },
  })
  if (agent) {
    const { logAgentNote } = await import('@/lib/lc-activity')
    logAgentNote({
      agent,
      body: note.body,
      scope: note.scope,
      actor: { id: note.author.id, name: note.author.name, role: note.author.role },
    }).catch(err => console.warn('[licensing-agents notes] lc-activity failed:', err))
  }

  return NextResponse.json({ note })
}

// PATCH /api/vault/licensing-agents/[id]/notes — edit a note's body
// Admins can edit any note; everyone else only their own. LCs can't
// touch ADMIN_ONLY notes (they can't even see them). Scope is not
// changed here, just the text.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const userId = (session!.user as { id?: string }).id

  const payload = await req.json() as { noteId?: string; body?: string }
  if (!payload.noteId) {
    return NextResponse.json({ error: 'noteId required' }, { status: 400 })
  }
  if (!payload.body || payload.body.trim().length === 0) {
    return NextResponse.json({ error: 'Note body required' }, { status: 400 })
  }

  const existing = await db.licensingNote.findUnique({
    where: { id: payload.noteId },
    select: { id: true, agentProfileId: true, authorId: true, scope: true },
  })
  if (!existing || existing.agentProfileId !== id) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  const admin = isAdmin(session)
  if (!admin && existing.authorId !== userId) {
    return NextResponse.json({ error: 'You can only edit your own notes' }, { status: 403 })
  }
  if (!admin && existing.scope === 'ADMIN_ONLY') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const note = await db.licensingNote.update({
    where: { id: existing.id },
    data: { body: payload.body.trim() },
    include: {
      author: { select: { id: true, name: true, role: true } },
    },
  })

  return NextResponse.json({ note })
}
