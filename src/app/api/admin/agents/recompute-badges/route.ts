import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { recomputeBadges } from '@/lib/agent-badges'

// POST /api/admin/agents/recompute-badges
//
// Recomputes auto-managed badges (currently CFT) for all active agents.
// Safe to run multiple times — recomputeBadges is idempotent and only
// writes when the badge set actually changes. Call this after fixing a
// badge-gate key mismatch so already-qualified agents get their badge
// without manual item toggling.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true },
  })

  let updated = 0
  let errors = 0
  for (const agent of agents) {
    try {
      await recomputeBadges(agent.id)
      updated++
    } catch {
      errors++
    }
  }

  return NextResponse.json({ recomputed: updated, errors })
}
