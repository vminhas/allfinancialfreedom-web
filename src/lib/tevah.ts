// Tevah API client — authentication + supervision data fetch.
// Auth flow: sendOtpToAgentv1 (lookup step) → signInAsAgentv1 (password) → JWT
// JWT lasts 24 hours; the cron endpoint re-authenticates on every run.

const TEVAH_API = 'https://api.tevahtech.com'
const TEVAH_APP_ID = '9f1c0d84-f0a6-4a3e-9c5d-0eae3e0d87fa'
const TEVAH_AGENT_ID = 14128
const TEVAH_USER_ID = 103649

function buildAppToken(): string {
  return Buffer.from(
    JSON.stringify({ appId: TEVAH_APP_ID, type: 'frontend', version: '1.0.0', platform: 'web', ts: Date.now() }),
  ).toString('base64')
}

function headers(jwt: string, userId: number, agentId: number): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'X-App-Token': buildAppToken(),
    'X-Token-1': Buffer.from(String(userId)).toString('base64'),
    'X-Token-2': Buffer.from(String(agentId)).toString('base64'),
    authorization: `Bearer ${jwt}`,
  }
}

const PRE_AUTH_HEADERS = {
  'Content-Type': 'application/json',
  Accept: '*/*',
  'X-App-Token': '', // set per-call
  'X-Token-1': Buffer.from('undefined').toString('base64'),
  'X-Token-2': Buffer.from('undefined').toString('base64'),
  authorization: 'Bearer undefined',
}

