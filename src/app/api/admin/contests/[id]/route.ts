import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getContestParticipants } from '@/lib/contests'

const VALID_REQ_TYPES = new Set(['PHASE_ITEM', 'MILESTONE', 'RECRUITS', 'POLICIES', 'MANUAL', 'CUSTOM_TEXT'])

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

// GET /api/admin/contests/[id]
//
// Full contest record + per-eligible-agent participation rows.
// Lets the admin UI render the matrix without a second round-trip.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const contest = await db.contest.findUnique({
    where: { id },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })
  if (!contest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const participants = await getContestParticipants(id)
  return NextResponse.json({ contest, participants })
}

// PATCH /api/admin/contests/[id]
//
// Updates contest fields and replaces requirements wholesale (we
// drop + recreate so we don't have to diff). MANUAL checks tied to
// dropped requirements cascade-delete via the FK.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.contest.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    title?: string
    description?: string | null
    rewardAmount?: number | null
    rewardLabel?: string | null
    anchor?: 'ICA_DATE' | 'ONBOARDING' | 'PHASE_START' | 'FIXED'
    durationDays?: number | null
    fixedStartAt?: string | null
    fixedEndAt?: string | null
    eligibleFromAt?: string | null
    eligibleToAt?: string | null
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

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.rewardAmount !== undefined) data.rewardAmount = body.rewardAmount
  if (body.rewardLabel !== undefined) data.rewardLabel = body.rewardLabel?.trim() || null
  if (body.anchor !== undefined) data.anchor = body.anchor
  if (body.durationDays !== undefined) data.durationDays = body.durationDays
  if (body.fixedStartAt !== undefined) data.fixedStartAt = body.fixedStartAt ? new Date(body.fixedStartAt) : null
  if (body.fixedEndAt !== undefined) data.fixedEndAt = body.fixedEndAt ? new Date(body.fixedEndAt) : null
  if (body.eligibleFromAt !== undefined) data.eligibleFromAt = body.eligibleFromAt ? new Date(body.eligibleFromAt) : null
  if (body.eligibleToAt !== undefined) data.eligibleToAt = body.eligibleToAt ? new Date(body.eligibleToAt) : null
  if (body.active !== undefined) data.active = body.active
  if (body.discordChannelId !== undefined) data.discordChannelId = body.discordChannelId?.trim() || null
  if (body.trackerShowMissed !== undefined) data.trackerShowMissed = body.trackerShowMissed === true

  await db.$transaction(async tx => {
    if (Object.keys(data).length > 0) {
      await tx.contest.update({ where: { id }, data })
    }
    if (body.requirements) {
      const reqs = body.requirements.filter(r => r.label?.trim() && VALID_REQ_TYPES.has(r.type))
      await tx.contestRequirement.deleteMany({ where: { contestId: id } })
      await tx.contestRequirement.createMany({
        data: reqs.map((r, i) => ({
          contestId: id,
          order: r.order ?? i,
          label: r.label.trim(),
          type: r.type as 'PHASE_ITEM' | 'MILESTONE' | 'RECRUITS' | 'POLICIES' | 'MANUAL' | 'CUSTOM_TEXT',
          phaseItemKey: r.phaseItemKey?.trim() || null,
          milestoneKey: r.milestoneKey?.trim() || null,
          count: r.count ?? null,
          defaultCompleted: r.defaultCompleted === true,
        })),
      })
    }
  })

  const updated = await db.contest.findUnique({
    where: { id },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json({ contest: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  await db.contest.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
