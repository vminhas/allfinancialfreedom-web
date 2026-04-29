// Helpers for the agent contact-import flow.
//
// Goal: never return a row labeled "Unknown". If the CSV has *any*
// recognizable identifier (name, email, phone, organization), produce
// the best name we can from it. Showing 500 contacts as "Unknown" is
// useless and was the production bug after the first import.
//
// Different sources use different header names:
//
//   iOS Contacts.app exported as vCard then converted to CSV: typical
//     headers are "Name", "First Name", "Last Name", "Phone 1 Value",
//     "Email 1 Value", "Organization", "Birthday", "Address 1 Street".
//
//   Google Contacts CSV: "Name", "Given Name", "Family Name",
//     "E-mail 1 - Value", "Phone 1 - Value", "Organization 1 - Title".
//
//   Outlook: "First Name", "Last Name", "E-mail Address", "Mobile Phone".
//
// Header matching is fuzzy (normalized lowercase, dashes/underscores
// removed) and does both exact-match and substring-match fallbacks.

export interface ImportedContact {
  name: string
  email: string | null
  phone: string | null
  occupation: string | null   // job title or organization
  organization: string | null
  birthday: string | null     // raw string (varied formats: "1985-04-23", "April 23")
  city: string | null
  state: string | null
  notes: string | null
  // Best-guess category, agent can override during the preview step.
  suggestedCategory: string | null
}

const NAME_FIELDS  = ['name', 'full name', 'display name', 'formatted name', 'fn']
const FIRST_FIELDS = ['first name', 'first', 'given name', 'firstname']
const LAST_FIELDS  = ['last name', 'last', 'family name', 'surname', 'lastname']
const EMAIL_FIELDS = [
  'email', 'e-mail', 'email address', 'e-mail address',
  'e-mail 1 - value', 'email 1 value', 'email 1', 'email1',
  'work email', 'home email', 'personal email',
]
const PHONE_FIELDS = [
  'phone', 'phone number', 'mobile', 'mobile phone', 'cell', 'cell phone',
  'phone 1 - value', 'phone 1 value', 'phone 1', 'mobile 1',
  'home phone', 'work phone', 'main phone',
]
const OCC_FIELDS   = ['occupation', 'job title', 'title', 'organization 1 - title', 'organization 1 title', 'role']
const ORG_FIELDS   = ['organization', 'organization name', 'organization 1 - name', 'organization 1 name', 'company', 'employer']
const BIRTHDAY_FIELDS = ['birthday', 'date of birth', 'dob', 'bday']
const CITY_FIELDS  = ['city', 'address 1 city', 'address 1 - city', 'home city', 'work city']
const STATE_FIELDS = ['state', 'region', 'address 1 region', 'address 1 - region', 'address 1 state', 'home state']
const NOTE_FIELDS  = ['notes', 'note', 'description']

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
}

function findFirstMatching(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeKey)
  // Exact match first so "name" wins over "first name" when both exist.
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand)
    if (idx >= 0) return idx
  }
  // Substring fallback for variants like "Phone 1 (Mobile)".
  for (let i = 0; i < normalized.length; i++) {
    for (const cand of candidates) {
      if (normalized[i].includes(cand)) return i
    }
  }
  return -1
}

function pick(headers: string[], row: string[], candidates: string[]): string | null {
  const idx = findFirstMatching(headers, candidates)
  if (idx < 0) return null
  const v = (row[idx] ?? '').trim()
  return v.length > 0 ? v : null
}

// Last-ditch effort: if the named columns failed, scan all columns for
// the first non-empty value matching a heuristic. Used for name (avoids
// "Unknown" rows) and email (avoids losing a row when the column is
// labeled something we don't recognize).
function scanForEmailLike(row: string[]): string | null {
  for (const cell of row) {
    const v = cell.trim()
    if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v
  }
  return null
}

function scanForNameLike(row: string[]): string | null {
  // A "name-like" cell: 2+ words, all alphabetic plus apostrophes /
  // hyphens / dots, no @ sign, no digits. Pick the longest match so we
  // prefer "Mary Anne Smith" over "Mary".
  let best: string | null = null
  for (const cell of row) {
    const v = cell.trim()
    if (!v || v.length > 80) continue
    if (/[@\d]/.test(v)) continue
    if (!/^[A-Za-z][A-Za-z .'’-]+\s+[A-Za-z][A-Za-z .'’-]+$/.test(v)) continue
    if (!best || v.length > best.length) best = v
  }
  return best
}

export function extractContactRow(headers: string[], row: string[]): ImportedContact | null {
  // 1. Try labeled columns: full name, then first + last.
  let name = pick(headers, row, NAME_FIELDS)
  if (!name) {
    const first = pick(headers, row, FIRST_FIELDS)
    const last = pick(headers, row, LAST_FIELDS)
    if (first || last) name = [first, last].filter(Boolean).join(' ').trim()
  }
  // 2. Heuristic scan across all cells for a name-shaped string.
  if (!name) name = scanForNameLike(row)

  const email = pick(headers, row, EMAIL_FIELDS) ?? scanForEmailLike(row)
  const phone = pick(headers, row, PHONE_FIELDS)
  const occupation = pick(headers, row, OCC_FIELDS)
  const organization = pick(headers, row, ORG_FIELDS)
  const birthday = pick(headers, row, BIRTHDAY_FIELDS)
  const city = pick(headers, row, CITY_FIELDS)
  const state = pick(headers, row, STATE_FIELDS)
  const notes = pick(headers, row, NOTE_FIELDS)

  // 3. Last-resort name from email local-part or organization. Beats
  //    "Unknown" by a mile and lets the agent fix it inline if needed.
  if (!name) {
    if (email) {
      const local = email.split('@')[0]
      // "vick.minhas" -> "Vick Minhas"; "jdoe87" -> "Jdoe87" (still shows something)
      name = local.replace(/[._-]+/g, ' ').split(' ')
        .filter(Boolean)
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' ')
    } else if (organization) {
      name = organization
    } else if (phone) {
      name = phone
    }
  }
  if (!name) return null

  return {
    name,
    email,
    phone: phone ? phone.replace(/[^\d+()\-\s]/g, '').trim() || null : null,
    occupation: occupation ?? organization,
    organization,
    birthday,
    city,
    state,
    notes,
    suggestedCategory: guessCategory({ name, occupation, organization, notes }),
  }
}

// Naive category suggestion: the agent reviews everything in the
// preview. We only set a hint for occupations that read clearly as
// "business owner" or "professional." Everything else stays
// unclassified so the agent makes a real decision.
const BUSINESS_OCCUPATION_KEYWORDS = [
  'owner', 'founder', 'ceo', 'president', 'director', 'principal',
  'realtor', 'real estate', 'attorney', 'lawyer', 'cpa', 'accountant',
  'doctor', 'physician', 'dentist', 'chiropractor',
  'manager', 'executive', 'consultant', 'advisor',
]

function guessCategory(input: { name: string; occupation: string | null; organization: string | null; notes: string | null }): string | null {
  const haystack = [input.occupation ?? '', input.organization ?? '', input.notes ?? ''].join(' ').toLowerCase()
  if (!haystack.trim()) return null
  for (const kw of BUSINESS_OCCUPATION_KEYWORDS) {
    if (haystack.includes(kw)) return 'business_partner'
  }
  return null
}
