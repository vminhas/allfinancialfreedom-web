import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/admin/phase-items/slots — add a slot to a phase item definition
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as {
    phaseItemDefinitionId: string
    label: string
    slotType: 'business_partner' | 'field_appointment'
    sortOrder?: number
  }

  if (!body.phaseItemDefinitionId || !body.label || !body.slotType) {
    return NextResponse.json({ error: 'phaseItemDefinitionId, label, slotType required' }, { status: 400 })
  }

  const maxOrder = await db.phaseItemSlotDef.findFirst({
    where: { phaseItemDefinitionId: body.phaseItemDefinitionId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const slot = await db.phaseItemSlotDef.create({
    data: {
      phaseItemDefinitionId: body.phaseItemDefinitionId,
      label: body.label,
      slotType: body.slotType,
      sortOrder: body.sortOrder ?? (maxOrder?.sortOrder ?? -1) + 1,
    },
  })

  return NextResponse.json(slot)
}

// DELETE /api/admin/phase-items/slots?id=xxx — remove a slot definition
// Also clears all agent fulfillments for that slot (cascade via FK).
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.phaseItemSlotDef.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
