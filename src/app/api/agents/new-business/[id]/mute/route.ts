import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST   /api/agents/new-business/[id]/mute   → mute (upsert)
// DELETE /api/agents/new-business/[id]/mute   → unmute (delete row)
//
// Mute suppresses the Discord DM on new comments for THIS submission
// only. The in-app notification row + bell-icon ping still fire — so
// muting is a "don't buzz my phone, I'll catch up in-portal" toggle,
// not a way to stop seeing the policy entirely.
//
// Auth: only the writer or the split agent can mute. We don't 403 a
// stranger; we 404 to avoid leaking submission existence.

async function resolveCaller(): Promise<{ profileId: string } | null> {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') return null
  const email = (session.user as { email?: string } | undefined)?.email
  if (typeof email !== 'string' || email.length === 0) return null
  const u = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  return u?.profile ? { profileId: u.profile.id } : null
}

async function checkAccess(submissionId: string, profileId: string): Promise<boolean> {
  const sub = await db.newBusinessSubmission.findUnique({
    where: { id: submissionId },
    select: { agentProfileId: true, splitWithAgentId: true },
  })
  if (!sub) return false
  return sub.agentProfileId === profileId || sub.splitWithAgentId === profileId
}

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await resolveCaller()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!(await checkAccess(id, me.profileId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.newBusinessSubmissionMute.upsert({
    where: { submissionId_agentProfileId: { submissionId: id, agentProfileId: me.profileId } },
    create: { submissionId: id, agentProfileId: me.profileId },
    update: {},
  })
  return NextResponse.json({ ok: true, muted: true })
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await resolveCaller()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!(await checkAccess(id, me.profileId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.newBusinessSubmissionMute.deleteMany({
    where: { submissionId: id, agentProfileId: me.profileId },
  })
  return NextResponse.json({ ok: true, muted: false })
}
