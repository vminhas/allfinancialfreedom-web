import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveAgentTitle, TITLE_OVERRIDE_ITEM_KEYS } from '@/lib/agent-title'

// GET /api/agents/directory
//
// Company-wide photo directory. Returns all active, non-test agents
// for the team photo grid. Auth: agent session OR admin/LC session.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || (role !== 'agent' && role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      avatarUrl: true,
      phase: true,
      state: true,
      // Pull only the title-override items so the resolver can decide
      // whether the agent's rank has been bumped mid-phase.
      phaseItems: {
        where: { completed: true, itemKey: { in: TITLE_OVERRIDE_ITEM_KEYS } },
        select: { itemKey: true },
      },
    },
    orderBy: [{ phase: 'desc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({
    agents: agents.map(a => ({
      id: a.id,
      agentCode: a.agentCode,
      firstName: a.firstName,
      lastName: a.lastName,
      preferredName: a.preferredName,
      avatarUrl: a.avatarUrl,
      phase: a.phase,
      title: resolveAgentTitle({
        phase: a.phase,
        completedItemKeys: a.phaseItems.map(i => i.itemKey),
      }),
      state: a.state,
    })),
  })
}
