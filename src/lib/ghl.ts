import { getSettings } from './settings'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

export interface GhlConfig {
  apiKey: string
  locationId: string
}

export async function getGhlConfig(): Promise<GhlConfig> {
  const settings = await getSettings(['GHL_API_KEY', 'GHL_LOCATION_ID'])
  return {
    apiKey: settings['GHL_API_KEY'] || (process.env.GHL_PRIVATE_KEY ?? ''),
    locationId: settings['GHL_LOCATION_ID'] || (process.env.GHL_LOCATION_ID ?? ''),
  }
}

export function ghlHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': GHL_VERSION,
    'Content-Type': 'application/json',
  }
}

export async function ghlGet(path: string, config?: GhlConfig) {
  const { apiKey } = config ?? await getGhlConfig()
  const res = await fetch(`${GHL_BASE}${path}`, { headers: ghlHeaders(apiKey) })
  return res
}

export async function ghlPost(path: string, body: unknown, config?: GhlConfig) {
  const { apiKey } = config ?? await getGhlConfig()
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify(body),
  })
  return res
}

export async function ghlPut(path: string, body: unknown, config?: GhlConfig) {
  const { apiKey } = config ?? await getGhlConfig()
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'PUT',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify(body),
  })
  return res
}

export async function ghlDelete(path: string, config?: GhlConfig) {
  const { apiKey } = config ?? await getGhlConfig()
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'DELETE',
    headers: ghlHeaders(apiKey),
  })
  return res
}

// Default sender mailboxes. Different flows use different ones:
//   CEO_MAILBOX (Vick) — cold outreach, CEO recruiting intros
//   OPS_MAILBOX (Operations / Natalia) — welcome emails, onboarding
// Caller can override via emailFrom/emailFromName.
export const CEO_MAILBOX = { email: 'vick@allfinancialfreedom.com', name: 'Vick Minhas' }
export const OPS_MAILBOX = { email: 'operations@allfinancialfreedom.com', name: 'All Financial Freedom' }

// Find a GHL contact by email, creating one if it doesn't exist, and
// return its id. GHL email sends require a contactId, so any flow that
// emails an address we don't already manage (staff digests, reminders,
// invites) goes through here first.
//
// `tags` defaults to none. Agent-facing flows pass ['agent-portal'];
// internal/staff sends (e.g. the LC daily digest to leadership) should
// pass a neutral tag like ['staff'] or nothing, so the recipient is not
// dropped into the agent recruiting funnel.
export async function getOrCreateGhlContactId(opts: {
  email: string
  firstName?: string
  lastName?: string
  tags?: string[]
  config?: GhlConfig
}): Promise<string | null> {
  const config = opts.config ?? await getGhlConfig()
  try {
    const searchRes = await ghlGet(
      `/contacts/?locationId=${config.locationId}&query=${encodeURIComponent(opts.email)}`,
      config,
    )
    const data = await searchRes.json() as { contacts?: { id: string }[] }
    if (data.contacts?.[0]?.id) return data.contacts[0].id

    const created = await ghlPost('/contacts/', {
      locationId: config.locationId,
      email: opts.email,
      firstName: opts.firstName ?? '',
      lastName: opts.lastName ?? '',
      tags: opts.tags ?? [],
    }, config)
    const createdData = await created.json() as { contact?: { id: string } }
    return createdData.contact?.id ?? null
  } catch {
    return null
  }
}

export async function sendGhlEmail(params: {
  contactId: string
  emailTo: string
  subject: string
  html: string
  config?: GhlConfig
  // Override the sender. Default is the CEO mailbox so cold outreach
  // keeps coming from Vick. Welcome / onboarding emails should pass
  // OPS_MAILBOX so the new agent's reply lands with operations, not
  // the CEO.
  emailFrom?: string
  emailFromName?: string
  emailReplyTo?: string
}) {
  const config = params.config ?? await getGhlConfig()
  const from = params.emailFrom ?? CEO_MAILBOX.email
  const fromName = params.emailFromName ?? CEO_MAILBOX.name
  const replyTo = params.emailReplyTo ?? from
  return ghlPost('/conversations/messages', {
    type: 'Email',
    contactId: params.contactId,
    emailFrom: from,
    emailFromName: fromName,
    emailReplyTo: replyTo,
    emailTo: params.emailTo,
    subject: params.subject,
    emailSubject: params.subject,
    html: params.html,
    text: params.html,
  }, config)
}

// Send an SMS to a GHL contact. GHL sends from the location's
// configured phone number to the contact's primary phone, so the
// contact must have a phone on file. Same conversations endpoint as
// email, just type: 'SMS'.
export async function sendGhlSms(params: {
  contactId: string
  message: string
  config?: GhlConfig
}) {
  const config = params.config ?? await getGhlConfig()
  return ghlPost('/conversations/messages', {
    type: 'SMS',
    contactId: params.contactId,
    message: params.message,
  }, config)
}
