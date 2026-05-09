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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.climbMilestone.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    pointThreshold?: number
    title?: string
    tagline?: string | null
    description?: string | null
    rewardType?: string
    rewardPayload?: unknown
    iconKey?: string | null
    accentColor?: string | null
    active?: boolean
    order?: number
  }

  const data: Record<string, unknown> = {}
  if (body.pointThreshold !== undefined) data.pointThreshold = Math.round(body.pointThreshold)
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.tagline !== undefined) data.tagline = body.tagline?.trim() || null
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.rewardType !== undefined) {
    if (!VALID_REWARD_TYPES.includes(body.rewardType as ClimbRewardType)) {
      return NextResponse.json({ error: 'rewardType invalid' }, { status: 400 })
    }
    data.rewardType = body.rewardType
  }
  if (body.rewardPayload !== undefined) data.rewardPayload = body.rewardPayload as object
  if (body.iconKey !== undefined) data.iconKey = body.iconKey?.trim() || null
  if (body.accentColor !== undefined) data.accentColor = body.accentColor?.trim() || null
  if (body.active !== undefined) data.active = body.active
  if (body.order !== undefined) data.order = body.order

  try {
    const updated = await db.climbMilestone.update({ where: { id }, data })
    return NextResponse.json({ milestone: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    if (msg.includes('Unique')) {
      return NextResponse.json({ error: 'Another milestone is at that point threshold' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  await db.climbMilestone.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
