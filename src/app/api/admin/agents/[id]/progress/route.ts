import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHASE_ITEMS } from '@/lib/agent-constants'
import { requireRole } from '@/lib/permissions'

// PUT /api/admin/agents/[id]/progress — admin toggles a phase item on behalf of an agent
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await params

  const { itemKey, phase, completed } = await req.json() as {
    itemKey: string
    phase: number
    completed: boolean
  }

  if (!itemKey || !phase) {
    return NextResponse.json({ error: 'itemKey and phase required' }, { status: 400 })
  }

  const validKeys = PHASE_ITEMS[phase]?.map(i => i.key) ?? []
  if (!validKeys.includes(itemKey)) {
    return NextResponse.json({ error: 'Invalid item key for this phase' }, { status: 400 })
  }

  // Verify agent exists
  const profile = await db.agentProfile.findUnique({ where: { id }, select: { id: true } })
  if (!profile) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const item = await db.phaseItem.upsert({
    where: {
      agentProfileId_phase_itemKey: {
        agentProfileId: id,
        phase,
        itemKey,
      },
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
    },
    create: {
      agentProfileId: id,
      phase,
      itemKey,
      completed,
      completedAt: completed ? new Date() : null,
    },
  })

  return NextResponse.json(item)
}
