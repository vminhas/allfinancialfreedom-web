import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { getGhlConfig, sendGhlEmail } from '@/lib/ghl'
import { substituteVars, substituteVarsHtml, wrapInShell, PREVIEW_CONTEXT } from '@/lib/email-template'

// POST /api/admin/email-templates/[id]/test-send
//
// Renders the template with the canned PREVIEW_CONTEXT (sample values
// like "Caytlin Farmer", "Wednesday, May 28..."), wraps it in the
// brand shell, and sends it to a real email via the GHL conversations
// API. Used by the editor's "Send Test" button so an admin can verify
// (a) the GHL connection works, (b) the variable substitution + body
// render correctly, and (c) the chosen sender's mailbox can actually
// deliver mail.
//
// Requires a contactId in GHL since the conversations API is scoped
// to a contact. The body asks for the test contact id alongside the
// test email so the admin can use a dedicated "test" contact in GHL.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { id } = await ctx.params
  const body = await req.json() as { toEmail?: string; toContactId?: string }
  if (!body.toEmail || !body.toContactId) {
    return NextResponse.json(
      { error: 'toEmail + toContactId required. The GHL conversations API needs an existing contact id.' },
      { status: 400 },
    )
  }

  const template = await db.emailTemplate.findUnique({
    where: { id },
    include: { sender: true },
  })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  if (!template.sender) {
    return NextResponse.json({ error: 'Template has no sender assigned' }, { status: 400 })
  }

  const sampleCtx = template.eventType ? (PREVIEW_CONTEXT[template.eventType] ?? {}) : {}
  const subject = `[TEST] ${substituteVars(template.subject, sampleCtx)}`
  const bodyHtml = substituteVarsHtml(template.bodyHtml, sampleCtx)
  const html = wrapInShell({
    title: subject,
    bodyHtml,
    senderName: template.sender.name,
    senderRole: template.sender.role ?? '',
    preheader: 'Test email from the AFF vault template editor.',
  })

  try {
    const config = await getGhlConfig()
    if (!config.apiKey || !config.locationId) {
      return NextResponse.json(
        { error: 'GHL config not set in vault settings. Configure GHL_API_KEY + GHL_LOCATION_ID first.' },
        { status: 503 },
      )
    }
    await sendGhlEmail({
      contactId: body.toContactId,
      emailTo: body.toEmail,
      subject,
      html,
      emailFrom: template.sender.email,
      emailFromName: template.sender.name,
      config,
    })
    return NextResponse.json({ ok: true, sentTo: body.toEmail })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