export async function getTevahToken(): Promise<{ jwt: string; userId: number; agentId: number }> {
  const mobile = process.env.TEVAH_USERNAME
  const password = process.env.TEVAH_PASSWORD
  if (!mobile || !password) throw new Error('TEVAH_USERNAME / TEVAH_PASSWORD not configured')

  const appToken = buildAppToken()

  await fetch(`${TEVAH_API}/api/auth/sendOtpToAgentv1`, {
    method: 'POST',
    headers: { ...PRE_AUTH_HEADERS, 'X-App-Token': appToken },
    body: JSON.stringify({ mobile, email: '', countryPhoneCode: '+1', countryId: 2, type: 'mobile', countryCode: 'US' }),
  })

  const res = await fetch(`${TEVAH_API}/api/auth/signInAsAgentv1`, {
    method: 'POST',
    headers: { ...PRE_AUTH_HEADERS, 'X-App-Token': buildAppToken() },
    body: JSON.stringify({ mobile, countryPhoneCode: '+1', countryId: 2, email: '', type: 'mobile', password }),
  })

  if (!res.ok) throw new Error(`Tevah login HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(`Tevah login failed: ${json.message}`)

  return {
    jwt: json.data.token,
    userId: json.data.user.id as number,
    agentId: json.data.agentData.id as number,
  }
}

export interface TevahAgent {
  id: number
  firstName: string
  middleName: string | null
  lastName: string
  email: string | null
  code: string | null       // AFF agentCode (null for brand-new recruits)
  reference: string | null  // recruiter's agentCode → AFF recruiterId
  npn: string | null
  phone: string | null
  dob: string | null
  address: string | null
  zipCode: string | null
  stateId: number | null
  status: string            // AGT_STG1..AGT_STG12
  level: string | null      // A | SA | MD | EMD | null
  createdDate: string
  onboardApprovedDate: string | null
  supervisorAgentCode: string | null
}

export async function getAllTevahAgents(): Promise<TevahAgent[]> {
  const { jwt, userId, agentId } = await getTevahToken()
  const pageSize = 200
  let page = 1
  const all: TevahAgent[] = []

  while (true) {
    const url =
      `${TEVAH_API}/api/admin/getAllSupervisionData` +
      `?id=${agentId}&page=${page}&pageSize=${pageSize}&sortDirection=desc`

    const res = await fetch(url, { headers: headers(jwt, userId, agentId) })
    if (!res.ok) throw new Error(`Tevah data fetch HTTP ${res.status}`)

    const json = await res.json()
    const rows: TevahAgent[] = Array.isArray(json.data)
      ? json.data
      : Object.values(json.data as Record<string, TevahAgent>)

    all.push(...rows)

    const total: number = json.count ?? 0
    if (all.length >= total || rows.length === 0) break
    page++
  }

  return all
}

// Tevah level code → AFF phase number
export function tevahLevelToPhase(level: string | null): number {
  switch (level) {
    case 'EMD': return 5
    case 'MD':  return 4
    case 'SA':  return 3
    case 'A':   return 1
    default:    return 1
  }
}

export interface TevahClient {
  id: number
  agentId: number            // Tevah agentId of writing agent
  writingAgentCode: string   // AFF agentCode of writing agent
  clientName: string         // "Last First" format
  carrierName: string
  carrierDisplayName: string
  productType: string
  insuranceType: string
  premiumAmount: string | null
  annualPremiumAmount: string | null
  faceAmount: string | null
  policyNumber: string | null
  policyStatus: string | null  // PENDING | ISSUED | etc.
  status: string               // PENDING | Inforce | Other
  split: string                // "100" = no split, "50" = 50/50 split
  submitDate: string | null
  policyIssueDate: string | null
  clientPhone: string | null
  clientEmail: string | null
  createdDate: string
  updatedDate: string
}

export async function getAllTevahClients(): Promise<TevahClient[]> {
  const { jwt, userId, agentId } = await getTevahToken()
  const pageSize = 200
  let page = 1
  const all: TevahClient[] = []

  while (true) {
    const url =
      `${TEVAH_API}/api/client/getAllClients` +
      `?page=${page}&pageSize=${pageSize}&search=&id=${agentId}&sortDirection=asc&selectedRole=base`

    const res = await fetch(url, { headers: headers(jwt, userId, agentId) })
    if (!res.ok) throw new Error(`Tevah clients fetch HTTP ${res.status}`)

    const json = await res.json()
    const data = json.data as { rows?: TevahClient[]; count?: number } | TevahClient[]
    const rows: TevahClient[] = Array.isArray(data) ? data : (data.rows ?? [])
    all.push(...rows)

    const total: number = json.totalCount ?? (Array.isArray(data) ? data.length : (data.count ?? 0))
    if (all.length >= total || rows.length === 0) break
    page++
  }

  return all
}

export function tevahProductToAffPolicyType(productType: string, insuranceType: string): string {
  const pt = (productType || '').toUpperCase()
  const it = (insuranceType || '').toUpperCase()
  if (pt.includes('IUL') || pt.includes('INDEX')) return 'IUL'
  if (pt.includes('WHOLE') || pt.includes('PAID UP') || it.includes('WHOLE')) return 'WHOLE_LIFE'
  if (pt.includes('TERM') || it.includes('TERM')) return 'TERM'
  if (pt.includes('ANNUITY')) return 'ANNUITY'
  if (pt.includes('DISABILITY') || pt.includes('DI')) return 'DISABILITY'
  if (pt.includes('LTC') || pt.includes('LONG TERM CARE')) return 'LTC'
  return 'OTHER'
}

// Accepts either the Tevah `status` or `policyStatus` field; call with
// whichever is more specific (policyStatus preferred when set).
export function tevahStatusToAff(status: string): string {
  const s = (status || '').toLowerCase().replace(/[\s_-]+/g, '')
  // Active / issued / paid / inforce / approved all mean the policy is live.
  if (
    s === 'inforce' || s === 'issued' || s === 'active' || s === 'paid' ||
    s === 'approved' || s === 'placed' || s === 'activepolicyholder'
  ) return 'ISSUED'
  if (s.includes('decline') || s.includes('nottaken') || s.includes('cancelled') || s.includes('canceled')) return 'DECLINED'
  if (s.includes('lapse')) return 'LAPSED'
  return 'PENDING'
}

// Parse Tevah client name. Tevah usually sends "Last First" or "Last, First".
export function parseTevahClientName(clientName: string): { firstName: string; lastName: string } {
  const name = clientName.trim()
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim())
    return { firstName: first ?? '', lastName: last ?? name }
  }
  const parts = name.split(' ')
  if (parts.length === 1) return { firstName: '', lastName: name }
  const lastName = parts[0]
  const firstName = parts.slice(1).join(' ')
  return { firstName, lastName }
}

// Tevah stateId → US state abbreviation.
// Only stateId 35 = MD is confirmed from the Tevah API (login response includes the full state object).
// Full mapping requires fetching Tevah's state list — add entries here as they are confirmed.
export const TEVAH_STATE_MAP: Record<number, string> = {
  35: 'MD',
}
