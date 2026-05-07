import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'

// GET /api/admin/booking-links/people-search?q=<query>
//
// Powers the "Pick person" autocomplete on the booking-links admin
// editor. Searches AdminUser (vault staff: Vick, Melinee, LCs) AND
// AgentProfile (CFTs and any agent who runs sessions). Returns up
// to 10 unified results per source — name + avatar + a hint for the
// admin to know which pool the person is from.
//
// Limited to 'admin' callers because the endpoint surfaces the
// internal user pool; LCs don't manage booking links.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ people: [] })

  const [admins, agents] = await Promise.all([
    db.adminUser.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
      take: 10,
    }),
    db.agentProfile.findMany({
      where: {
        status: 'ACTIVE',
        isTest: false,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName:  { contains: q, mode: 'insensitive' } },
          { agentCode: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, agentCode: true, avatarUrl: true, phase: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10,
    }),
  ])

  // Unified shape so the picker can render one list. AdminUser doesn't
  // carry an avatar field today; falls back to initials in the UI.
  const people = [
    ...admins.map(a => ({
      id: a.id,
      type: 'admin' as const,
      name: a.name,
      hint: a.role === 'LICENSING_COORDINATOR' ? 'Licensing Coordinator · Admin' : 'Admin',
      avatarUrl: null as string | null,
    })),
    ...agents.map(a => ({
      id: a.id,
      type: 'agent' as const,
      name: `${a.firstName} ${a.lastName}`,
      hint: `${a.agentCode} · Phase ${a.phase}`,
      avatarUrl: a.avatarUrl,
    })),
  ]

  return NextResponse.json({ people })
}
