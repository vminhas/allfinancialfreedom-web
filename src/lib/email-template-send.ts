// Orchestrator for "GHL event landed, find matching templates, render
// each one, send each one." Used by the GHL webhook route + the test-
// send admin endpoint. Side-effects:
//   1. Iterates every enabled EmailTemplate matching `eventType`.
//   2. Applies each template's filter against the contact's tags.
//   3. Substitutes variables in subject + body, wraps in the brand
//      shell, calls sendGhlEmail via the template's sender identity.
//   4. Records results so the webhook log can show which templates
//      fired and which got skipped (filter mismatch, missing
//      recipient, etc.).

import { db } from './db'
import { sendGhlEmail, getGhlConfig } from './ghl'
import {
  substituteVars,
  substituteVarsHtml,
  filterMatches,
  wrapInShell,
  type RenderContext,
} from './email-template'

export interface DispatchInput {
  eventType: string
  // The GHL contact involved in the event. May be null if we couldn't
  // resolve one (e.g. join-form path where the contact gets created
  // by us, not GHL).
  contact: {
    id: string | null
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
    tags?: string[] | null
  } | null
  // The render context the templates can reference via {{varName}}.
  // Caller assembles this with already-formatted display values.
  context: RenderContext
}

export interface DispatchTemplateResult {
  templateKey: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
  error?: string
}

export interface DispatchResult {
  fired: string[]   // keys of templates that sent
  skipped: string[] // keys of templates that matched eventType but didn't send
  details: DispatchTemplateResult[]
}

export async function dispatchTemplatesForEvent(
  input: DispatchInput,
): Promise<DispatchResult> {
  const templates = await db.emailTemplate.findMany({
    where: { eventType: input.eventType, enabled: true },
    include: { sender: true },
  })

  const fired: string[] = []
  const skipped: string[] = []
  const details: DispatchTemplateResult[] = []
  const tags = input.contact?.tags ?? []

  // GHL config fetched once and reused across all sends in this event
  // so we don't re-hit the settings table per template.
  const config = templates.length > 0 ? await getGhlConfig().catch(() => null) : null
  if (templates.length > 0 && (!config?.apiKey || !config.locationId)) {
    return {
      fired: [], skipped: templates.map(t => t.key),
      details: templates.map(t => ({
        templateKey: t.key,
        status: 'failed',
        error: 'GHL config not set in vault settings',
      })),
    }
  }

  for (const t of templates) {
    if (!t.sender) {
      skipped.push(t.key)
      details.push({ templateKey: t.key, status: 'skipped', reason: 'no sender assigned' })
      continue
    }
    if (!filterMatches(t.filterJson, tags)) {
      skipped.push(t.key)
      details.push({ templateKey: t.key, status: 'skipped', reason: 'filter mismatch' })
      continue
    }

    // Resolve recipient. CONTACT path uses the contact's email; the
    // INTERNAL path uses the template's internalTo. Either way, we
    // need a contactId for the GHL conversations API, so for INTERNAL
    // sends with no contactId we fall back to a configured fallback
    // (e.g. a dedicated "internal" GHL contact). For now: skip if no
    // contactId at all.
    let emailTo: string | null = null
    if (t.recipient === 'CONTACT') {
      emailTo = input.contact?.email ?? null
    } else if (t.recipient === 'INTERNAL') {
      emailTo = t.internalTo ?? null
    }
    if (!emailTo || !input.contact?.id) {
      skipped.push(t.key)
      details.push({
        templateKey: t.key,
        status: 'skipped',
        reason: !emailTo ? 'no recipient resolved' : 'no GHL contactId on event',
      })
      continue
    }

    const subject = substituteVars(t.subject, input.context)
    const bodyHtml = substituteVarsHtml(t.bodyHtml, input.context)
    const html = wrapInShell({
      title: subject,
      bodyHtml,
      senderName: t.sender.name,
      senderRole: t.sender.role ?? '',
    })

    try {
      await sendGhlEmail({
        contactId: input.contact.id,
        emailTo,
        subject,
        html,
        emailFrom: t.sender.email,
        emailFromName: t.sender.name,
        config: config ?? undefined,
      })
      fired.push(t.key)
      details.push({ templateKey: t.key, status: 'sent' })
    } catch (err) {
      details.push({
        templateKey: t.key,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { fired, skipped, details }
}
