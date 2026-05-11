import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST /api/vault/discord-disconnect — clears Discord linkage on
// the calling staff user. They stop receiving DM notifications.
export async function POST() {
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
