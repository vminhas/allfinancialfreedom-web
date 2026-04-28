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
