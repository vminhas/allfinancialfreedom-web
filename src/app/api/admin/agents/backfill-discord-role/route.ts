import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { assignDiscordRole } from '@/lib/discord-roles'

// POST /api/admin/agents/backfill-discord-role
// Assigns the "Portal Connected" role to all agents who already have
// a discordUserId but haven't received the role yet. One-time backfill.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const roleId = process.env.DISCORD_PORTAL_CONNECTED_ROLE_ID
  if (!roleId) {
    return NextResponse.json({ error: 'DISCORD_PORTAL_CONNECTED_ROLE_ID not configured' }, { status: 500 })
  }

  const agents = await db.agentProfile.findMany({
    where: { discordUserId: { not: null }, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, discordUserId: true },
  })

  let assigned = 0
  let failed = 0

  for (const agent of agents) {
    if (!agent.discordUserId) continue
    const ok = await assignDiscordRole(agent.discordUserId, roleId)
    if (ok) assigned++
    else failed++
    await new Promise(r => setTimeout(r, 1000))
  }

  return NextResponse.json({
    total: agents.length,
    assigned,
    failed,
  })
}
