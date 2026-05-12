import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'

// GET/PUT /api/agents/client-reminder-prefs
//
// Per-agent toggle state for the daily client-reminder cron.
// Shape: { birthday: boolean, thankYou30Day: boolean, annualReview: boolean }
//
// Read-only when previewing — admins viewing an agent's portal
// shouldn't be flipping the agent's settings.

interface Prefs {
  birthday?: boolean
  thankYou30Day?: boolean
  annualReview?: boolean
}

const DEFAULT_PREFS: Required<Prefs> = {
  birthday: false,
  thankYou30Day: false,
  annualReview: false,
}

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const profile = await db.agentProfile.findUnique({
    where: { id: id.profileId },
    select: { clientReminderPrefs: true },
  })
  const stored = (profile?.clientReminderPrefs ?? {}) as Prefs
  return NextResponse.json({ prefs: { ...DEFAULT_PREFS, ...stored } })
}

export async function PUT(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error
  if (id.previewing) return NextResponse.json({ error: 'Read-only preview' }, { status: 403 })

  const body = await req.json() as Prefs
  const next: Prefs = {
    birthday: body.birthday === true,
    thankYou30Day: body.thankYou30Day === true,
    annualReview: body.annualReview === true,
  }
  await db.agentProfile.update({
    where: { id: id.profileId },
    // Cast through unknown to Prisma's InputJsonObject shape — our
    // typed Prefs interface lacks the string index Prisma expects.
    data: { clientReminderPrefs: next as unknown as Record<string, boolean> },
  })
  return NextResponse.json({ prefs: { ...DEFAULT_PREFS, ...next } })
}
