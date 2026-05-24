// Breezy HR integration. Uses the web-app session endpoint because the
// Developer API is restricted to higher-tier plans. Sign in with
// email/password, get a session cookie, then pull positions + candidates.
//
// Env vars:
//   BREEZY_EMAIL       — Breezy login email
//   BREEZY_PASSWORD    — Breezy login password
//   BREEZY_COMPANY_ID  — Company ID (f21bb0a3b41f for AFF)

const BREEZY_APP = 'https://app.breezy.hr'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export interface BreezyCandidate {
  _id: string
  name: string
  email_address?: string
  phone_number?: string
  address?: string
  origin?: string
  source?: { _id: string; name: string }
  stage?: { _id: string; name: string }
  creation_date?: string
  updated_date?: string
  position?: { _id: string; name: string }
  resume?: { url?: string }
  tags?: string[]
}

export interface BreezyPosition {
  _id: string
  name: string
  state: string
  candidate_count: number
  location?: { city?: string; state?: string; country?: string }
  creation_date?: string
}

interface BreezySession {
  cookie: string
  companyId: string
}

/**
 * Sign in to Breezy and return a session cookie for subsequent requests.
 */
export async function getBreezySession(): Promise<BreezySession> {
  const email = process.env.BREEZY_EMAIL
  const password = process.env.BREEZY_PASSWORD
  const companyId = process.env.BREEZY_COMPANY_ID ?? 'f21bb0a3b41f'

  if (!email || !password) {
    throw new Error('BREEZY_EMAIL and BREEZY_PASSWORD env vars required')
  }

  const res = await fetch(`${BREEZY_APP}/api/signin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'Origin': BREEZY_APP,
      'Referer': `${BREEZY_APP}/`,
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Breezy sign-in failed (${res.status}): ${body}`)
  }

  const setCookies = [...res.headers.entries()]
    .filter(([k]) => k === 'set-cookie')
    .map(([, v]) => v.split(';')[0])
  const cookie = setCookies.join('; ')

  if (!cookie) throw new Error('Breezy sign-in returned no session cookie')

  return { cookie, companyId }
}

function headers(session: BreezySession): Record<string, string> {
  return {
    'Cookie': session.cookie,
    'User-Agent': UA,
    'Accept': 'application/json',
    'Referer': `${BREEZY_APP}/`,
  }
}

/**
 * Fetch all published positions for the company.
 */
export async function getBreezyPositions(session: BreezySession): Promise<BreezyPosition[]> {
  const res = await fetch(
    `${BREEZY_APP}/api/company/${session.companyId}/positions?state=published,closed,archived`,
    { headers: headers(session) },
  )
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/**
 * Fetch candidates for a specific position.
 */
export async function getBreezyCandidates(
  session: BreezySession,
  positionId: string,
): Promise<BreezyCandidate[]> {
  const res = await fetch(
    `${BREEZY_APP}/api/company/${session.companyId}/position/${positionId}/candidates`,
    { headers: headers(session) },
  )
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/**
 * Pull all candidates across ALL positions using the global candidates
 * endpoint (POST with filter body). This is how the Breezy web app
 * loads its candidate list. Returns all candidates regardless of which
 * position they applied to.
 */
export async function getAllBreezyCandidates(session: BreezySession): Promise<BreezyCandidate[]> {
  // The web app uses POST /api/company/{id}/candidates with a filter body.
  // No date range = all candidates. get_totals gives us pipeline counts.
  // Only pull candidates in the "Applied" pipeline stage.
  // Other stages (feedback, interviewing, etc.) are noise for the
  // recruiting funnel. Applied = they took action and are ready for
  // a 15-min discovery call.
  const res = await fetch(
    `${BREEZY_APP}/api/company/${session.companyId}/candidates`,
    {
      method: 'POST',
      headers: { ...headers(session), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pipeline: { is: ['applied'] },
        stage_pipelines: ['default'],
        get_totals: true,
        sort: { column: 'updated_date', sort: 'DESC' },
      }),
    },
  )
  if (!res.ok) {
    console.error('[breezy] candidates POST failed:', res.status)
    return []
  }
  const data = await res.json()
  // Response is { total: number, data: BreezyCandidate[] } when get_totals is set,
  // or a plain array without it.
  if (data && Array.isArray(data.data)) return data.data
  if (Array.isArray(data)) return data
  return []
}
