import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { getGhlConfig, getOrCreateGhlContactId, sendGhlEmail, OPS_MAILBOX } from '@/lib/ghl'

// POST /api/admin/progress-matrix/cohort-email
// Sends one personalized email to every agent in a cohort (the blocker groups
// on the On-Track Cohorts view). Mirrors the phase-item reminder sender: paced,
// personalized with {{firstName}} etc., and each send audit-logged. Gated to
// admins.
export const maxDuration = 300
const SEND_DELAY_MS = 250
const MAX_RECIPIENTS = 200

interface PostBody {
  agentProfileIds: string[]
  subject: string
  body: string
  cohortLabel: string
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
    return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients per send` }, { status: 400 })
  }
  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'subject and body required' }, { status: 400 })
  }
  const cohortLabel = (body.cohortLabel || 'cohort').slice(0, 120)

  const recipients = await db.agentProfile.findMany({
    where: { id: { in: body.agentProfileIds }, status: 'ACTIVE', isTest: false, isReferralPartner: false, isLeadership: false },
    select: { id: true, firstName: true, lastName: true, agentCode: true, phase: true, agentUser: { select: { email: true } } },
  })

  // Dry run: report who WOULD receive it without sending or logging.
  if (body.test) {
    return NextResponse.json({
      ok: true, test: true,
      wouldSend: recipients.filter(r => r.agentUser?.email).length,
      noEmail: recipients.filter(r => !r.agentUser?.email).length,
      sampleTo: recipients.slice(0, 5).map(r => `${r.firstName} ${r.lastName}`),
    })
  }

  const config = await getGhlConfig()
  let sent = 0, failed = 0, skipped = 0

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]
    const email = r.agentUser?.email
    if (!email) { skipped++; continue }

    const replacements: Record<string, string> = {
      firstName: r.firstName, lastName: r.lastName, agentCode: r.agentCode, phase: String(r.phase), cohort: cohortLabel,
    }
    const personalize = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => replacements[k] ?? `{{${k}}}`)
    const finalSubject = personalize(body.subject.trim())
    const finalBody = personalize(body.body.trim())
    const html = /<\w+[\s>]/.test(finalBody)
      ? finalBody
      : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; color: #1F2937; white-space: pre-wrap;">${escapeHtml(finalBody)}</div>`

    let status: 'sent' | 'failed' = 'sent'
    let errorMessage: string | null = null
    let ghlMessageId: string | null = null
    try {
      const contactId = await getOrCreateGhlContactId({ email, firstName: r.firstName, lastName: r.lastName, tags: ['agent-portal'], config })
      if (!contactId) throw new Error('Could not resolve GHL contact id')
      const res = await sendGhlEmail({ contactId, emailTo: email, subject: finalSubject, html, emailFrom: OPS_MAILBOX.email, emailFromName: OPS_MAILBOX.name, config })
      const data = await res.json().catch(() => ({})) as { messageId?: string }
      ghlMessageId = data.messageId ?? null
      sent++
    } catch (err) {
      status = 'failed'
      errorMessage = err instanceof Error ? err.message : String(err)
      failed++
    }

    // Best-effort audit row (reuses the reminder log; phase 0 marks a cohort send).
    await db.phaseItemReminder.create({
      data: {
        phase: 0, itemKey: `cohort:${cohortLabel}`, itemLabel: cohortLabel,
        recipientAgentProfileId: r.id, sentByAdminId: adminId,
        subject: finalSubject, bodyPreview: finalBody.slice(0, 500),
        status, errorMessage: errorMessage ?? undefined, ghlMessageId: ghlMessageId ?? undefined,
      },
    }).catch(() => {})

    if (i < recipients.length - 1) await new Promise(res => setTimeout(res, SEND_DELAY_MS))
  }

  return NextResponse.json({ ok: true, sent, failed, skipped, requested: body.agentProfileIds.length })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
