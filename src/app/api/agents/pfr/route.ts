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

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'agent' && role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (role === 'agent') {
    const profileId = await getProfileId(session.user!.email!)
    if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    const pfr = await db.personalFinancialReview.findUnique({ where: { agentProfileId: profileId } })
    return NextResponse.json({ pfr })
  }

  return NextResponse.json({ error: 'Use vault endpoint for admin access' }, { status: 400 })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profileId = await getProfileId(session.user!.email!)
  if (!profileId) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

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
  if (body.notes !== undefined) data.notes = body.notes

  const pfr = await db.personalFinancialReview.upsert({
    where: { agentProfileId: profileId },
    create: { agentProfileId: profileId, ...data },
    update: data,
  })

  return NextResponse.json({ pfr })
}
