import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { findDuplicatePairs } from '@/lib/submission-merge'
import { db } from '@/lib/db'

// GET /api/admin/new-business/duplicates
//
// Sweeps existing NewBusinessSubmission rows for likely-duplicate
// pairs (same writer + same client + same policyType + carrier fuzzy
// match + applicationDate within ±60 days). Returns the candidate
// list with confidence ratings so the admin tool can show side-by-
// side previews and bulk-merge the high-confidence ones.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const pairs = await findDuplicatePairs()

  // Pull agent display names in one round trip so the UI doesn't
  // have to fetch them per pair.
  const agentIds = Array.from(new Set(pairs.map(p => p.agentProfileId)))
  const agents = agentIds.length
    ? await db.agentProfile.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, firstName: true, lastName: true, agentCode: true },
      })
    : []
  const agentById = new Map(agents.map(a => [a.id, a]))

  return NextResponse.json({
    pairs: pairs.map(p => ({
      ...p,
      agent: agentById.get(p.agentProfileId) ?? null,
    })),
    summary: {
      total: pairs.length,
      high: pairs.filter(p => p.confidence === 'high').length,
      medium: pairs.filter(p => p.confidence === 'medium').length,
      low: pairs.filter(p => p.confidence === 'low').length,
    },
  })
}
