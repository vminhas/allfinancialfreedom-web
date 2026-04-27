import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { SYSTEM_PROGRESSIONS } from '@/lib/agent-constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  let progressions = await db.progressionDefinition.findMany({ orderBy: { sortOrder: 'asc' } })

  if (progressions.length === 0) {
    await db.progressionDefinition.createMany({
      data: SYSTEM_PROGRESSIONS.map((p, idx) => ({
        key: p.key, label: p.label, description: p.description,
        achievedWhen: p.achievedWhen, sortOrder: idx,
      })),
      skipDuplicates: true,
    })
    progressions = await db.progressionDefinition.findMany({ orderBy: { sortOrder: 'asc' } })
  }

  return NextResponse.json({ progressions })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { key: string; label: string; description: string; icon?: string; achievedWhen: string }
  if (!body.key || !body.label || !body.description || !body.achievedWhen) return NextResponse.json({ error: 'key, label, description, achievedWhen required' }, { status: 400 })

  const maxOrder = await db.progressionDefinition.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
  const prog = await db.progressionDefinition.create({
    data: { key: body.key, label: body.label, description: body.description, icon: body.icon, achievedWhen: body.achievedWhen, sortOrder: (maxOrder?.sortOrder ?? -1) + 1 },
  })
  return NextResponse.json(prog)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { id: string; label?: string; description?: string; icon?: string; achievedWhen?: string }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) data.label = body.label
  if (body.description !== undefined) data.description = body.description
  if (body.icon !== undefined) data.icon = body.icon
  if (body.achievedWhen !== undefined) data.achievedWhen = body.achievedWhen

  const prog = await db.progressionDefinition.update({ where: { id: body.id }, data })
  return NextResponse.json(prog)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.progressionDefinition.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
