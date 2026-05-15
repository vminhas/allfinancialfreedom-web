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

// Events the inbound GHL webhook is allowed to dispatch. Anything
// not in this set is an "internal trigger" event (agent onboarding,
// CEO intro) that is fired by code calling the template directly by
// key, NEVER by an inbound webhook. A misconfigured DB row with one
// of these eventTypes will not send from the webhook path.
const WEBHOOK_DISPATCHABLE_EVENTS = new Set<string>([
  'AppointmentCreate',
  'JoinFormSubmitted',
  'MeetAndGreetBooked',
  'AppointmentNoShow',
])

// Hard blocklist: agent-onboarding / internal template keys that must
// NEVER be sent from the inbound webhook, even if someone sets their
// eventType to AppointmentCreate in the editor. This is the belt to
// the WEBHOOK_DISPATCHABLE_EVENTS suspenders — it caught the bug
// where a prospect booking a discovery call also received a "Set Up
// Your Portal" agent invite. Keys cover both the new template system
// and the legacy stub rows that predate it.
const WEBHOOK_BLOCKED_TEMPLATE_KEYS = new Set<string>([
  'agent-welcome',
  'ceo-warm-intro',
  'agent_invite',
  'referral_approved',
  'agent_reminder',
  'promotion_celebration',
])

export async function dispatchTemplatesForEvent(
  input: DispatchInput,
): Promise<DispatchResult> {
  // First guardrail: the webhook can only ever fire prospect/event
  // templates. An internal-trigger event type reaching here means a
  // misconfiguration upstream; refuse rather than risk sending an
  // agent invite to a cold prospect.
  if (!WEBHOOK_DISPATCHABLE_EVENTS.has(input.eventType)) {
    return {
      fired: [],
      skipped: [],
      details: [{
        templateKey: '(none)',
        status: 'skipped',
        reason: `event "${input.eventType}" is not webhook-dispatchable`,
      }],
    }
  }

  const rawTemplates = await db.emailTemplate.findMany({
    where: { eventType: input.eventType, enabled: true },
    include: { sender: true },
  })

  // Second guardrail: drop any agent-onboarding/internal template
  // that's mis-wired to a webhook event. This is what stops the
  // "discovery booking sends a portal invite" class of bug for good,
  // regardless of what an admin clicks in the editor.
  const blockedHere: string[] = []
  const templates = rawTemplates.filter(t => {
    if (WEBHOOK_BLOCKED_TEMPLATE_KEYS.has(t.key)) {
      blockedHere.push(t.key)
      return false
    }
    return true
  })
  if (blockedHere.length > 0) {
    console.warn(
      `[email-dispatch] blocked agent-onboarding template(s) mis-wired to webhook event ${input.eventType}: ${blockedHere.join(', ')}`,
    )
  }

  const fired: string[] = []
  const skipped: string[] = [...blockedHere]
  const details: DispatchTemplateResult[] = blockedHere.map(k => ({
    templateKey: k,
    status: 'skipped' as const,
    reason: 'blocked: agent-onboarding template cannot fire from a webhook event',
  }))
  const tags = input.contact?.tags ?? []

  // GHL config fetched once and reused across all sends in this event
  // so we don't re-hit the settings table per template.
  const config = templates.length > 0 ? await getGhlConfig().catch(() => null) : null
  if (templates.length > 0 && (!config?.apiKey || !config.locationId)) {
    return {
      fired: [], skipped: [...skipped, ...templates.map(t => t.key)],
      details: [
        ...details,
        ...templates.map(t => ({
          templateKey: t.key,
          status: 'failed' as const,
          error: 'GHL config not set in vault settings',
        })),
      ],
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
