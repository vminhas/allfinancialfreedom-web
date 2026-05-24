import { NextRequest, NextResponse } from 'next/server'
import { getGhlConfig } from '@/lib/ghl'
import { getSetting } from '@/lib/settings'
import { db } from '@/lib/db'
import { dispatchTemplatesForEvent } from '@/lib/email-template-send'
import { ensureEmailTemplateSeed } from '@/lib/email-template-seed'
import type { RenderContext } from '@/lib/email-template'

// GHL inbound webhook. GHL workflows POST here when a contact takes a
// configured action (appointment booked, tag added, etc.). The route's
// job is:
//
//   1. Decide which AFF event type this is (AppointmentCreate, etc.).
//   2. Build a render context (the variables admins reference via
//      {{firstName}}, {{appointmentTime}}, etc.).
//   3. Hand off to dispatchTemplatesForEvent — that walks every
//      EmailTemplate matching the event type, renders, and sends.
//   4. Record the event + which templates fired into
//      ghl_webhook_events so /vault/email-templates can show GHL
//      activity ("last received from GHL N minutes ago").
//
// Side effects beyond email (e.g. advancing an opportunity pipeline
// stage on AppointmentCreate) stay inline here rather than running
// as a template — they're event handling, not messaging.

// ── Calendar classification ──────────────────────────────────────
// Maps calendar names to pipeline actions so recruiting calendars
// advance leads while internal calendars (coaching, FTA, etc.) don't.
interface CalendarClassification {
  pipelineStage: string | null  // null = don't advance recruiting pipeline
  assignedTo: string | null
  isRecruiting: boolean
}

function classifyCalendar(name: string): CalendarClassification {
  const lower = name.toLowerCase()

  // Interview calendars → Interview Booked
  if (lower.includes('hiring interview') || lower.includes('interview with')) {
    return { pipelineStage: 'Interview Booked', assignedTo: extractAssignee(name), isRecruiting: true }
  }

  // Recruiting/discovery calendars → Discovery Booked
  if (lower.includes('discovery') || lower.includes('opportunity meeting') ||
      lower.includes('intro meeting') || lower.includes('info session') ||
      lower.includes('meet & greet') || lower.includes('meet and greet') ||
      lower.includes('follow-up') || lower.includes('follow up')) {
    return { pipelineStage: 'Discovery Booked', assignedTo: extractAssignee(name), isRecruiting: true }
  }

  // Internal calendars — coaching, FTA, licensing, PFR, personal
  if (lower.includes('coaching') || lower.includes('field training') ||
      lower.includes('licensing') || lower.includes('onboarding') ||
      lower.includes('pfr') || lower.includes('financial review') ||
      lower.includes('personal calendar')) {
    return { pipelineStage: null, assignedTo: extractAssignee(name), isRecruiting: false }
  }

  // Unknown calendar — default to recruiting (Discovery Booked)
  return { pipelineStage: 'Discovery Booked', assignedTo: extractAssignee(name), isRecruiting: true }
}

