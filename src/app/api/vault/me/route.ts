import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/vault/me — current staff user's profile (id, email,
// name, role, Discord linkage). Used by /vault/settings to render
// the 'Your Discord' card without a separate fetch per field.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const id = (session!.user as { id?: string }).id
  if (!id) return NextResponse.json({ error: 'No user id' }, { status: 401 })

  const user = await db.adminUser.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true,
      discordUserId: true, discordUsername: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ user })
}
