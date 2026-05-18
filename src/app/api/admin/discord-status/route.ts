import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET  /api/admin/discord-status  — whether the calling staff member
//                                   has linked their Discord, and as who.
// DELETE /api/admin/discord-status — unlink (stop bot DMs).
//
// The OAuth handshake itself lives at /api/vault/discord-connect +
// /api/vault/discord-callback (which write AdminUser.discordUserId).
// This endpoint is just the status/teardown the vault settings page
// polls — it was referenced by the UI but never existed, so the page
// 404'd and crashed on `.json()` of the HTML error page.

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const id = (session!.user as { id?: string }).id
  if (!id) return NextResponse.json({ connected: false })

  const admin = await db.adminUser.findUnique({
    where: { id },
    select: { discordUserId: true, discordUsername: true },
  })
  return NextResponse.json({
    connected: !!admin?.discordUserId,
    username: admin?.discordUsername ?? null,
  })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const id = (session!.user as { id?: string }).id
  if (!id) return NextResponse.json({ error: 'No user id' }, { status: 401 })

  await db.adminUser.update({
    where: { id },
    data: { discordUserId: null, discordUsername: null },
  })
  return NextResponse.json({ ok: true })
}
