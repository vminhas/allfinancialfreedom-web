import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { getSetting } from '@/lib/settings'
import { resolveAgentTitle, TITLE_OVERRIDE_ITEM_KEYS, DEFAULT_AGENT_TITLE } from '@/lib/agent-title'

export interface OrgNode {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  preferredName: string | null
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

  // Include INACTIVE agents in the tree so tracking-only / former
  // teammates remain visible in their recruiter's branch. They render
  // with a distinct muted treatment on the client (border opacity
  // dropped + a small FORMER pill) so the tree still feels alive
  // while telling the truth about who's who. Active agents come
  // first in sort order so the live roster reads cleanly above the
  // alumni layer.
  const agents = await db.agentProfile.findMany({
    where: { status: { in: ['ACTIVE', 'INACTIVE'] }, isTest: false },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      phase: true,
      state: true,
      avatarUrl: true,
      status: true,
      recruiterId: true,
      cft: true,
      // Only the title-override items, not the whole phaseItems list,
      // so resolveAgentTitle() can decide each agent's rank.
      phaseItems: {
        where: { completed: true, itemKey: { in: TITLE_OVERRIDE_ITEM_KEYS } },
        select: { itemKey: true },
      },
    },
    orderBy: [{ status: 'asc' }, { phase: 'desc' }, { firstName: 'asc' }],
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
      preferredName: a.preferredName,
      phase: a.phase,
      title: resolveAgentTitle({
        phase: a.phase,
        completedItemKeys: a.phaseItems.map(i => i.itemKey),
      }),
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
      preferredName: null,
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

  // Group counts by resolved title rather than by phase number, since
  // title is what the UI shows everywhere now. Order matches the
  // resolver's precedence: highest rank first.
  const titleOrder = ['NVP', 'EMD', 'Marketing Director', 'Senior Associate', DEFAULT_AGENT_TITLE]
  const counts = new Map<string, number>()
  for (const a of agents) {
    const t = resolveAgentTitle({
      phase: a.phase,
      completedItemKeys: a.phaseItems.map(i => i.itemKey),
    })
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  const stats = {
    totalAgents: agents.length,
    byTitle: titleOrder
      .filter(t => (counts.get(t) ?? 0) > 0)
      .map(title => ({ title, count: counts.get(title) ?? 0 })),
  }

  return NextResponse.json({ tree, leadership, stats })
}
