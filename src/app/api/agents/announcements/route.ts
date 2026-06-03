import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  // We still need the agent's phase for the targetPhase filter.
  const profile = await db.agentProfile.findUnique({
    where: { id: id.profileId },
    select: { id: true, phase: true },
  })
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
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const { announcementId } = await req.json() as { announcementId: string }
  if (!announcementId) return NextResponse.json({ error: 'announcementId required' }, { status: 400 })

  await db.announcementRead.upsert({
    where: { announcementId_agentProfileId: { announcementId, agentProfileId: id.profileId } },
    create: { announcementId, agentProfileId: id.profileId },
    update: {},
  })

  return NextResponse.json({ ok: true })
}
