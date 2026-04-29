// Helpers for the agent contact-import flow. Two shapes here:
//
//   1. extractContactRow(headers, row) — turn one row of a parsed CSV into
//      a normalized {name, email, phone, ...} shape, regardless of which
//      app exported it (iOS Contacts, Google Contacts, Outlook, etc.).
//
//   2. guessCategory(row) — naive heuristic for "FTA contact vs business
//      partner prospect" so the import preview is partially pre-filled.
//      The agent always reviews and can override per row.

export interface ImportedContact {
  name: string
  email: string | null
  phone: string | null
  occupation: string | null
  notes: string | null
  // Best-guess category, agent can override during the preview step.
  suggestedCategory: string | null
}

const NAME_FIELDS = ['name', 'full name', 'display name']
const FIRST_FIELDS = ['first name', 'first', 'given name']
const LAST_FIELDS  = ['last name', 'last', 'family name', 'surname']
const EMAIL_FIELDS = ['email', 'e-mail', 'e-mail 1 - value', 'email address', 'work email', 'home email']
const PHONE_FIELDS = ['phone', 'phone 1 - value', 'mobile', 'mobile phone', 'cell', 'cell phone', 'phone number']
const OCC_FIELDS   = ['occupation', 'job title', 'title', 'organization 1 - title', 'organization name']
const NOTE_FIELDS  = ['notes', 'note']

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
}

function findFirstMatching(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map(normalizeKey)
  for (const cand of candidates) {
    const idx = normalizedHeaders.indexOf(cand)
    if (idx >= 0) return idx
  }
  // Loose match — header *contains* the candidate token.
  for (let i = 0; i < normalizedHeaders.length; i++) {
    for (const cand of candidates) {
      if (normalizedHeaders[i].includes(cand)) return i
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

export function extractContactRow(headers: string[], row: string[]): ImportedContact | null {
  // Compose name from full-name field, falling back to first + last.
  let name = pick(headers, row, NAME_FIELDS)
  if (!name) {
    const first = pick(headers, row, FIRST_FIELDS)
    const last = pick(headers, row, LAST_FIELDS)
    name = [first, last].filter(Boolean).join(' ').trim()
  }
  if (!name || name.length === 0) return null

  // Google Contacts puts multiple emails/phones in separate "X 1 - Value",
  // "X 2 - Value" columns and the picker just takes the first hit. Good
  // enough for an import preview — the agent can clean up afterwards.
  const email = pick(headers, row, EMAIL_FIELDS)
  const phone = pick(headers, row, PHONE_FIELDS)
  const occupation = pick(headers, row, OCC_FIELDS)
  const notes = pick(headers, row, NOTE_FIELDS)

  return {
    name,
    email,
    phone: phone ? phone.replace(/[^\d+()\-\s]/g, '').trim() || null : null,
    occupation,
    notes,
    suggestedCategory: guessCategory({ name, occupation, notes }),
  }
}

// Naive category suggestion — the agent reviews everything in the preview.
// We only set a hint for occupations that read clearly as "business owner"
// or "professional," which the agent's training points to as good business-
// partner candidates. Everything else stays unclassified.
const BUSINESS_OCCUPATION_KEYWORDS = [
  'owner', 'founder', 'ceo', 'president', 'director', 'principal',
  'realtor', 'real estate', 'attorney', 'lawyer', 'cpa', 'accountant',
  'doctor', 'physician', 'dentist', 'chiropractor',
  'manager', 'executive', 'consultant', 'advisor',
]

function guessCategory(input: { name: string; occupation: string | null; notes: string | null }): string | null {
  const haystack = [input.occupation ?? '', input.notes ?? ''].join(' ').toLowerCase()
  if (!haystack.trim()) return null
  for (const kw of BUSINESS_OCCUPATION_KEYWORDS) {
    if (haystack.includes(kw)) return 'business_partner'
  }
  return null
}
