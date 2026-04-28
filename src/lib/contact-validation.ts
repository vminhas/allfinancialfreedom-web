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
