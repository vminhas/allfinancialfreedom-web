import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const announcements = await db.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { reads: true } } },
  })

  return NextResponse.json({ announcements })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    title: string; message: string; targetPhase?: number; expiresAt?: string
  }
  if (!body.title || !body.message) return NextResponse.json({ error: 'title and message required' }, { status: 400 })

  const announcement = await db.announcement.create({
    data: {
      title: body.title,
      message: body.message,
      targetPhase: body.targetPhase ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdBy: session!.user!.email,
    },
  })

  return NextResponse.json(announcement)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { id: string; active?: boolean; title?: string; message?: string; expiresAt?: string | null }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.active !== undefined) data.active = body.active
  if (body.title !== undefined) data.title = body.title
  if (body.message !== undefined) data.message = body.message
  if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null

  const announcement = await db.announcement.update({ where: { id: body.id }, data })
  return NextResponse.json(announcement)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.announcementRead.deleteMany({ where: { announcementId: id } })
  await db.announcement.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
