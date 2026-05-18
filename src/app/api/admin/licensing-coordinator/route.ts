import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { getSettings, setSetting } from '@/lib/settings'
import { LC_CALENDAR_URL } from '@/lib/agent-constants'

// Licensing Coordinator booking calendar. The agent portal links here
// from every licensing-related Phase 1 checklist item and the licensing
// request modal. Stored in the shared (encrypted) settings table;
// returned in plaintext since it's a public booking URL, not a secret.
// When unset we fall back to the LC_CALENDAR_URL constant so the field
// always shows the link that's actually live.
//
// LC_DISCORD_USER_ID is the LC's raw Discord user (snowflake) ID. When
// set, the daily birthday cron DMs that user the day's agent birthdays.
// Empty by default, so the feature stays off until an ID is entered.
const KEYS = ['LC_CALENDAR_URL', 'LC_DISCORD_USER_ID'] as const

const DEFAULTS: Record<(typeof KEYS)[number], string> = {
  LC_CALENDAR_URL,
  LC_DISCORD_USER_ID: '',
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const values = await getSettings([...KEYS])
  const out: Record<string, string> = {}
  for (const k of KEYS) out[k] = values[k] || DEFAULTS[k]
  return NextResponse.json({ settings: out })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const body = await req.json() as Record<string, unknown>
  for (const k of KEYS) {
    if (typeof body[k] === 'string') {
      await setSetting(k, (body[k] as string).trim())
    }
  }
  return NextResponse.json({ ok: true })
}
