import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSetting } from '@/lib/settings'
import { getAgentProfileIdFromEmail } from '@/lib/agent-identity'
import { getAgentContestStatuses } from '@/lib/contests'

// GET /api/agents/contests
//
// Returns every active contest applicable to the agent, with
// computed status (window, days remaining, requirement breakdown).
// Mirrors the admin-preview behavior of /api/agents/me so the
// admin can preview an agent's view via ?preview=<token>.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const previewToken = url.searchParams.get('preview')

  let agentProfileId: string | null = null

  if (previewToken) {
    const raw = await getSetting(`PREVIEW_TOKEN_${previewToken}`)
    if (raw) {
      const data = JSON.parse(raw) as { agentProfileId: string; expires: string }
      if (new Date(data.expires) >= new Date()) {
        agentProfileId = data.agentProfileId
      }
    }
  }

  if (!agentProfileId) {
    const session = await getServerSession(authOptions)
    const role = (session?.user as { role?: string } | undefined)?.role
    if (!session || role !== 'agent') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const email = session.user!.email
    if (typeof email !== 'string') {
      return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
    }
    const profileId = await getAgentProfileIdFromEmail(email)
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    agentProfileId = profileId
  }

  const contests = await getAgentContestStatuses(agentProfileId)
  return NextResponse.json({ contests })
}
