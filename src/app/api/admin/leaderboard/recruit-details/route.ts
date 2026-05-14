import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getTevahAgentRecruitDetails } from '@/lib/tevah'

// GET /api/admin/leaderboard/recruit-details?agentProfileId=<id>&year=2026&month=5
// Returns the list of recruits an agent brought in during the given month,
// sourced from Tevah's getTeamReportRecruitsDetails endpoint.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'admin' && role !== 'licensing_coordinator' && role !== 'agent')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const agentProfileId = searchParams.get('agentProfileId')
  if (!agentProfileId) return NextResponse.json({ error: 'agentProfileId required' }, { status: 400 })

  const now = new Date()
  const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10)
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10)

  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: { tevahAgentId: true },
  })

  if (!profile?.tevahAgentId) {
    return NextResponse.json({ recruits: [], note: 'Agent not yet linked to Tevah' })
  }

  try {
    const recruits = await getTevahAgentRecruitDetails(profile.tevahAgentId, year, month)
    return NextResponse.json({ recruits })
  } catch (err) {
    console.error('[recruit-details] Tevah fetch failed:', err)
    return NextResponse.json({ error: 'Failed to fetch from Tevah' }, { status: 502 })
  }
}
