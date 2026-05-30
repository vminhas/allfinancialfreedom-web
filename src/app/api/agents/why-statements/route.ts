import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail } from '@/lib/agent-identity'
import { getSetting } from '@/lib/settings'

async function resolveProfileId(req: NextRequest): Promise<string | null> {
  const url = new URL(req.url)

  const previewToken = url.searchParams.get('preview')
  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) return data.agentProfileId
    }
  }

  const session = await getServerSession(authOptions)
  if (!session) return null
  const role = (session.user as { role?: string }).role

  if (role === 'admin') {
    return url.searchParams.get('agentProfileId')
  }

  if (role === 'agent') {
    return getAgentProfileIdFromEmail(session.user!.email!)
  }

  return null
}

export async function GET(req: NextRequest) {
  const profileId = await resolveProfileId(req)
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const statements = await db.whyStatement.findMany({
    where: { agentProfileId: profileId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ statements })
}

export async function POST(req: NextRequest) {
  const profileId = await resolveProfileId(req)
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
