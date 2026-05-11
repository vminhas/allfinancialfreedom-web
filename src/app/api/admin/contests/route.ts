import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/contests — list all contests (active + inactive)
// POST /api/admin/contests — create a new contest with requirements

const VALID_ANCHORS = new Set(['ICA_DATE', 'ONBOARDING', 'PHASE_START', 'FIXED'])
const VALID_REQ_TYPES = new Set(['PHASE_ITEM', 'MILESTONE', 'RECRUITS', 'POLICIES', 'MANUAL', 'CUSTOM_TEXT'])

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

export async function GET() {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contests = await db.contest.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    include: { requirements: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json({ contests })
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    title?: string
    description?: string
    rewardAmount?: number
    rewardLabel?: string
    anchor?: string
    durationDays?: number
    fixedStartAt?: string
    fixedEndAt?: string
    eligibleFromAt?: string
    eligibleToAt?: string
    active?: boolean
    discordChannelId?: string | null
    trackerShowMissed?: boolean
    requirements?: Array<{
      label: string
      type: string
      order?: number
      phaseItemKey?: string | null
      milestoneKey?: string | null
      count?: number | null
      defaultCompleted?: boolean
    }>
  }

  if (!body.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!body.anchor || !VALID_ANCHORS.has(body.anchor)) {
    return NextResponse.json({ error: 'Invalid anchor' }, { status: 400 })
  }
  if (body.anchor !== 'FIXED' && !body.durationDays) {
    return NextResponse.json({ error: 'durationDays required for non-FIXED anchors' }, { status: 400 })
  }
  if (body.anchor === 'FIXED' && (!body.fixedStartAt || !body.fixedEndAt)) {
    return NextResponse.json({ error: 'fixedStartAt + fixedEndAt required for FIXED anchor' }, { status: 400 })
  }

  const reqs = (body.requirements ?? []).filter(r => r.label?.trim() && VALID_REQ_TYPES.has(r.type))

  const created = await db.contest.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      rewardAmount: body.rewardAmount ?? null,
      rewardLabel: body.rewardLabel?.trim() || null,
      anchor: body.anchor as 'ICA_DATE' | 'ONBOARDING' | 'PHASE_START' | 'FIXED',
      durationDays: body.durationDays ?? null,
      fixedStartAt: body.fixedStartAt ? new Date(body.fixedStartAt) : null,
      fixedEndAt: body.fixedEndAt ? new Date(body.fixedEndAt) : null,
      eligibleFromAt: body.eligibleFromAt ? new Date(body.eligibleFromAt) : null,
      eligibleToAt: body.eligibleToAt ? new Date(body.eligibleToAt) : null,
      active: body.active !== false,
      discordChannelId: body.discordChannelId?.trim() || null,
      trackerShowMissed: body.trackerShowMissed === true,
      requirements: {
        create: reqs.map((r, i) => ({
          order: r.order ?? i,
          label: r.label.trim(),
          type: r.type as 'PHASE_ITEM' | 'MILESTONE' | 'RECRUITS' | 'POLICIES' | 'MANUAL' | 'CUSTOM_TEXT',
          phaseItemKey: r.phaseItemKey?.trim() || null,
          milestoneKey: r.milestoneKey?.trim() || null,
          count: r.count ?? null,
          defaultCompleted: r.defaultCompleted === true,
        })),
      },
    },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json({ contest: created })
}
