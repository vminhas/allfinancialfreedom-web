import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHASE_ITEMS, PHASE_GROUPS } from '@/lib/agent-constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbItems = await db.phaseItemDefinition.findMany({
    orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
  })

  if (dbItems.length > 0) {
    const itemsByPhase: Record<number, typeof dbItems> = {}
    for (const item of dbItems) {
      if (!itemsByPhase[item.phase]) itemsByPhase[item.phase] = []
      itemsByPhase[item.phase].push(item)
    }
    return NextResponse.json({ items: itemsByPhase, groups: PHASE_GROUPS, source: 'database' })
  }

  return NextResponse.json({ items: PHASE_ITEMS, groups: PHASE_GROUPS, source: 'constants' })
}
