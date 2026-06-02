import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'

const EDIT_WINDOW_MS = 5 * 60 * 1000

async function resolveAuthor(req: NextRequest) {
  const url = new URL(req.url)
  const previewToken = url.searchParams.get('preview')
  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        const profile = await db.agentProfile.findUnique({
          where: { id: data.agentProfileId },
          select: { id: true, firstName: true, lastName: true },
        })
        if (profile) return { id: profile.id, name: `${profile.firstName} ${profile.lastName}`, role: 'admin', profileId: profile.id }
      }
    }
  }

  const session = await getServerSession(authOptions)
  if (!session) return null
  const role = (session.user as { role?: string })?.role ?? ''
  const email = session.user?.email
  if (!email) return null

  if (role === 'agent') {
    const agent = await db.agentUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { profile: { select: { id: true, firstName: true, lastName: true } } },
    })
    if (!agent?.profile) return null
    return { id: agent.profile.id, name: `${agent.profile.firstName} ${agent.profile.lastName}`, role: 'agent', profileId: agent.profile.id }
  }

  if (role === 'admin' || role === 'licensing_coordinator') {
    const admin = await db.adminUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, role: true },
    })
    if (!admin) return null
    return { id: admin.id, name: admin.name, role: admin.role.toLowerCase(), profileId: null as string | null }
  }

  return null
}

async function canAccessPartner(author: { role: string; profileId: string | null; id: string }, partnerId: string) {
  const partner = await db.businessPartner.findUnique({ where: { id: partnerId }, select: { agentProfileId: true } })
  if (!partner) return false

  if (author.role === 'agent') return partner.agentProfileId === author.profileId
  if (author.role === 'admin' || author.role === 'licensing_coordinator') return true

  return false
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const author = await resolveAuthor(req)
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: partnerId } = await ctx.params
  if (!(await canAccessPartner(author, partnerId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const notes = await db.contactNote.findMany({
    where: { businessPartnerId: partnerId },
    orderBy: { createdAt: 'asc' },
  })

  const now = Date.now()
  return NextResponse.json({
    notes: notes.map(n => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
      editedAt: n.editedAt?.toISOString() ?? null,
      canEdit: n.authorId === author.id && (now - n.createdAt.getTime()) < EDIT_WINDOW_MS,
    })),
  })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const author = await resolveAuthor(req)
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: partnerId } = await ctx.params
  if (!(await canAccessPartner(author, partnerId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { message } = await req.json() as { message: string }
  if (!message || message.trim().length < 1) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const note = await db.contactNote.create({
    data: {
      businessPartnerId: partnerId,
      authorRole: author.role,
      authorName: author.name,
      authorId: author.id,
      message: message.trim(),
    },
  })

  return NextResponse.json({
    note: { ...note, createdAt: note.createdAt.toISOString(), editedAt: null, canEdit: true },
  })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const author = await resolveAuthor(req)
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: partnerId } = await ctx.params
  void partnerId

  const { noteId, message } = await req.json() as { noteId: string; message: string }
  if (!noteId || !message?.trim()) {
    return NextResponse.json({ error: 'noteId and message required' }, { status: 400 })
  }

  const note = await db.contactNote.findUnique({ where: { id: noteId } })
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  if (note.authorId !== author.id) return NextResponse.json({ error: 'Not your note' }, { status: 403 })

  const elapsed = Date.now() - note.createdAt.getTime()
  if (elapsed > EDIT_WINDOW_MS) {
    return NextResponse.json({ error: 'Edit window expired (5 minutes)' }, { status: 403 })
  }

  const updated = await db.contactNote.update({
    where: { id: noteId },
    data: { message: message.trim(), editedAt: new Date() },
  })

  return NextResponse.json({
    note: { ...updated, createdAt: updated.createdAt.toISOString(), editedAt: updated.editedAt?.toISOString() ?? null, canEdit: true },
  })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const author = await resolveAuthor(req)
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: partnerId } = await ctx.params
  if (!(await canAccessPartner(author, partnerId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const noteId = new URL(req.url).searchParams.get('noteId')
  if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })

  const note = await db.contactNote.findUnique({ where: { id: noteId } })
  if (!note || note.businessPartnerId !== partnerId) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  await db.contactNote.delete({ where: { id: noteId } })
  return NextResponse.json({ ok: true })
}
