import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { getSettings, setSetting } from '@/lib/settings'

// One-off "red carpet" config for a single distinguished guest. Stored
// in the encrypted settings table for consistency, returned plaintext
// (not credentials). Clearing VIP_ARRIVAL_AGENT_CODE fully disables the
// feature: the admin button and the portal welcome both vanish, no
// redeploy needed. That is the intended "remove it after he's done"
// switch.
const KEYS = [
  // agentCode of the guest who gets the treatment (empty = feature off).
  'VIP_ARRIVAL_AGENT_CODE',
  // Line shown under their name on the Discord card and the portal
  // welcome (e.g. "Co-Founder, GFI"). Optional.
  'VIP_ARRIVAL_TITLE',
] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const values = await getSettings([...KEYS])
  const out: Record<string, string> = {}
  for (const k of KEYS) out[k] = values[k] ?? ''
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
