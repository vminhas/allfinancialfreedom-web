import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { agentAuthOptions } from '@/lib/agent-auth'
import { db } from '@/lib/db'

const PHASE_TITLES: Record<number, string> = {
  1: 'Agent',
  2: 'Associate',
  3: 'Certified Field Trainer',
  4: 'Marketing Director',
  5: 'Executive Marketing Director',
}

interface TeamNode {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  title: string
  state: string | null
  avatarUrl: string | null
  children: TeamNode[]
}

export async function GET() {
  const session = await getServerSession(agentAuthOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const me = await db.agentProfile.findFirst({
    where: { agentUser: { email: session.user.email! } },
    select: { agentCode: true },
  })
  if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allAgents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      phase: true,
      state: true,
      avatarUrl: true,
      recruiterId: true,
    },
  })

  const childrenOf = new Map<string, typeof allAgents>()
  for (const a of allAgents) {
    if (a.recruiterId) {
      const arr = childrenOf.get(a.recruiterId) ?? []
      arr.push(a)
      childrenOf.set(a.recruiterId, arr)
    }
  }

  function buildNode(a: typeof allAgents[0]): TeamNode {
    const kids = childrenOf.get(a.agentCode) ?? []
    return {
      id: a.id,
      agentCode: a.agentCode,
      firstName: a.firstName,
      lastName: a.lastName,
      phase: a.phase,
      title: PHASE_TITLES[a.phase] ?? `Phase ${a.phase}`,
      state: a.state,
      avatarUrl: a.avatarUrl,
      children: kids.map(buildNode),
    }
  }

  const myRecruits = childrenOf.get(me.agentCode) ?? []
  const team = myRecruits.map(buildNode)

  let totalTeamSize = 0
  function count(nodes: TeamNode[]) {
    for (const n of nodes) { totalTeamSize++; count(n.children) }
  }
  count(team)

  return NextResponse.json({ team, totalTeamSize })
}
