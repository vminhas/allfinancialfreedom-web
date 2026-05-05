import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/agents/leaderboard
//
// Agent-facing variant of the admin progression matrix. Same shape, but
// stripped down server-side: test accounts hidden, admin-only checklist
// items hidden (those are by-definition invisible to agents anyway), and
// the response includes the caller's own agentProfileId so the page can
// highlight their row with a "YOU" badge and rank them in context.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }
  const me = await db.agentUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { profile: { select: { id: true } } },
  })
  if (!me?.profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const [agents, items, completions] = await Promise.all([
    db.agentProfile.findMany({
      where: { status: 'ACTIVE', isTest: false },
      select: {
        id: true, agentCode: true, firstName: true, lastName: true,
        phase: true, avatarUrl: true,
      },
      orderBy: [{ phase: 'desc' }, { agentCode: 'asc' }],
    }),
    // adminOnly items are admin-approval gates (e.g. licensing review).
    // The agent-facing checklist already hides them; the leaderboard
    // should match so an item nobody can self-mark doesn't pollute the
    // ratio against you.
    db.phaseItemDefinition.findMany({
      where: { adminOnly: false },
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      select: { phase: true, itemKey: true, label: true, groupKey: true },
    }),
    db.phaseItem.findMany({
      where: { completed: true },
      select: { agentProfileId: true, itemKey: true, completedAt: true },
    }),
  ])

  const completedAt: Record<string, string> = {}
  for (const c of completions) {
    completedAt[`${c.agentProfileId}:${c.itemKey}`] = c.completedAt?.toISOString() ?? ''
  }

  return NextResponse.json({
    agents,
    items,
    completedAt,
    viewerAgentId: me.profile.id,
  })
}
