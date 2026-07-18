import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { getGhlConfig, getOrCreateGhlContactId, sendGhlEmail, OPS_MAILBOX } from '@/lib/ghl'
import { createZoomMeeting } from '@/lib/zoom'

// POST /api/admin/progress-matrix/schedule-training
// Creates a Zoom meeting for a cohort training and emails the join link + time
// to every agent in the group. Admin-gated. `test: true` reports the recipient
// list without creating a meeting or sending anything.
export const maxDuration = 300
const SEND_DELAY_MS = 250
const MAX_RECIPIENTS = 200

interface PostBody {
  agentProfileIds: string[]
  cohortLabel: string
  training: string
  startTime: string        // naive local datetime, e.g. "2026-07-20T15:00" (interpreted Eastern)
  durationMinutes?: number
  test?: boolean
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const adminId = (session?.user as { id?: string })?.id
  if (!adminId) return NextResponse.json({ error: 'Missing admin id' }, { status: 401 })

  const body = await req.json() as PostBody
  if (!Array.isArray(body.agentProfileIds) || body.agentProfileIds.length === 0) {
    return NextResponse.json({ error: 'agentProfileIds required' }, { status: 400 })
  }
  if (body.agentProfileIds.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients` }, { status: 400 })
  }
  if (!body.training?.trim() || !body.startTime?.trim()) {
    return NextResponse.json({ error: 'training and startTime required' }, { status: 400 })
  }

  const recipients = await db.agentProfile.findMany({
    where: { id: { in: body.agentProfileIds }, status: 'ACTIVE', isTest: false, isReferralPartner: false, isLeadership: false },
    select: { id: true, firstName: true, lastName: true, agentCode: true, phase: true, agentUser: { select: { email: true } } },
  })

  const whenLabel = formatWhen(body.startTime)

  if (body.test) {
    return NextResponse.json({
      ok: true, test: true, whenLabel,
      wouldSend: recipients.filter(r => r.agentUser?.email).length,
      noEmail: recipients.filter(r => !r.agentUser?.email).length,
    })
  }

  // 1) Create the Zoom meeting.
  let joinUrl: string
  let meetingId: number
  try {
    const m = await createZoomMeeting({
      topic: `${body.training} — AFF`,
      startTime: body.startTime,
      durationMinutes: body.durationMinutes ?? 60,
      agenda: `${body.training} for the "${body.cohortLabel}" cohort.`,
      timezone: 'America/New_York',
    })
    joinUrl = m.joinUrl
    meetingId = m.id
  } catch (err) {
    return NextResponse.json({ error: `Could not create the Zoom meeting: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }

  // 2) Email the group the invite.
  const config = await getGhlConfig()
  let sent = 0, failed = 0, skipped = 0
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]
    const email = r.agentUser?.email
    if (!email) { skipped++; continue }
    const subject = `You're scheduled: ${body.training} (${whenLabel})`
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1F2937">
      <p>Hi ${escapeHtml(r.firstName)},</p>
      <p>You're scheduled for <strong>${escapeHtml(body.training)}</strong> to help you clear your next milestone.</p>
      <p><strong>When:</strong> ${escapeHtml(whenLabel)} (Eastern)<br/>
      <strong>Join Zoom:</strong> <a href="${joinUrl}">${joinUrl}</a></p>
      <p>See you there.<br/>All Financial Freedom</p>
    </div>`
    try {
      const contactId = await getOrCreateGhlContactId({ email, firstName: r.firstName, lastName: r.lastName, tags: ['agent-portal'], config })
      if (!contactId) throw new Error('no contact id')
      await sendGhlEmail({ contactId, emailTo: email, subject, html, emailFrom: OPS_MAILBOX.email, emailFromName: OPS_MAILBOX.name, config })
      sent++
    } catch { failed++ }
    if (i < recipients.length - 1) await new Promise(res => setTimeout(res, SEND_DELAY_MS))
  }

  return NextResponse.json({ ok: true, joinUrl, meetingId, whenLabel, sent, failed, skipped })
}

// Format "2026-07-20T15:00" as "Mon Jul 20, 3:00 PM" without timezone math.
function formatWhen(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return s
  const [, y, mo, d, hh, mm] = m
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h = Number(hh)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${months[Number(mo) - 1]} ${Number(d)}, ${y} · ${h12}:${mm} ${ampm}`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
