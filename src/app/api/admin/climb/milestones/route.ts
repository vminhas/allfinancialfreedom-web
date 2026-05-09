import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import type { ClimbRewardType } from '@/generated/prisma/client'

const VALID_REWARD_TYPES: ClimbRewardType[] = ['BADGE', 'DISCORD_CALLOUT', 'ARTICLE', 'CUSTOM']

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

// GET — list milestones with achievement counts so admin can see
// uptake at a glance.
export async function GET() {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const milestones = await db.climbMilestone.findMany({
    orderBy: { pointThreshold: 'asc' },
    include: {
      _count: { select: { achievements: true } },
    },
  })
  return NextResponse.json({ milestones })
}

// POST — create a new milestone.
export async function POST(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    pointThreshold?: number
    title?: string
    tagline?: string
    description?: string
    rewardType?: string
    rewardPayload?: unknown
    iconKey?: string
    accentColor?: string
    active?: boolean
    order?: number
  }

  if (typeof body.pointThreshold !== 'number' || body.pointThreshold < 0) {
    return NextResponse.json({ error: 'pointThreshold required (positive integer)' }, { status: 400 })
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  if (!body.rewardType || !VALID_REWARD_TYPES.includes(body.rewardType as ClimbRewardType)) {
    return NextResponse.json({ error: 'rewardType invalid' }, { status: 400 })
  }

  try {
    const created = await db.climbMilestone.create({
      data: {
        pointThreshold: Math.round(body.pointThreshold),
        title: body.title.trim(),
        tagline: body.tagline?.trim() || null,
        description: body.description?.trim() || null,
        rewardType: body.rewardType as ClimbRewardType,
        rewardPayload: (body.rewardPayload ?? {}) as object,
        iconKey: body.iconKey?.trim() || null,
        accentColor: body.accentColor?.trim() || null,
        active: body.active !== false,
        order: body.order ?? Math.round(body.pointThreshold),
      },
    })
    return NextResponse.json({ milestone: created })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    if (msg.includes('Unique')) {
      return NextResponse.json({ error: `A milestone at ${body.pointThreshold} points already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
