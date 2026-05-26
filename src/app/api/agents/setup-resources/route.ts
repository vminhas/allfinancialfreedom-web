import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Returns every resource (locked + unlocked) plus the requesting
// agent's current phase, so the client can render the Mortal-Kombat
// style lock state without a second round trip.
//
// Older callers using ?full=0 / no param still get the legacy
// { resources: { key: url, ... } } map. Anything new should hit
// ?full=1 to get the full payload.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const full = searchParams.get('full') === '1'

  if (full) {
    // Look up the agent's phase from their profile. Admins / coordinators
    // who can also visit this page get phase 6 so every gate shows
    // unlocked for them, otherwise we'd give the admin a worse view
    // than any agent on the platform.
    const u = session.user as { role?: string; profileId?: string | null }
    let agentPhase = 6
    if (u.role === 'agent') {
      agentPhase = 1
      if (u.profileId) {
        const profile = await db.agentProfile.findUnique({
          where: { id: u.profileId },
          select: { phase: true },
        })
        if (profile?.phase) agentPhase = profile.phase
      }
    }

    const resources = await db.setupResource.findMany({
      select: {
        key: true,
        label: true,
        url: true,
        category: true,
        description: true,
        unlocksAtPhase: true,
      },
      orderBy: [{ unlocksAtPhase: 'asc' }, { category: 'asc' }, { label: 'asc' }],
    })
    return NextResponse.json({ resources, agentPhase })
  }

  // Legacy compact map. Old callers (checklist items, etc.) just look
  // up a URL by key, so we don't gate this. Visibility lives in the
  // client-side lock treatment on the agent resources page.
  const resources = await db.setupResource.findMany({
    select: { key: true, url: true },
  })

  const map: Record<string, string> = {}
  for (const r of resources) {
    map[r.key] = r.url
  }

  return NextResponse.json({ resources: map })
}
