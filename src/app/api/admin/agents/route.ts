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
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const phase = searchParams.get('phase')
  const status = searchParams.get('status')
  const cft = searchParams.get('cft')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (phase) where.phase = parseInt(phase)
  if (status) where.status = status.toUpperCase()
  if (cft) where.cft = cft

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

  const agents = profiles.map(p => {
    const phaseTotal = PHASE_ITEMS[p.phase]?.length ?? 0
    const phaseCompleted = p.phaseItems.filter(
      i => i.phase === p.phase && i.completed
    ).length
    const appointed = p.carrierAppointments.filter(c => c.status === 'APPOINTED').length

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
    }
  })

  return NextResponse.json({ agents, total, page, limit })
}

// POST /api/admin/agents — create new agent + AgentUser + seed items
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      inviteToken,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Email or agent code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