function extractAssignee(calendarName: string): string | null {
  const match = calendarName.match(/with\s+(.+)/i)
  return match ? match[1].trim() : null
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    console.log('GHL Webhook received:', JSON.stringify(payload, null, 2))

    // Normalize the GHL event-name surface. GHL sometimes uses dot
    // case, sometimes PascalCase, depending on which workflow node
    // fires. We canonicalize to the PascalCase form used in
    // EmailTemplate.eventType.
    const rawType = payload.type ?? payload.event
    const eventType = normalizeEventType(rawType)

    // Make sure the default senders + templates exist. Idempotent —
    // no-op after the first call.
    await ensureEmailTemplateSeed()

    if (eventType === 'AppointmentCreate') {
      return await handleAppointmentCreate(payload)
    }

    // Unknown event — log it so admins can see GHL is hitting us but
    // we don't have a handler yet, and so they can add a template via
    // the vault if they want to wire one up.
    await db.ghlWebhookEvent.create({
      data: {
        eventType: eventType ?? String(rawType ?? 'unknown'),
        contactId: payload.contactId ?? null,
        contactEmail: payload.email ?? null,
        payload,
        templatesFired: [],
        templatesSkipped: [],
      },
    })
    return NextResponse.json({ ok: true, skipped: eventType ?? rawType })

  } catch (err) {
    console.error('GHL webhook error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

function normalizeEventType(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const lower = raw.toLowerCase()
  if (lower === 'appointmentcreate' || lower === 'appointment.created') return 'AppointmentCreate'
  if (lower === 'joinformsubmitted' || lower === 'joinform.submitted') return 'JoinFormSubmitted'
  // Pass through unknown ones so admins can add templates for new
  // event types directly from the vault.
  return raw
}

async function handleAppointmentCreate(payload: {
  contactId?: string
  startTime?: string
  [k: string]: unknown
}) {
  const contactId = payload.contactId
  const startTime = payload.startTime ?? ''
  if (!contactId) {
    return NextResponse.json({ ok: true, skipped: 'no contactId' })
  }

  const config = await getGhlConfig()
  const pipelineId = await getSetting('GHL_PIPELINE_ID') || 'mnZ9OIMMkjGo30LAxLDj'
  const discoveryStageId = await getSetting('GHL_STAGE_DISCOVERY_BOOKED') || '289575e7-21d9-4839-8609-54afdf2150d3'
  const bookingUrl = process.env.GHL_BOOKING_URL || 'https://links.allfinancialfreedom.com/widget/booking/7kEmIuWI4a70Vfo0cDFg'

  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
  }

  // Fetch contact + their opportunity in parallel.
  const [contactRes, oppRes] = await Promise.all([
    fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, { headers }),
    fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${config.locationId}&contact_id=${contactId}&pipeline_id=${pipelineId}`, { headers }),
  ])

  const contact = contactRes.ok ? (await contactRes.json()).contact : null
  const opportunity = oppRes.ok ? (await oppRes.json()).opportunities?.[0] : null

  // Pipeline-stage advancement — non-templated side effect. Always
  // runs when there's an opportunity; templates handle the email.
  let advanced = false
  if (opportunity?.id) {
    await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunity.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ pipelineStageId: discoveryStageId }),
    })
    advanced = true
  }

  const calendarName = (payload as Record<string, unknown>).calendarName as string ?? (payload as Record<string, unknown>).calendar_name as string ?? 'Unknown Calendar'
  const calendarId = (payload as Record<string, unknown>).calendarId as string ?? null
  const classification = classifyCalendar(calendarName)

  // Build the render context with display-formatted values. Anything
  // a template might {{interpolate}} gets a key here.
  const tags: string[] = Array.isArray(contact?.tags) ? contact.tags : []
  let localContact = contact?.email
    ? await db.contact.findFirst({
        where: { email: contact.email.toLowerCase() },
        include: { importJob: { select: { contextPrompt: true, fileName: true } } },
      })
    : null

  // Create a local Contact if this is a NEW person booking a recruiting
  // calendar (e.g. someone from the website or Instagram who isn't in
  // our local DB yet). This ensures every recruiting lead gets tracked
  // in the pipeline from the moment they book.
  let localContactId = localContact?.id ?? null
  if (!localContactId && contact?.email && classification.isRecruiting) {
    try {
      // Detect source from GHL tags
      let source = 'website'
      if (tags.some(t => t.toLowerCase().includes('breezy'))) source = 'breezy'
      else if (tags.some(t => t.toLowerCase().includes('instagram'))) source = 'instagram'
      else if (tags.some(t => t.toLowerCase() === 'join-applicant')) source = 'join-form'
      else if (tags.some(t => t.toLowerCase().includes('prophog'))) source = 'prophog'

      const created = await db.contact.create({
        data: {
          firstName: contact.firstName ?? 'Unknown',
          lastName: contact.lastName ?? '',
          email: contact.email.toLowerCase(),
          phone: contact.phone ?? null,
          ghlContactId: contactId,
          source,
          outreachStatus: 'responded',
        },
      })
      localContactId = created.id
    } catch {
      // Unique constraint on email — contact might exist under a slightly
      // different casing or was created between the findFirst and create.
    }
  }

  // Store appointment locally for tracking show/no-show
  try {
    const eventId = (payload as Record<string, unknown>).id as string ?? (payload as Record<string, unknown>).appointmentId as string ?? null
    const assignee = classification.assignedTo ?? calendarName
    await db.ghlAppointment.upsert({
      where: { ghlEventId: eventId ?? `manual-${contactId}-${startTime}` },
      create: {
        ghlCalendarId: calendarId,
        ghlEventId: eventId,
        calendarName,
        contactId: localContactId ?? undefined,
        contactName: `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim() || 'Unknown',
        contactEmail: contact?.email ?? null,
        contactPhone: contact?.phone ?? null,
        appointmentDate: startTime ? new Date(startTime) : new Date(),
        assignedTo: assignee,
        source: calendarName,
        pipelineAction: classification.pipelineStage,
      },
      update: { appointmentDate: startTime ? new Date(startTime) : undefined, calendarName, assignedTo: assignee },
    })

    // Advance pipeline based on calendar classification
    if (localContactId && classification.pipelineStage) {
      await db.contact.update({
        where: { id: localContactId },
        data: {
          ghlPipelineStage: classification.pipelineStage,
          ghlStageUpdatedAt: new Date(),
          ghlAppointmentDate: startTime ? new Date(startTime) : null,
          assignedTo: assignee,
          ...(localContact?.ghlContactId ? {} : { ghlContactId: contactId }),
        },
      }).catch(() => {})
    }
  } catch (err) {
    console.error('[ghl-webhook] failed to store appointment:', err)
  }

  const customField = (key: string): string | null => {
    const fields = contact?.customFields as { key: string; fieldValue?: string }[] | undefined
    return fields?.find(f => f.key === key)?.fieldValue ?? null
  }

  const context: RenderContext = {
    firstName:       contact?.firstName ?? '',
    lastName:        contact?.lastName ?? '',
    email:           contact?.email ?? '',
    phone:           contact?.phone ?? '',
    appointmentTime: startTime ? formatDateTime(startTime) : '',
    rescheduleUrl:   bookingUrl,
    licenseType:     localContact?.licenseType ?? customField('license_type') ?? '—',
    currentAgency:   localContact?.currentAgency ?? '—',
    state:           localContact?.state ?? contact?.address1 ?? '—',
    importFileName:  localContact?.importJob?.fileName ?? '—',
    importContext:   localContact?.importJob?.contextPrompt ?? '',
    leadType:        localContact?.wornOut ? 'Worn Out (soft touch sequence)' : 'Fresh Lead',
  }

  // Fan out to every matching template (e.g. the public Discovery
  // Confirmation + the internal PropHog briefing, gated by filter).
  const result = await dispatchTemplatesForEvent({
    eventType: 'AppointmentCreate',
    contact: contact ? {
      id: contact.id,
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      tags,
    } : null,
    context,
  })

  // Audit-trail log row — surfaces in /vault/email-templates so the
  // admin can verify the connection and see which templates fired.
  await db.ghlWebhookEvent.create({
    data: {
      eventType: 'AppointmentCreate',
      contactId: contact?.id ?? null,
      contactEmail: contact?.email ?? null,
      payload: payload as object,
      templatesFired: result.fired,
      templatesSkipped: result.skipped,
    },
  })

  return NextResponse.json({
    ok: true,
    advanced,
    fired: result.fired,
    skipped: result.skipped,
    details: result.details,
  })
}
