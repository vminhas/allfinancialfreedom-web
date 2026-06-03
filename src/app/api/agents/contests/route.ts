import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { getAgentContestStatuses } from '@/lib/contests'

// GET /api/agents/contests
//
// Returns every active contest applicable to the agent, with
// computed status (window, days remaining, requirement breakdown).
// Mirrors the admin-preview behavior of /api/agents/me so the
// admin can preview an agent's view via ?preview=<token>.

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const contests = await getAgentContestStatuses(id.profileId)
  return NextResponse.json({ contests })
}
