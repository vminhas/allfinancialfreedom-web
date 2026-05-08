import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/agents/picker
//
// Slim agent roster for typeahead pickers. Returns id, agentCode,
// firstName, lastName, phase — just enough for a search-as-you-type
// dropdown that resolves a name back to a code without forcing the
// admin to memorize codes.
//
// Optional query params:
//   ?minPhase=3      Filter to phase >= N (used for trainer pickers)
//   ?includeFormer=1 Include status=INACTIVE agents (former teammates)
//
// Both admins and licensing coordinators get access since LC drives
// some referral approval flows that also need a picker.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const minPhase = parseInt(searchParams.get('minPhase') ?? '0', 10) || 0
  const includeFormer = searchParams.get('includeFormer') === '1'

  const agents = await db.agentProfile.findMany({
    where: {
      status: includeFormer ? { in: ['ACTIVE', 'INACTIVE'] } : 'ACTIVE',
      isTest: false,
      ...(minPhase > 0 ? { phase: { gte: minPhase } } : {}),
    },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      phase: true,
      status: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({ agents })
}
