import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Local profile-with-phase lookup. Uses the same case-insensitive +
// validated-email pattern as the shared findAgentUserByEmail helper so
// we don't regress the empty-email and email-casing bugs here.
async function getProfileId(email: string | null | undefined) {
  if (typeof email !== 'string' || email.trim().length === 0) return null
  const u = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true, phase: true } } },
  })
  return u?.profile ?? null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getProfileId(session.user!.email!)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Three time gates rolled into one query:
  //   1. expiresAt > now (or null) - has not aged out
  //   2. scheduledFor <= now (or null) - has actually started
  //   3. targetPhase matches the agent's phase (or null = everyone)
  // Plus active flag, plus the agent hasn't already read it.
  const now = new Date()
  const announcements = await db.announcement.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ expiresAt: null },   { expiresAt: { gt: now } }] },
        { OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] },
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
