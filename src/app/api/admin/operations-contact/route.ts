import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { getSettings, setSetting } from '@/lib/settings'

// Operations contact info — drives the auto-welcome email's voice and
// signature. Stored in the same encrypted settings table as other config
// (overkill for non-secrets, but keeps one storage layer); returned in
// plaintext since none of these are credentials.
const KEYS = [
  'OPERATIONS_CONTACT_NAME',
  'OPERATIONS_CONTACT_LAST_NAME',
  'OPERATIONS_CONTACT_EMAIL',
  'OPERATIONS_CONTACT_PHONE',
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
      await setSetting(k, body[k] as string)
    }
  }
  return NextResponse.json({ ok: true })
}
