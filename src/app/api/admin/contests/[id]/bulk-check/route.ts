import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { isEligible, resolveWindow } from '@/lib/contests'

// POST /api/admin/contests/[id]/bulk-check
//
// Marks (or clears) a MANUAL requirement for every eligible agent
// in a single shot. Used when a requirement is implicitly true for
// the whole cohort (e.g. "Get GFI Code" — anyone in the portal
// already has one, so admin clicks 'Mark for all' once and the
// agents see it pre-checked next time they load the dashboard).
//
// Body: { requirementId: string, completed: boolean }
// Returns: { affected: number }

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
    requirementId?: string
    completed?: boolean
  }
  if (!body.requirementId) {
    return NextResponse.json({ error: 'requirementId required' }, { status: 400 })
  }
  const completed = body.completed !== false

  const contest = await db.contest.findUnique({
    where: { id: contestId },
    include: { requirements: { where: { id: body.requirementId } } },
  })
  if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  const requirement = contest.requirements[0]
  if (!requirement) return NextResponse.json({ error: 'Requirement not in this contest' }, { status: 404 })
  if (requirement.type !== 'MANUAL') {
    return NextResponse.json({ error: 'Bulk-check only applies to MANUAL requirements' }, { status: 400 })
  }

  // Find every eligible agent. Eligibility uses the same anchor +
  // cutoff filter the agent-side compute does, so we only tick for
  // agents who actually see this contest on their dashboard.
  const profiles = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true, icaDate: true, createdAt: true, phaseStartedAt: true },
  })
  const eligibleIds = profiles
    .filter(p => isEligible(contest, p))
    .filter(p => resolveWindow(contest, p) !== null)
    .map(p => p.id)

  // Future-proof the bulk action: flip the requirement's
  // defaultCompleted flag too so any agent who joins LATER also
  // sees this pre-checked, without needing another bulk-click.
  // Marking complete → defaultCompleted=true; clearing → false.
  await db.contestRequirement.update({
    where: { id: body.requirementId },
    data: { defaultCompleted: completed },
  })

  if (eligibleIds.length === 0) {
    return NextResponse.json({ affected: 0, defaultCompleted: completed })
  }

  // Upsert each so existing rows update without unique-constraint
  // collisions. Sequential is fine for hundreds of agents; the
  // alternative (raw SQL or batched createMany + updateMany) saves
  // milliseconds we don't need.
  let affected = 0
  const now = completed ? new Date() : null
  for (const agentProfileId of eligibleIds) {
    await db.contestManualCheck.upsert({
      where: { requirementId_agentProfileId: { requirementId: body.requirementId, agentProfileId } },
      update: { completed, completedAt: now, checkedById: adminId },
      create: {
        contestId,
        requirementId: body.requirementId,
        agentProfileId,
        completed,
        completedAt: now,
        checkedById: adminId,
      },
    })
    affected++
  }

  return NextResponse.json({ affected, defaultCompleted: completed })
}
