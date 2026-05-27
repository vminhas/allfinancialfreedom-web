import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail } from '@/lib/agent-identity'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getAgentProfileIdFromEmail(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const statements = await db.whyStatement.findMany({
    where: { agentProfileId: profileId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ statements })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getAgentProfileIdFromEmail(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { content } = await req.json() as { content?: string }
  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const statement = await db.whyStatement.create({
    data: { agentProfileId: profileId, content: content.trim() },
  })

  await db.personalFinancialReview.upsert({
    where: { agentProfileId: profileId },
    create: { agentProfileId: profileId, whyStatement: content.trim() },
    update: { whyStatement: content.trim() },
  })

  return NextResponse.json({ statement })
}
