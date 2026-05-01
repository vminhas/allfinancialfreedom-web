import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSettings, setSetting } from '@/lib/settings'

const ALLOWED_KEYS = [
  'GHL_API_KEY', 'GHL_LOCATION_ID', 'GHL_PIPELINE_ID',
  'ANTHROPIC_API_KEY',
  'GHL_PROPHOG_BOOKING_URL', 'VICK_EMAIL',
  // Zoom Server-to-Server OAuth credentials for attendance sync.
  'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET',
  // Attendance threshold (percentage of meeting duration). Stored as
  // a string for consistency with the rest of the settings table.
  'ATTENDANCE_PRESENT_THRESHOLD_PCT',
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const values = await getSettings(ALLOWED_KEYS)

  // Mask secrets — return only last 4 chars for display
  const masked: Record<string, string> = {}
  for (const key of ALLOWED_KEYS) {
    const v = values[key] ?? ''
    masked[key] = v.length > 4 ? `${'•'.repeat(v.length - 4)}${v.slice(-4)}` : v ? '••••' : ''
  }

  return NextResponse.json({ settings: masked })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined && body[key] !== '') {
      await setSetting(key, body[key])
    }
  }

  return NextResponse.json({ ok: true })
}
