import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// Trainer-assignment dropdown source. Returns the full names of every
// active agent at Phase 3 or higher (Phase 3 = Certified Field Trainer,
// 4 = Marketing Director, 5 = EMD — all of whom can train new recruits).
//
// Used by the referral approval modal in /vault/licensing. Both admins
// and licensing coordinators need access since LC handles approvals.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const cfts = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', phase: { gte: 3 } },
    select: { firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  const trainers = cfts
    .map(t => `${t.firstName} ${t.lastName}`.trim())
    .filter(Boolean)

  return NextResponse.json({ trainers })
}
