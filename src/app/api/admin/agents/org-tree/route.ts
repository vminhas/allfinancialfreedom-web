import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { getSetting } from '@/lib/settings'

const PHASE_TITLES: Record<number, string> = {
  1: 'Agent',
  2: 'Associate',
  3: 'Certified Field Trainer',
  4: 'Marketing Director',
  5: 'Executive Marketing Director',
}

export interface OrgNode {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  title: string
  state: string | null
  avatarUrl: string | null
  status: string
  recruiterId: string | null
  cft: string | null
  children: OrgNode[]
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      phase: true,
      state: true,
      avatarUrl: true,
      status: true,
      recruiterId: true,
      cft: true,
    },
    orderBy: [{ phase: 'desc' }, { firstName: 'asc' }],
  })

  const byCode = new Map<string, typeof agents[0]>()
  for (const a of agents) byCode.set(a.agentCode, a)

  const childrenOf = new Map<string, typeof agents>()
  const roots: typeof agents = []

  for (const a of agents) {
    if (a.recruiterId && byCode.has(a.recruiterId)) {
      const arr = childrenOf.get(a.recruiterId) ?? []
      arr.push(a)
      childrenOf.set(a.recruiterId, arr)
    } else {
      roots.push(a)
    }
  }

  function buildNode(a: typeof agents[0]): OrgNode {
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
      status: a.status,
      recruiterId: a.recruiterId,
      cft: a.cft,
      children: kids.map(buildNode),
    }
  }

  const agentTree = roots.map(buildNode)

  const [vickAvatar, melineeAvatar] = await Promise.all([
    getSetting('LEADERSHIP_VICK_AVATAR'),
    getSetting('LEADERSHIP_MELINEE_AVATAR'),
  ])

  const tree: OrgNode[] = [
    {
      id: '_leadership',
      agentCode: '_AFF',
      firstName: 'Vick & Melinee',
      lastName: 'Minhas',
      phase: 6,
      title: 'CEO & COO',
      state: null,
      avatarUrl: vickAvatar || null,
      status: 'ACTIVE',
      recruiterId: null,
      cft: null,
      children: agentTree,
    },
  ]

  const leadership = [
    { id: '_vick', firstName: 'Vick', lastName: 'Minhas', title: 'CEO', avatarUrl: vickAvatar || null },
    { id: '_melinee', firstName: 'Melinee', lastName: 'Minhas', title: 'COO', avatarUrl: melineeAvatar || null },
  ]

  const stats = {
    totalAgents: agents.length,
    byPhase: [1, 2, 3, 4, 5].map(p => ({
      phase: p,
      title: PHASE_TITLES[p],
      count: agents.filter(a => a.phase === p).length,
    })),
  }

  return NextResponse.json({ tree, leadership, stats })
}
