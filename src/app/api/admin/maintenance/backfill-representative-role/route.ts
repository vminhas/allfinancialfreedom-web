import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { REPRESENTATIVE_ROLE_ID } from '@/lib/discord-roles'

// Long: looping every guild member through Discord's PUT-role
// endpoint is rate-limited (~50 req/sec). 800 members ~= 16s; give
// it room.
export const maxDuration = 300

// POST /api/admin/maintenance/backfill-representative-role
//
// Grants the Representative role to every current member of the AFF
// Discord guild. Used once after the role's permissions are
// configured (the CEO sets 'Change Nickname' on the role manually);
// running it later is a no-op since Discord's PUT-role endpoint is
// idempotent on members who already have the role.
//
// Iterates the guild's full member list via the Discord API, skipping
// bots and members who already carry the role.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const guildId = process.env.DISCORD_GUILD_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!guildId || !botToken) {
    return NextResponse.json({ error: 'Discord credentials not configured' }, { status: 500 })
  }

  const headers = { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' }

  // Paginate the guild member list. Discord caps at 1000 per page;
  // we keep walking until a page returns fewer than `limit` members.
  let after = '0'
  const all: Array<{ user: { id: string; bot?: boolean }; roles: string[] }> = []
  while (true) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`,
      { headers }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `Failed to list members: ${res.status} ${text}` }, { status: 500 })
    }
    const page = await res.json() as Array<{ user: { id: string; bot?: boolean }; roles: string[] }>
    all.push(...page)
    if (page.length < 1000) break
    after = page[page.length - 1].user.id
  }

  let granted = 0
  let alreadyHad = 0
  let skippedBots = 0
  let failed = 0

  for (const m of all) {
    if (m.user.bot) { skippedBots++; continue }
    if (m.roles.includes(REPRESENTATIVE_ROLE_ID)) { alreadyHad++; continue }
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${m.user.id}/roles/${REPRESENTATIVE_ROLE_ID}`,
      { method: 'PUT', headers }
    )
    if (res.ok || res.status === 204) {
      granted++
    } else {
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: all.length,
    granted,
    alreadyHad,
    skippedBots,
    failed,
  })
}
