import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { lifetimePointsForAllAgents, recomputeClimbAchievements } from '@/lib/climb-points'

// POST /api/admin/climb/recompute-all
//
// Walks every active agent, recomputes their lifetime points, and
// awards any milestones they've crossed but don't yet have an
// achievement row for. Idempotent — safe to re-run any time.
//
// Used after:
//   - Initial deploy (backfill historical achievements)
//   - Adding a new milestone (so existing agents past the threshold
//     get awarded retroactively)
//   - Suspected drift between submissions and achievements
//
// Reward side-effects DO fire on backfill, so a single run after
// deploy will spam #announcements. Suppress them by passing
// ?silent=1 on backfill (no Discord posts, no article generation).

export const maxDuration = 600

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const silent = url.searchParams.get('silent') === '1'

  const profiles = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true },
  })

  let scanned = 0
  let totalAwarded = 0
  for (const p of profiles) {
    scanned++
    try {
      const newAchievements = await recomputeClimbAchievements(p.id, {
        skipRewardSideEffects: silent,
      })
      totalAwarded += newAchievements.length
    } catch (err) {
      console.warn('[climb recompute-all] agent failed:', p.id, err)
    }
  }

  // Lightweight summary for the admin UI.
  const points = await lifetimePointsForAllAgents()

  return NextResponse.json({
    ok: true,
    scanned,
    totalAwarded,
    silent,
    sampleTotals: Array.from(points.entries()).slice(0, 5).map(([id, pts]) => ({ agentProfileId: id, points: pts })),
  })
}
