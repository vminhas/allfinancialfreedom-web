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

export async function sendGhlEmail(params: {
  contactId: string
  emailTo: string
  subject: string
  html: string
  config?: GhlConfig
}) {
  const config = params.config ?? await getGhlConfig()
  return ghlPost('/conversations/messages', {
    type: 'Email',
    contactId: params.contactId,
    emailFrom: 'contact@allfinancialfreedom.com',
    emailFromName: 'All Financial Freedom',
    emailTo: params.emailTo,
    subject: params.subject,
    emailSubject: params.subject,
    html: params.html,
  }, config)
}
