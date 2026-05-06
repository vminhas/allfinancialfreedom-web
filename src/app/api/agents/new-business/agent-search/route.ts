import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/agents/new-business/agent-search?q=<query>
//
// Autocomplete source for the "Split with" picker on the New
// Business form. Returns up to 10 active, non-test agents whose
// firstName / lastName / agentCode contains the query.
//
// Auth: any logged-in agent. The search lets you find your
// colleague to split a policy with; we don't expose phone, email,
// state, or any PII beyond what's needed to identify the right
// person in the dropdown.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length === 0) return NextResponse.json({ agents: [] })

  // Resolve the caller so we can exclude themselves from results
  // (you can't split a policy with yourself).
  const email = (session.user as { email?: string } | undefined)?.email
  const me = typeof email === 'string'
    ? await db.agentUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: { profile: { select: { id: true } } },
      })
    : null

  const agents = await db.agentProfile.findMany({
    where: {
      status: 'ACTIVE',
      isTest: false,
      ...(me?.profile?.id ? { NOT: { id: me.profile.id } } : {}),
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName:  { contains: q, mode: 'insensitive' } },
        { agentCode: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      phase: true,
      avatarUrl: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 10,
  })

  return NextResponse.json({ agents })
}
