// Distinct list of agents who have at least one NewBusinessSubmission.
// Used to populate the "Filter by agent" dropdown on /vault/new-business.
//
// Why a separate endpoint instead of distinct-on the existing list
// route: the list fetch on /vault/new-business is itself filtered by
// agent + status + date range, so deriving the dropdown from it would
// shrink the dropdown the moment the user picks one. This stays the
// full set, sorted by name for a stable order.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  // Distinct agentProfileIds across the submissions table, then hydrate
  // names. Two trips, but both are tiny: distinct-on is one cheap scan
  // and the name fetch is constrained to the matched ids.
  const distinct = await db.newBusinessSubmission.findMany({
    select: { agentProfileId: true },
    distinct: ['agentProfileId'],
  })
  const ids = distinct.map(d => d.agentProfileId)
  const agents = await db.agentProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, agentCode: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
  return NextResponse.json({ agents })
}
