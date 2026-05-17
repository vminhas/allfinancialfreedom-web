import { NextRequest, NextResponse } from 'next/server'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { db } from '@/lib/db'

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
    select: {
      firstName: true,
      lastName: true,
      preferredName: true,
      vipArrival: true,
      vipArrivalTitle: true,
    },
  })
  if (!profile || !profile.vipArrival) return NextResponse.json({ show: false })

  const firstName = (profile.preferredName?.trim() || profile.firstName).trim()
  return NextResponse.json({
    show: true,
    firstName,
    name: `${firstName} ${profile.lastName}`.trim(),
    title: (profile.vipArrivalTitle ?? '').trim(),
  })
}
