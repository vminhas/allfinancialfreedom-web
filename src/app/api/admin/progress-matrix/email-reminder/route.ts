import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { getGhlConfig, sendGhlEmail, getOrCreateGhlContactId, OPS_MAILBOX } from '@/lib/ghl'

// POST /api/admin/progress-matrix/email-reminder
//
// Bulk-email a "you haven't completed {item} yet" nudge to a list of
// agent profile ids. The drawer on /vault/progress posts here when an
// admin clicks "Send reminder to N agents." Each send is logged to
// PhaseItemReminder so we can answer "did anyone already nudge this
// person tonight?" later if we want a cooldown.
//
// Recipients are resolved server-side from agentProfileIds (not from
// emails the client sent) to prevent a hostile/typo'd payload from
// emailing arbitrary addresses. Same reason we re-snapshot itemLabel.
//
// Sends are sequential with a small delay between each so we don't
// trip GHL's rate limit on a 50-recipient blast. Failures don't
// abort the batch — each one logs status='failed' with the error.

interface PostBody {
  phase: number
  itemKey: string
  agentProfileIds: string[]
  subject: string
  body: string  // HTML or plain text; we wrap it minimally
}

// Cap size so the admin can't accidentally fire 1000 emails at once.
// Realistic batch is one phase's roster (~30) at most.
const MAX_RECIPIENTS = 100

// 250ms gap between GHL calls. GHL's published rate limit is
// 100 requests / 10 seconds; we're well under that, plus this
// keeps the UX predictable on a 30-person blast (~7s total).
const SEND_DELAY_MS = 250

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// getOrCreateGhlContactId now lives in @/lib/ghl (shared with the LC
// daily digest). This route's calls pass tags: ['agent-portal'] to keep
// the prior behavior.

// 5 minutes — large enough to cover a 100-recipient batch with
// 250ms-per-send pacing plus GHL round-trip variance.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const adminId = (session?.user as { id?: string })?.id
  if (!adminId) return NextResponse.json({ error: 'Missing admin id' }, { status: 401 })

  const body = await req.json() as PostBody
  if (!body.itemKey || typeof body.phase !== 'number') {
    return NextResponse.json({ error: 'phase + itemKey required' }, { status: 400 })
  }
  if (!Array.isArray(body.agentProfileIds) || body.agentProfileIds.length === 0) {
    return NextResponse.json({ error: 'agentProfileIds required' }, { status: 400 })
  }
  if (body.agentProfileIds.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients per send` }, { status: 400 })
  }
  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'subject and body required' }, { status: 400 })
  }

  // Re-snapshot the item label from the definition so the audit row
  // captures what the item was called at send time, even if it's
  // renamed later. Falls back to the bare itemKey if the definition
  // is missing (shouldn't happen, but doesn't block the send).
  const itemDef = await db.phaseItemDefinition.findFirst({
    where: { phase: body.phase, itemKey: body.itemKey },
    select: { label: true },
  })
  const itemLabel = itemDef?.label ?? body.itemKey

  // Pull recipients server-side. Filters by status=ACTIVE and !isTest
  // even though the matrix already filtered them — defense in depth
  // against a stale client cache submitting an inactive profile id.
  const recipients = await db.agentProfile.findMany({
    where: {
      id: { in: body.agentProfileIds },
      status: 'ACTIVE',
      isTest: false,
      isReferralPartner: false,
    },
    select: {
      id: true, firstName: true, lastName: true, agentCode: true, phase: true,
      agentUser: { select: { email: true } },
    },
  })

  const config = await getGhlConfig()
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const r of recipients) {
    const email = r.agentUser?.email
    if (!email) {
      skipped += 1
      await db.phaseItemReminder.create({
        data: {
          phase: body.phase, itemKey: body.itemKey, itemLabel,
          recipientAgentProfileId: r.id, sentByAdminId: adminId,
          subject: body.subject.trim(),
          bodyPreview: body.body.trim().slice(0, 500),
          status: 'skipped_no_email',
        },
      }).catch(() => {})
      continue
    }

    // Personalize each send. Subject and body get {{firstName}},
    // {{lastName}}, {{itemLabel}}, {{phase}}, {{agentCode}} substitutions
    // so the admin can write one template that lands as 30 unique emails.
    const replacements: Record<string, string> = {
      firstName: r.firstName,
      lastName: r.lastName,
      itemLabel,
      phase: String(r.phase),
      agentCode: r.agentCode,
    }
    const personalize = (text: string) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, k) => replacements[k as keyof typeof replacements] ?? `{{${k}}}`)

    const finalSubject = personalize(body.subject.trim())
    const finalBody = personalize(body.body.trim())
    // Wrap plain-text body in minimal HTML so line breaks render
    // (GHL's email path expects html). If the admin already pasted
    // HTML, leave it alone; we detect by checking for an opening tag.
    const html = /<\w+[\s>]/.test(finalBody)
      ? finalBody
      : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; color: #1F2937; white-space: pre-wrap;">${escapeHtml(finalBody)}</div>`

    let status: 'sent' | 'failed' = 'sent'
    let errorMessage: string | null = null
    let ghlMessageId: string | null = null

    try {
      const contactId = await getOrCreateGhlContactId({
        email, firstName: r.firstName, lastName: r.lastName, tags: ['agent-portal'], config,
      })
      if (!contactId) throw new Error('Could not resolve GHL contact id')

      const res = await sendGhlEmail({
        contactId,
        emailTo: email,
        subject: finalSubject,
        html,
        emailFrom: OPS_MAILBOX.email,
        emailFromName: OPS_MAILBOX.name,
        config,
      })
      const data = await res.json().catch(() => ({})) as { messageId?: string; msg?: string }
      ghlMessageId = data.messageId ?? null
      sent += 1
    } catch (err) {
      status = 'failed'
      errorMessage = err instanceof Error ? err.message : String(err)
      failed += 1
    }

    await db.phaseItemReminder.create({
      data: {
        phase: body.phase, itemKey: body.itemKey, itemLabel,
        recipientAgentProfileId: r.id, sentByAdminId: adminId,
        subject: finalSubject,
        bodyPreview: finalBody.slice(0, 500),
        status,
        errorMessage: errorMessage ?? undefined,
        ghlMessageId: ghlMessageId ?? undefined,
      },
    }).catch(() => {})

    if (recipients.indexOf(r) < recipients.length - 1) {
      await sleep(SEND_DELAY_MS)
    }
  }

  return NextResponse.json({
    ok: true,
    sent, failed, skipped,
    requested: body.agentProfileIds.length,
    matched: recipients.length,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
