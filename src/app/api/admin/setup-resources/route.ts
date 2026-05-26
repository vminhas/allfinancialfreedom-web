import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// Phase ranks are 1-6 (Onboarding through NVP). Anything outside that
// range falls back to 1 so a typo can't permanently lock a resource.
function clampPhase(n: unknown): number {
  const v = typeof n === 'number' ? Math.floor(n) : Number(n)
  if (!Number.isFinite(v) || v < 1) return 1
  if (v > 6) return 6
  return v
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const resources = await db.setupResource.findMany({
    orderBy: { category: 'asc' },
  })
  return NextResponse.json({ resources })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as {
    key: string
    label: string
    url: string
    category?: string
    description?: string
    callType?: string | null
    unlocksAtPhase?: number
  }

  if (!body.key || !body.label || !body.url) {
    return NextResponse.json({ error: 'key, label, url required' }, { status: 400 })
  }

  const VALID_CALL_TYPES = new Set(['RECRUIT', 'FOLLOW_UP', 'CLIENT_APPOINTMENT', 'OTHER'])
  const callType = body.callType && VALID_CALL_TYPES.has(body.callType)
    ? (body.callType as 'RECRUIT' | 'FOLLOW_UP' | 'CLIENT_APPOINTMENT' | 'OTHER')
    : null

  const unlocksAtPhase = clampPhase(body.unlocksAtPhase)

  try {
    const resource = await db.$transaction(async tx => {
      // Move the script tag off any other resource that currently
      // owns this CallType, so there's exactly one script per type.
      if (callType) {
        await tx.setupResource.updateMany({
          where: { callType },
          data: { callType: null },
        })
      }
      return tx.setupResource.create({
        data: {
          key: body.key,
          label: body.label,
          url: body.url,
          category: body.category ?? 'general',
          description: body.description,
          callType,
          unlocksAtPhase,
        },
      })
    })
    return NextResponse.json(resource)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Key already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    label?: string
    url?: string
    category?: string
    description?: string
    callType?: string | null
    rawScriptContent?: string | null
    aiScriptOutline?: string | null
    unlocksAtPhase?: number
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const VALID_CALL_TYPES = new Set(['RECRUIT', 'FOLLOW_UP', 'CLIENT_APPOINTMENT', 'OTHER'])

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) data.label = body.label
  if (body.url !== undefined) data.url = body.url
  if (body.category !== undefined) data.category = body.category
  if (body.description !== undefined) data.description = body.description
  if (body.rawScriptContent !== undefined) data.rawScriptContent = body.rawScriptContent || null
  if (body.aiScriptOutline !== undefined) data.aiScriptOutline = body.aiScriptOutline || null
  if (body.unlocksAtPhase !== undefined) data.unlocksAtPhase = clampPhase(body.unlocksAtPhase)

  const wantsCallType = body.callType !== undefined
  const callType = wantsCallType
    ? (body.callType && VALID_CALL_TYPES.has(body.callType)
        ? body.callType as 'RECRUIT' | 'FOLLOW_UP' | 'CLIENT_APPOINTMENT' | 'OTHER'
        : null)
    : undefined
  if (wantsCallType) data.callType = callType

  const resource = await db.$transaction(async tx => {
    if (wantsCallType && callType) {
      await tx.setupResource.updateMany({
        where: { callType, NOT: { id: body.id } },
        data: { callType: null },
      })
    }
    return tx.setupResource.update({
      where: { id: body.id },
      data,
    })
  })
  return NextResponse.json(resource)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.setupResource.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
