import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

const PHASE_TITLES: Record<number, string> = {
  1: 'Agent',
  2: 'Associate',
  3: 'Certified Field Trainer',
  4: 'Marketing Director',
  5: 'Executive Marketing Director',
}

// GET /api/agents/directory
//
// Company-wide photo directory. Returns all active, non-test agents
// for the team photo grid. Auth: any agent session.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      phase: true,
      state: true,
    },
    orderBy: [{ phase: 'desc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({
    agents: agents.map(a => ({
      id: a.id,
      agentCode: a.agentCode,
      firstName: a.firstName,
      lastName: a.lastName,
      avatarUrl: a.avatarUrl,
      phase: a.phase,
      title: PHASE_TITLES[a.phase] ?? `Phase ${a.phase}`,
      state: a.state,
    })),
  })
}
