import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { celebrateNewBusinessPartner } from '@/lib/celebrate-new-business-partner'

// POST /api/admin/agents/[id]/announce-join
//
// Re-fires the public NEW BUSINESS PARTNER card for an agent that was
// added to the portal without triggering the celebration (Tevah sync
// before the auto-announce wiring shipped, agents created via the
// admin tracker, agents where Tevah didn't ship a `reference` and the
// recruiter was set manually afterward, etc.).
//
// Admin-only because the announcements channel is public; we don't
// want LCs or agents triggering arbitrary celebrations for stale
// joins.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const result = await celebrateNewBusinessPartner({ agentProfileId: id })

  if (!result.ok) {
    const status =
      result.reason === 'no_profile' ? 404 :
      result.reason === 'no_recruiter' ? 409 :
      result.reason === 'no_token' ? 503 : 500
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        message:
          result.reason === 'no_profile' ? 'Agent not found' :
          result.reason === 'no_recruiter' ? 'No recruiter on file for this agent; set one in the tracker before announcing.' :
          result.reason === 'no_token' ? 'DISCORD_BOT_TOKEN not configured' :
          'Discord send failed; check server logs',
      },
      { status },
    )
  }

  return NextResponse.json({
    ok: true,
    recruiterAgentCode: result.recruiterAgentCode,
    newAgentName: result.newAgentName,
  })
}
