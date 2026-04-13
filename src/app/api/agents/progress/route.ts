import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHASE_ITEMS } from '@/lib/agent-constants'

// PUT /api/agents/progress — toggle a phase item checkbox
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemKey, phase, completed } = await req.json() as {
    itemKey: string
    phase: number
    completed: boolean
  }

  if (!itemKey || !phase) {
    return NextResponse.json({ error: 'itemKey and phase required' }, { status: 400 })
  }

  const agentUser = await db.agentUser.findUnique({
    where: { email: session.user!.email! },
    include: { profile: { select: { id: true, phase: true } } },
  })
  if (!agentUser?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Only allow updating items in current phase
  if (phase !== agentUser.profile.phase) {
    return NextResponse.json({ error: 'Can only update current phase items' }, { status: 403 })
  }

  // Validate item key exists in phase
  const validKeys = PHASE_ITEMS[phase]?.map(i => i.key) ?? []
  if (!validKeys.includes(itemKey)) {
    return NextResponse.json({ error: 'Invalid item key for this phase' }, { status: 400 })
  }

  const item = await db.phaseItem.upsert({
    where: {
      agentProfileId_phase_itemKey: {
        agentProfileId: agentUser.profile.id,
        phase,
        itemKey,
      },
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
    },
    create: {
      agentProfileId: agentUser.profile.id,
      phase,
      itemKey,
      completed,
      completedAt: completed ? new Date() : null,
    },
  })

  return NextResponse.json(item)
}
