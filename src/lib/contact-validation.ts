// Shared phone + email validators so the New Business POST and PATCH routes
// (agent + vault) all enforce the same contract. Phone is US-style: 10 digits
// after stripping formatting, optional leading 1.
export const PHONE_RE = /^\+?1?[\s().-]*\d{3}[\s().-]*\d{3}[\s().-]*\d{4}\s*$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validatePhone(v: unknown): string | null {
  if (typeof v !== 'string' || !PHONE_RE.test(v.trim())) return 'A valid 10-digit phone number is required'
  return null
}

export function validateEmail(v: unknown): string | null {
  if (typeof v !== 'string' || !EMAIL_RE.test(v.trim())) return 'A valid email is required'
  return null
}

// Reformats a phone string into "(555) 123-4567" as the user types. Strips
// non-digits, drops a leading "1" country code if present, and partial-formats
// while the user is mid-entry so the parens/dashes appear naturally instead of
// the user having to type them.
export function formatPhoneAsTyped(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  // Drop leading 1 (US country code) so "+1 (555)..." pasted phones format too
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  const d = trimmed.slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// Carrier policy numbers normalize to uppercase A-Z / 0-9 only
// (e.g. JT09083285, AB123456). Pasted strings often pick up
// non-breaking spaces, dashes, or surrounding quotes; strip and
// uppercase before validation so dedup matches don't miss because
// one path stored "AB-123 456" and another stored "AB123456".
export function normalizePolicyNumber(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.toString().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Returns an error string for an obviously bad policy number,
// null otherwise. Empty is allowed (the agent may not have the
// number yet at submit time). Anything 3 chars or longer that is
// pure alphanumeric is accepted - we don't know every carrier's
// format and don't want to false-reject.
export function validatePolicyNumber(raw: string | null | undefined): string | null {
  const norm = normalizePolicyNumber(raw)
  if (norm === '') return null
  if (norm.length < 3) return 'Policy number looks too short. Double-check it from the carrier confirmation.'
  if (norm.length > 32) return 'Policy number looks too long. Double-check it from the carrier confirmation.'
  return null
}
