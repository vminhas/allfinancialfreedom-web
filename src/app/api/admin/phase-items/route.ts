import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { PHASE_ITEMS } from '@/lib/agent-constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  let items = await db.phaseItemDefinition.findMany({
    orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
  })

  // Auto-seed from constants if DB is empty
  if (items.length === 0) {
    const allItems = Object.entries(PHASE_ITEMS).flatMap(([phase, phaseItems]) =>
      phaseItems.map((item, idx) => ({
        phase: parseInt(phase),
        itemKey: item.key,
        label: item.label,
        description: item.description,
        duration: item.duration ?? null,
        groupKey: item.group ?? null,
        sortOrder: idx,
        adminOnly: item.adminOnly ?? false,
        actionJson: item.action ? JSON.stringify(item.action) : null,
        coordinatorTopic: item.coordinatorTopic ?? null,
      }))
    )

    await db.phaseItemDefinition.createMany({ data: allItems, skipDuplicates: true })
    items = await db.phaseItemDefinition.findMany({
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
    })
  }

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    phase: number
    itemKey: string
    label: string
    description: string
    duration?: string
    groupKey?: string
    adminOnly?: boolean
    coordinatorTopic?: string
  }

  if (!body.phase || !body.itemKey || !body.label || !body.description) {
    return NextResponse.json({ error: 'phase, itemKey, label, description required' }, { status: 400 })
  }

  const maxOrder = await db.phaseItemDefinition.findFirst({
    where: { phase: body.phase },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  try {
    const item = await db.phaseItemDefinition.create({
      data: {
        phase: body.phase,
        itemKey: body.itemKey,
        label: body.label,
        description: body.description,
        duration: body.duration,
        groupKey: body.groupKey,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        adminOnly: body.adminOnly ?? false,
        coordinatorTopic: body.coordinatorTopic,
      },
    })
    return NextResponse.json(item)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Item key already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    id: string
    label?: string
    description?: string
    duration?: string | null
    groupKey?: string | null
    sortOrder?: number
    adminOnly?: boolean
    coordinatorTopic?: string | null
    actionJson?: string | null
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) data.label = body.label
  if (body.description !== undefined) data.description = body.description
  if (body.duration !== undefined) data.duration = body.duration
  if (body.groupKey !== undefined) data.groupKey = body.groupKey
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
  if (body.adminOnly !== undefined) data.adminOnly = body.adminOnly
  if (body.coordinatorTopic !== undefined) data.coordinatorTopic = body.coordinatorTopic
  if (body.actionJson !== undefined) data.actionJson = body.actionJson

  const item = await db.phaseItemDefinition.update({ where: { id: body.id }, data })
  return NextResponse.json(item)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.phaseItemDefinition.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
