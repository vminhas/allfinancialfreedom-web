import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSettings } from '@/lib/settings'

// Read-only, agent-facing slice of the settings table. Only the keys
// the portal genuinely needs are exposed here. Values are returned raw
// (empty string when unset); the client falls back to its built-in
// constant so a missing row never breaks the UI.
const KEYS = ['LC_CALENDAR_URL'] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session || (role !== 'agent' && role !== 'admin' && role !== 'licensing_coordinator')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const values = await getSettings([...KEYS])
  const out: Record<string, string> = {}
  for (const k of KEYS) out[k] = values[k] ?? ''
  return NextResponse.json({ settings: out })
}
