import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { CONSENT_TEXT, scoreLead } from '@/lib/annuity-leads'
import { verifyWebhookSignature, fetchLeadData, mapLeadFields } from '@/lib/meta-leadgen'
import { routeLeadToGhl, notifyLeadDiscord } from '@/lib/lead-pipeline'

// Meta Lead Ads (Instant Form) webhook. Brings in-platform leads into the
// SAME pipeline as the landing page: Postgres (TCPA record + Vault),
// A-lead scoring, and GHL speed-to-lead SMS/email + Discord. No Meta CAPI
// here, the conversion already happened inside Meta.

// GET: Meta's subscription verification handshake. Echo hub.challenge when
// the verify token matches.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

interface LeadgenChange {
  field?: string
  value?: { leadgen_id?: string; form_id?: string; page_id?: string }
}
interface WebhookBody {
  object?: string
  entry?: { changes?: LeadgenChange[] }[]
}

export async function POST(req: NextRequest) {
  // Raw body is required for the signature check, read it once as text.
  const raw = await req.text()
  if (!verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Invalid signature', { status: 403 })
  }

  let body: WebhookBody
  try {
    body = JSON.parse(raw) as WebhookBody
  } catch {
    return new NextResponse('Bad request', { status: 400 })
  }

  // Collect every leadgen_id across all entries/changes.
  const leadgenIds: string[] = []
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'leadgen' && change.value?.leadgen_id) {
        leadgenIds.push(change.value.leadgen_id)
      }
    }
  }

  // Process best-effort. We always ack 200 so Meta doesn't retry a payload
  // we've already accepted; per-lead failures are logged, not surfaced.
  await Promise.allSettled(leadgenIds.map(processLead))

  return new NextResponse('OK', { status: 200 })
}

async function processLead(leadgenId: string): Promise<void> {
  try {
    // Idempotency: Meta can redeliver. We stash the leadgen_id in
    // metaEventId, so skip if we've already stored this one.
    const existing = await db.annuityLead.findFirst({
      where: { metaEventId: leadgenId },
      select: { id: true },
    })
    if (existing) return

    const fieldData = await fetchLeadData(leadgenId)
    if (!fieldData) return
    const m = mapLeadFields(fieldData)

    // Our schema needs an email + phone to be useful (and for speed-to-lead
    // to work). Instant Forms collect both by default; skip if somehow not.
    if (!m.email || !m.phone) {
      console.warn(`[meta-webhook] lead ${leadgenId} missing email/phone, skipping`)
      return
    }

    const score = scoreLead({ savingsBand: m.savingsBand, incomeTiming: m.incomeTiming })

    const lead = await db.annuityLead.create({
      data: {
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone,
        ageBand: m.ageBand,
        savingsBand: m.savingsBand,
        incomeTiming: m.incomeTiming,
        priority: m.priority,
        accountTypes: m.accountTypes,
        score,
        source: 'meta_instant_form',
        consentText: CONSENT_TEXT,
        consentedAt: new Date(),
        metaEventId: leadgenId,
        notes: m.extras.length ? m.extras.join('\n') : null,
      },
    })

    await Promise.allSettled([
      routeLeadToGhl({ leadId: lead.id, firstName: m.firstName, lastName: m.lastName, email: m.email, phone: m.phone, score }),
      notifyLeadDiscord({
        firstName: m.firstName, lastName: m.lastName, email: m.email, phone: m.phone,
        score, source: 'meta_instant_form', lead,
      }),
    ])
  } catch (err) {
    console.warn(`[meta-webhook] processing lead ${leadgenId} failed:`, err)
  }
}
