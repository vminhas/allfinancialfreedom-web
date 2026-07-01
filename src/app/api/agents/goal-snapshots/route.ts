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

  const snapshots = await db.goalSnapshot.findMany({
    where: { agentProfileId: profileId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ snapshots })
}

export async function POST(req: NextRequest) {
  const profileId = await resolveProfileId(req)
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { goals?: { timeFrame: string; dream: string; why: string }[] }
  if (!Array.isArray(body.goals)) {
    return NextResponse.json({ error: 'goals array required' }, { status: 400 })
  }
  const goalsJson = body.goals as { timeFrame: string; dream: string; why: string }[]

  const snapshot = await db.goalSnapshot.create({
    data: { agentProfileId: profileId, goals: goalsJson },
  })

  await db.personalFinancialReview.upsert({
    where: { agentProfileId: profileId },
    create: { agentProfileId: profileId, dreamsAndGoals: goalsJson },
    update: { dreamsAndGoals: goalsJson },
  })

  return NextResponse.json({ snapshot })
}
