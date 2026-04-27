import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function getProfileId(email: string) {
  const u = await db.agentUser.findUnique({
    where: { email },
    include: { profile: { select: { id: true } } },
  })
  return u?.profile?.id ?? null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { message, category } = await req.json() as { message: string; category?: string }
  if (!message || message.trim().length < 5) {
    return NextResponse.json({ error: 'Message too short' }, { status: 400 })
  }

  const feedback = await db.agentFeedback.create({
    data: {
      agentProfileId: profileId,
      message: message.trim(),
      category: category ?? 'general',
    },
  })

  return NextResponse.json({ ok: true, id: feedback.id })
}
