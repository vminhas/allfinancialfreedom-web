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
  // Pagination: default page=1, limit=25. The previous take:200 hard
  // cap was effectively "load everything," which made the Agents tab
  // scroll forever. Move filters to the DB layer so we can count +
  // paginate accurately even when needsAttention is on.
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))

  // The Agents tab in the Licensing Inbox is the LC's "everyone I'm
  // responsible for" roster. Hardcoding status:ACTIVE caused INACTIVE
  // agents with open requests to vanish from the agent search even
  // though their requests still showed in the inbox tab (Natalia hit
  // this with Prudence). The LC should see every real agent regardless
  // of activation state; status flows through to the response so the
  // card can mark inactive ones visually if needed. Test accounts
  // stay hidden via the new isTest flag.
  const where: Record<string, unknown> = { isTest: false }
  if (phaseFilter) where.phase = parseInt(phaseFilter)
  if (needsAttention) {
    where.coordinatorRequests = { some: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }
  }
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { agentCode: { contains: q, mode: 'insensitive' } },
      { licenseNumber: { contains: q, mode: 'insensitive' } },
      { npn: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [profiles, total] = await Promise.all([
    db.agentProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        agentCode: true,
        firstName: true,
        lastName: true,
        state: true,
        phase: true,
        status: true,
        phone: true,
        examDate: true,
        licenseNumber: true,
        licenseLines: true,
        npn: true,
        dateSubmittedToGfi: true,
        agentUser: { select: { email: true } },
        carrierAppointments: { select: { status: true } },
        // Pull the actual open requests (not just the count) so the
        // agent card can answer "what does this person need?" without
        // forcing the LC to expand the row first.
        coordinatorRequests: {
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
          select: { id: true, topic: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    db.agentProfile.count({ where }),
  ])

  const agents = profiles.map(p => ({
    id: p.id,
    agentCode: p.agentCode,
    firstName: p.firstName,
    lastName: p.lastName,
    state: p.state,
    phase: p.phase,
    status: p.status,
    phone: p.phone,
    email: p.agentUser.email,
    examDate: p.examDate,
    licenseNumber: p.licenseNumber,
    licenseLines: p.licenseLines,
    npn: p.npn,
    dateSubmittedToGfi: p.dateSubmittedToGfi,
    carriersAppointed: p.carrierAppointments.filter(c => c.status === 'APPOINTED').length,
    carriersTotal: p.carrierAppointments.length,
    openRequestCount: p.coordinatorRequests.length,
    openRequests: p.coordinatorRequests,
  }))

  return NextResponse.json({ agents, page, limit, total })
}
