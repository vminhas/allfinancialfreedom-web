import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/vault/licensing-agents
// Licensing-focused agent list. Returns ONLY the fields the Licensing
// Coordinator needs — no goals, no CFT assignment, no call reviews,
// no phase progress beyond phase number.
// Filters: ?needsAttention=1 (has open requests), ?phase=1|2, ?q=<search>
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const needsAttention = searchParams.get('needsAttention') === '1'
  const phaseFilter = searchParams.get('phase')
  const q = searchParams.get('q')?.trim() ?? ''

  const where: Record<string, unknown> = { status: 'ACTIVE' }
  if (phaseFilter) where.phase = parseInt(phaseFilter)
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { agentCode: { contains: q, mode: 'insensitive' } },
      { licenseNumber: { contains: q, mode: 'insensitive' } },
      { npn: { contains: q, mode: 'insensitive' } },
    ]
  }

  const profiles = await db.agentProfile.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      state: true,
      phase: true,
      phone: true,
      examDate: true,
      licenseNumber: true,
      licenseLines: true,
      npn: true,
      dateSubmittedToGfi: true,
      agentUser: { select: { email: true } },
      carrierAppointments: { select: { status: true } },
      _count: {
        select: {
          coordinatorRequests: {
            where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
          },
        },
      },
    },
  })

  const shaped = profiles.map(p => ({
    id: p.id,
    agentCode: p.agentCode,
    firstName: p.firstName,
    lastName: p.lastName,
    state: p.state,
    phase: p.phase,
    phone: p.phone,
    email: p.agentUser.email,
    examDate: p.examDate,
    licenseNumber: p.licenseNumber,
    licenseLines: p.licenseLines,
    npn: p.npn,
    dateSubmittedToGfi: p.dateSubmittedToGfi,
    carriersAppointed: p.carrierAppointments.filter(c => c.status === 'APPOINTED').length,
    carriersTotal: p.carrierAppointments.length,
    openRequestCount: p._count.coordinatorRequests,
  }))

  const filtered = needsAttention
    ? shaped.filter(a => a.openRequestCount > 0)
    : shaped

  return NextResponse.json({ agents: filtered })
}
