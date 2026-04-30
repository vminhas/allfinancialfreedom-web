import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail as getProfileId } from '@/lib/agent-identity'

// GET /api/agents/feedback - the calling agent's own feedback history
// with status + response. Drives the "Your feedback" panel on the
// tracker so agents can see what they've submitted and where it landed.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const feedback = await db.agentFeedback.findMany({
    where: { agentProfileId: profileId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      category: true,
      message: true,
      status: true,
      responseToAgent: true,
      reviewedAt: true,
      closedAt: true,
      createdAt: true,
    },
    take: 25,
  })

  return NextResponse.json({ feedback })
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
