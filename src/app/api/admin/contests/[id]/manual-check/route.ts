import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/admin/contests/[id]/manual-check
//
// Tick or untick a MANUAL requirement for a specific agent.
// Body: { requirementId, agentProfileId, completed, notes? }

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: contestId } = await ctx.params

  const body = await req.json() as {
    requirementId: string
    agentProfileId: string
    completed: boolean
    notes?: string
  }
  if (!body.requirementId || !body.agentProfileId) {
    return NextResponse.json({ error: 'requirementId + agentProfileId required' }, { status: 400 })
  }

  // Sanity-check the requirement belongs to this contest and is MANUAL.
  const requirement = await db.contestRequirement.findUnique({ where: { id: body.requirementId } })
  if (!requirement || requirement.contestId !== contestId) {
    return NextResponse.json({ error: 'Requirement not found in this contest' }, { status: 404 })
  }
  if (requirement.type !== 'MANUAL') {
    return NextResponse.json({ error: 'Requirement is not MANUAL' }, { status: 400 })
  }

  const check = await db.contestManualCheck.upsert({
    where: { requirementId_agentProfileId: { requirementId: body.requirementId, agentProfileId: body.agentProfileId } },
    update: {
      completed: body.completed,
      completedAt: body.completed ? new Date() : null,
      checkedById: adminId,
      notes: body.notes ?? undefined,
    },
    create: {
      contestId,
      requirementId: body.requirementId,
      agentProfileId: body.agentProfileId,
      completed: body.completed,
      completedAt: body.completed ? new Date() : null,
      checkedById: adminId,
      notes: body.notes ?? null,
    },
  })

  return NextResponse.json({ check })
}
