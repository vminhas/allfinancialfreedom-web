import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBookingLinks } from '@/lib/booking-links'
import { db } from '@/lib/db'

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
          select: { id: true, email: true, name: true, avatarUrl: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string; avatarUrl: string | null }[]),
    agentIds.size
      ? db.agentProfile.findMany({
          where: { id: { in: [...agentIds] } },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : Promise.resolve([] as { id: string; firstName: string; lastName: string; avatarUrl: string | null }[]),
  ])

  // Admins who are also agents (like Melinee) may have an avatar on
  // their AgentProfile but not on AdminUser. Look up agent avatars by
  // email as a fallback so photos don't need to be uploaded twice.
  const adminEmails = admins.filter(a => !a.avatarUrl).map(a => a.email)
  const agentsByEmail = adminEmails.length > 0
    ? await db.agentUser.findMany({
        where: { email: { in: adminEmails, mode: 'insensitive' } },
        include: { profile: { select: { avatarUrl: true } } },
      })
    : []
  const agentAvatarByEmail = new Map(
    agentsByEmail.filter(a => a.profile?.avatarUrl).map(a => [a.email.toLowerCase(), a.profile!.avatarUrl!])
  )

  const adminMap = new Map(admins.map(a => [a.id, a]))
  const agentMap = new Map(agents.map(a => [a.id, a]))

  const resolved = links.map(l => {
    if (l.personType === 'admin' && l.personId) {
      const a = adminMap.get(l.personId)
      if (a) {
        const avatar = a.avatarUrl ?? agentAvatarByEmail.get(a.email.toLowerCase()) ?? l.avatarUrl
        return { ...l, name: a.name, avatarUrl: avatar }
      }
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
