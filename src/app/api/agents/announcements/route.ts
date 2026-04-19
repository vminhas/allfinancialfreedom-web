import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function getProfileId(email: string) {
  const u = await db.agentUser.findUnique({ where: { email }, include: { profile: { select: { id: true, phase: true } } } })
  return u?.profile ?? null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getProfileId(session.user!.email!)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const now = new Date()
  const announcements = await db.announcement.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [
        { OR: [{ targetPhase: null }, { targetPhase: profile.phase }] },
      ],
      reads: { none: { agentProfileId: profile.id } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ announcements })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getProfileId(session.user!.email!)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { announcementId } = await req.json() as { announcementId: string }
  if (!announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 })

  await db.announcementRead.upsert({
    where: { announcementId_agentProfileId: { announcementId, agentProfileId: profile.id } },
    create: { announcementId, agentProfileId: profile.id },
    update: {},
  })

  return NextResponse.json({ ok: true })
}
