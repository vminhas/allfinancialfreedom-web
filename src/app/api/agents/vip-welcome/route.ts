import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'

// GET /api/agents/vip-welcome
//
// Tells the portal whether the signed-in agent is the configured VIP,
// and supplies the copy for the one-time welcome modal. Returns
// { show: false } for everyone else (the 99.9% case). Self-contained
// so the main /api/agents/me payload doesn't grow for a one-off.
export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const profile = await db.agentProfile.findUnique({
    where: { id: id.profileId },
    select: { agentCode: true, firstName: true, lastName: true, preferredName: true },
  })
  if (!profile) return NextResponse.json({ show: false })

  const cfg = await getSettings(['VIP_ARRIVAL_AGENT_CODE', 'VIP_ARRIVAL_TITLE'])
  const vipCode = (cfg.VIP_ARRIVAL_AGENT_CODE ?? '').trim()
  if (!vipCode || vipCode.toLowerCase() !== profile.agentCode.toLowerCase()) {
    return NextResponse.json({ show: false })
  }

  const firstName = (profile.preferredName?.trim() || profile.firstName).trim()
  return NextResponse.json({
    show: true,
    firstName,
    name: `${firstName} ${profile.lastName}`.trim(),
    title: (cfg.VIP_ARRIVAL_TITLE ?? '').trim(),
  })
}
