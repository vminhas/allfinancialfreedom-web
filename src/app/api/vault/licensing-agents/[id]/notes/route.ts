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
  return NextResponse.json({ note })
}
