import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { CARRIERS } from '@/lib/agent-constants'

const VALID = new Set<string>(CARRIERS)

// PUT replaces the agent's curated carrier list. The dashboard hides
// NOT_STARTED carriers that aren't in this set, so it's purely a view
// preference. Anything with an active appointment shows regardless.
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'agent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = session.user!.email
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'Session has no email' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { carriers?: unknown }
  if (!Array.isArray(body.carriers)) {
    return NextResponse.json({ error: 'carriers must be an array' }, { status: 400 })
  }
  const filtered = Array.from(new Set(
    (body.carriers as unknown[]).filter((c): c is string => typeof c === 'string' && VALID.has(c))
  ))

  const profile = await db.agentProfile.findFirst({
    where: { agentUser: { email: { equals: email, mode: 'insensitive' } } },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  await db.agentProfile.update({
    where: { id: profile.id },
    data: { selectedCarriers: filtered },
  })

  return NextResponse.json({ ok: true, selectedCarriers: filtered })
}
