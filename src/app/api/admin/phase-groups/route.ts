import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { PHASE_GROUPS } from '@/lib/agent-constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  let groups = await db.phaseGroupDefinition.findMany({
    orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
  })

  if (groups.length === 0) {
    const allGroups = Object.entries(PHASE_GROUPS).flatMap(([phase, phaseGroups]) =>
      phaseGroups.map((g, idx) => ({
        phase: parseInt(phase),
        groupKey: g.key,
        label: g.label,
        icon: g.icon ?? null,
        description: g.description ?? null,
        showTrainer: g.showTrainer ?? false,
        sortOrder: idx,
      }))
    )
    await db.phaseGroupDefinition.createMany({ data: allGroups, skipDuplicates: true })
    groups = await db.phaseGroupDefinition.findMany({ orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] })
  }

  return NextResponse.json({ groups })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { phase: number; groupKey: string; label: string; icon?: string; description?: string; showTrainer?: boolean }
  if (!body.phase || !body.groupKey || !body.label) return NextResponse.json({ error: 'phase, groupKey, label required' }, { status: 400 })

  const maxOrder = await db.phaseGroupDefinition.findFirst({ where: { phase: body.phase }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
  const group = await db.phaseGroupDefinition.create({
    data: { phase: body.phase, groupKey: body.groupKey, label: body.label, icon: body.icon, description: body.description, showTrainer: body.showTrainer ?? false, sortOrder: (maxOrder?.sortOrder ?? -1) + 1 },
  })
  return NextResponse.json(group)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { id: string; label?: string; icon?: string; description?: string; showTrainer?: boolean }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) data.label = body.label
  if (body.icon !== undefined) data.icon = body.icon
  if (body.description !== undefined) data.description = body.description
  if (body.showTrainer !== undefined) data.showTrainer = body.showTrainer

  const group = await db.phaseGroupDefinition.update({ where: { id: body.id }, data })
  return NextResponse.json(group)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.phaseGroupDefinition.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
