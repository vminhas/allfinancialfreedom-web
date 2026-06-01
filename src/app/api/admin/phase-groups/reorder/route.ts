import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { orderedIds } = await req.json() as { orderedIds: string[] }
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'orderedIds array required' }, { status: 400 })
  }

  await Promise.all(
    orderedIds.map((id, idx) =>
      db.phaseGroupDefinition.update({ where: { id }, data: { sortOrder: idx } })
    )
  )

  return NextResponse.json({ ok: true })
}
