import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'

// GET /api/admin/agents — list all agents with phase progress
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const phase      = searchParams.get('phase')
  const status     = searchParams.get('status')
  const cft        = searchParams.get('cft')
  const icaStart   = searchParams.get('icaStart')
  const icaEnd     = searchParams.get('icaEnd')
  const atRisk     = searchParams.get('atRisk') === '1'
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const skip  = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (phase)  where.phase  = parseInt(phase)
  if (status) where.status = status.toUpperCase()
  if (cft)    where.cft    = cft
  if (icaStart || icaEnd) {
    const icaFilter: Record<string, Date> = {}
    if (icaStart && !isNaN(Date.parse(icaStart))) icaFilter.gte = new Date(icaStart)
    if (icaEnd && !isNaN(Date.parse(icaEnd)))     icaFilter.lte = new Date(icaEnd + 'T23:59:59')
    if (Object.keys(icaFilter).length > 0) where.icaDate = icaFilter
  }
  // atRisk filter is applied post-query (requires computed fields)
  void atRisk

  const [profiles, total] = await Promise.all([
    db.agentProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        agentUser: { select: { email: true, lastLoginAt: true } },
        phaseItems: { select: { phase: true, completed: true } },
        carrierAppointments: { select: { status: true } },
        _count: { select: { milestones: true } },
      },
    }),
    db.agentProfile.count({ where }),
  ])

  // Pull 30-day call review aggregates for all profiles in one query
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentReviews = await db.callReview.findMany({
    where: {
      agentProfileId: { in: profiles.map(p => p.id) },
      reviewedAt: { gte: thirtyDaysAgo },
    },
    select: { agentProfileId: true, overallScore: true, flaggedForCoaching: true, discussedAt: true },
  })
  const reviewAggByAgent = new Map<string, { sum: number; count: number; flagged: number }>()
  for (const r of recentReviews) {
    const a = reviewAggByAgent.get(r.agentProfileId) ?? { sum: 0, count: 0, flagged: 0 }
    a.sum += r.overallScore
    a.count += 1
    if (r.flaggedForCoaching && !r.discussedAt) a.flagged += 1
    reviewAggByAgent.set(r.agentProfileId, a)
  }

  const agents = profiles.map(p => {
    const phaseTotal = PHASE_ITEMS[p.phase]?.length ?? 0
    const phaseCompleted = p.phaseItems.filter(
      i => i.phase === p.phase && i.completed
    ).length
    const appointed = p.carrierAppointments.filter(c => c.status === 'APPOINTED').length
    const agg = reviewAggByAgent.get(p.id)

    return {
      id: p.id,
      agentCode: p.agentCode,
      firstName: p.firstName,
      lastName: p.lastName,
      state: p.state,
      phase: p.phase,
      phaseStartedAt: p.phaseStartedAt,
      status: p.status,
      goal: p.goal,
      cft: p.cft,
      email: p.agentUser.email,
      lastLoginAt: p.agentUser.lastLoginAt,
      icaDate: p.icaDate,
      phaseCompleted,
      phaseTotal,
      carriersAppointed: appointed,
      carriersTotal: CARRIERS.length,
      milestoneCount: p._count.milestones,
      createdAt: p.createdAt,
      callScore30d: agg && agg.count > 0 ? Math.round(agg.sum / agg.count) : null,
      callReviewCount30d: agg?.count ?? 0,
      openCoachingFlags: agg?.flagged ?? 0,
    }
  })

  return NextResponse.json({ agents, total, page, limit })
}

// POST /api/admin/agents — create new agent + AgentUser + seed items
// Both admins and licensing coordinators can create agents (LC onboards them)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    firstName: string
    lastName: string
    email: string
    agentCode: string
    state?: string
    phone?: string
    icaDate?: string
    recruiterId?: string
    cft?: string
    goal?: string
    initialPointOfContact?: string
  }

  if (!body.firstName || !body.lastName || !body.email || !body.agentCode) {
    return NextResponse.json({ error: 'firstName, lastName, email, agentCode required' }, { status: 400 })
  }

  const inviteToken = randomUUID()
  const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours

  try {
    const agentUser = await db.agentUser.create({
      data: {
        email: body.email.toLowerCase(),
        inviteToken,
        inviteExpires,
        profile: {
          create: {
            agentCode: body.agentCode.toUpperCase(),
            firstName: body.firstName,
            lastName: body.lastName,
            state: body.state,
            phone: body.phone,
            icaDate: body.icaDate ? new Date(body.icaDate) : null,
            recruiterId: body.recruiterId,
            cft: body.cft,
            goal: body.goal,
            initialPointOfContact: body.initialPointOfContact,
            phase: 1,
            phaseStartedAt: new Date(),
            // Seed phase 1 items
            phaseItems: {
              create: PHASE_ITEMS[1].map(item => ({
                phase: 1,
                itemKey: item.key,
                completed: false,
              })),
            },
            // Seed all carrier appointments
            carrierAppointments: {
              create: CARRIERS.map(carrier => ({
                carrier,
                status: 'NOT_STARTED',
              })),
            },
          },
        },
      },
      include: { profile: true },
    })

    return NextResponse.json({
      ok: true,
      agentUserId: agentUser.id,
      profileId: agentUser.profile?.id,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Email or agent code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
