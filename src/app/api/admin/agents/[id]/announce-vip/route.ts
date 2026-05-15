import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { fireVipArrival } from '@/lib/vip-arrival'

// POST /api/admin/agents/[id]/announce-vip
//
// Fires the bespoke "distinguished arrival" card to #announcements for
// the one agent configured as the VIP (Settings -> VIP Arrival). Admin
// only, and the lib hard-gates on the configured agentCode so a
// misclick on a normal profile can't blast a red carpet.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const result = await fireVipArrival(id)

  if (!result.ok) {
    const status =
      result.reason === 'no_profile' ? 404 :
      result.reason === 'not_vip' ? 409 :
      result.reason === 'no_token' ? 503 : 500
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        message:
          result.reason === 'no_profile' ? 'Agent not found' :
          result.reason === 'not_vip' ? 'This agent is not the configured VIP. Set their agent code under Settings -> VIP Arrival first.' :
          result.reason === 'no_token' ? 'DISCORD_BOT_TOKEN not configured' :
          'Discord send failed; check server logs',
      },
      { status },
    )
  }

  return NextResponse.json({ ok: true })
}
