import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBookingLinks } from '@/lib/booking-links'
import { db } from '@/lib/db'

// Agents see the curated booking list as read-only.
//
// When a link is bound to a real AFF user (personType + personId),
// resolve the live name + avatar from their record so updating the
// person's profile elsewhere (e.g. an agent uploads a new headshot)
// automatically reflects on the Book page. Free-text name/avatarUrl
// stored on the link itself stays as the fallback.
export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'agent' && role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const links = await getBookingLinks()

  const adminIds = new Set<string>()
  const agentIds = new Set<string>()
  for (const l of links) {
    if (l.personType === 'admin' && l.personId) adminIds.add(l.personId)
    if (l.personType === 'agent' && l.personId) agentIds.add(l.personId)
  }

  const [admins, agents] = await Promise.all([
    adminIds.size
      ? db.adminUser.findMany({
          where: { id: { in: [...adminIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    agentIds.size
      ? db.agentProfile.findMany({
          where: { id: { in: [...agentIds] } },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : Promise.resolve([] as { id: string; firstName: string; lastName: string; avatarUrl: string | null }[]),
  ])

  const adminMap = new Map(admins.map(a => [a.id, a]))
  const agentMap = new Map(agents.map(a => [a.id, a]))

  const resolved = links.map(l => {
    if (l.personType === 'admin' && l.personId) {
      const a = adminMap.get(l.personId)
      if (a) return { ...l, name: a.name }
    }
    if (l.personType === 'agent' && l.personId) {
      const a = agentMap.get(l.personId)
      if (a) {
        return {
          ...l,
          name: `${a.firstName} ${a.lastName}`,
          avatarUrl: a.avatarUrl ?? l.avatarUrl,
        }
      }
    }
    return l
  })

  return NextResponse.json({ links: resolved })
}
