import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { assignDiscordPhaseRole } from '@/lib/discord-roles'

// POST /api/agents/discord-sync
// Body: { discordUserId?: string }
// If discordUserId is provided, saves it first then triggers role sync.
// If omitted, uses the stored discordUserId.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { discordUserId?: string }

  const agentUser = await db.agentUser.findUnique({
    where: { email: session.user!.email! },
    include: { profile: true },
  })
  if (!agentUser?.profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const profile = agentUser.profile
  let discordUserId = profile.discordUserId

  // Save new Discord User ID if provided
  if (body.discordUserId !== undefined) {
    const trimmed = body.discordUserId.trim()
    if (trimmed && !/^\d{17,20}$/.test(trimmed)) {
      return NextResponse.json(
        { error: 'Invalid Discord User ID — it should be a 17–20 digit number. Enable Developer Mode in Discord, then right-click your username to copy it.' },
        { status: 400 }
      )
    }
    await db.agentProfile.update({
      where: { id: profile.id },
      data: { discordUserId: trimmed || null },
    })
    discordUserId = trimmed || null
  }

  if (!discordUserId) {
    return NextResponse.json({ error: 'No Discord User ID on file. Enter your Discord User ID first.' }, { status: 400 })
  }

  // Trigger role assignment via the bot
  try {
    await assignDiscordPhaseRole(discordUserId, profile.phase, null)
    return NextResponse.json({ ok: true, discordUserId, phase: profile.phase })
  } catch {
    return NextResponse.json({ error: 'Discord sync failed. Make sure the bot is in your server and your User ID is correct.' }, { status: 500 })
  }
}
