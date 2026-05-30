import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAgentProfileIdFromEmail as getProfileId } from '@/lib/agent-identity'
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
    return getProfileId(session.user!.email!)
  }

  return null
}

export async function GET(req: NextRequest) {
  const profileId = await resolveProfileId(req)
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pfr = await db.personalFinancialReview.findUnique({ where: { agentProfileId: profileId } })
  return NextResponse.json({ pfr })
}

export async function PUT(req: NextRequest) {
  const profileId = await resolveProfileId(req)
  if (!profileId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    monthlyIncome?: number
    expenses?: Record<string, number>
    assets?: Record<string, number>
    debts?: Record<string, number>
    buckets?: Record<string, number>
    retirementAge?: number | null
    spouseRetAge?: number | null
    desiredMonthlyRetirement?: number
    monthlySavingsCommitment?: number
    whatWouldThisDo?: string
    whatIsStopping?: string
    dreamsAndGoals?: { timeFrame: string; dream: string; why: string }[]
    visionBoardUrl?: string | null
    whyStatement?: string
    notes?: string
  }

  const data: Record<string, unknown> = {}
  if (body.monthlyIncome !== undefined) data.monthlyIncome = body.monthlyIncome
  if (body.expenses !== undefined) data.expenses = body.expenses
  if (body.assets !== undefined) data.assets = body.assets
  if (body.debts !== undefined) data.debts = body.debts
  if (body.buckets !== undefined) data.buckets = body.buckets
  if (body.retirementAge !== undefined) data.retirementAge = body.retirementAge
  if (body.spouseRetAge !== undefined) data.spouseRetAge = body.spouseRetAge
  if (body.desiredMonthlyRetirement !== undefined) data.desiredMonthlyRetirement = body.desiredMonthlyRetirement
  if (body.monthlySavingsCommitment !== undefined) data.monthlySavingsCommitment = body.monthlySavingsCommitment
  if (body.whatWouldThisDo !== undefined) data.whatWouldThisDo = body.whatWouldThisDo
  if (body.whatIsStopping !== undefined) data.whatIsStopping = body.whatIsStopping
  if (body.dreamsAndGoals !== undefined) data.dreamsAndGoals = body.dreamsAndGoals
  if (body.visionBoardUrl !== undefined) data.visionBoardUrl = body.visionBoardUrl
  if (body.whyStatement !== undefined) data.whyStatement = body.whyStatement
  if (body.notes !== undefined) data.notes = body.notes

  const pfr = await db.personalFinancialReview.upsert({
    where: { agentProfileId: profileId },
    create: { agentProfileId: profileId, ...data },
    update: data,
  })

  return NextResponse.json({ pfr })
}
