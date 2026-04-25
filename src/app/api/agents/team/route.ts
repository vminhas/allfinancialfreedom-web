import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { agentAuthOptions } from '@/lib/agent-auth'
import { db } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/settings'

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

export async function GET(req: NextRequest) {
  let myAgentCode: string | null = null

  // Check for admin preview token
  const previewToken = new URL(req.url).searchParams.get('preview')
  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        const profile = await db.agentProfile.findUnique({
          where: { id: data.agentProfileId },
          select: { agentCode: true },
        })
        if (profile) myAgentCode = profile.agentCode
      }
    }
  }

  // Fall back to agent session
  if (!myAgentCode) {
    const session = await getServerSession(agentAuthOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const me = await db.agentProfile.findFirst({
      where: { agentUser: { email: session.user.email! } },
      select: { agentCode: true },
    })
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    myAgentCode = me.agentCode
  }

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

  const myRecruits = childrenOf.get(myAgentCode) ?? []
  const team = myRecruits.map(buildNode)

  let totalTeamSize = 0
  function count(nodes: TeamNode[]) {
    for (const n of nodes) { totalTeamSize++; count(n.children) }
  }
  count(team)

  return NextResponse.json({ team, totalTeamSize })
}
