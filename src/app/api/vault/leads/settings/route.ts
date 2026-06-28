import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { getSettings, setSetting } from '@/lib/settings'
import { LEAD_MESSAGE_SETTING_KEYS, LEAD_MESSAGE_DEFAULTS } from '@/lib/annuity-leads'

// Editable speed-to-lead message templates (SMS + confirmation email) for
// the annuity lead pipeline. Not secrets, so returned in full. Admin + LC.

const KEYS = [
  LEAD_MESSAGE_SETTING_KEYS.sms,
  LEAD_MESSAGE_SETTING_KEYS.emailSubject,
  LEAD_MESSAGE_SETTING_KEYS.emailBody,
]

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const saved = await getSettings(KEYS)
  return NextResponse.json({
    sms: saved[LEAD_MESSAGE_SETTING_KEYS.sms] || LEAD_MESSAGE_DEFAULTS.sms,
    emailSubject: saved[LEAD_MESSAGE_SETTING_KEYS.emailSubject] || LEAD_MESSAGE_DEFAULTS.emailSubject,
    emailBody: saved[LEAD_MESSAGE_SETTING_KEYS.emailBody] || LEAD_MESSAGE_DEFAULTS.emailBody,
    defaults: LEAD_MESSAGE_DEFAULTS,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as {
    sms?: unknown; emailSubject?: unknown; emailBody?: unknown
  }
  const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''

  // Empty value resets to default (we store the default text rather than
  // an empty string so the send path always has copy).
  if (body.sms !== undefined) await setSetting(LEAD_MESSAGE_SETTING_KEYS.sms, str(body.sms) || LEAD_MESSAGE_DEFAULTS.sms)
  if (body.emailSubject !== undefined) await setSetting(LEAD_MESSAGE_SETTING_KEYS.emailSubject, str(body.emailSubject) || LEAD_MESSAGE_DEFAULTS.emailSubject)
  if (body.emailBody !== undefined) await setSetting(LEAD_MESSAGE_SETTING_KEYS.emailBody, str(body.emailBody) || LEAD_MESSAGE_DEFAULTS.emailBody)

  return NextResponse.json({ ok: true })
}
