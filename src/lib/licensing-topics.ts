// Shared licensing-topic vocabulary. Lifted out of LicensingRequestModal
// (a client component) so server code (API routes, the daily digest cron)
// can import the type + labels without pulling a React module into the
// server bundle.

export type LicensingRequestTopic =
  | 'PRE_LICENSING_COURSE'
  | 'SCHEDULE_EXAM'
  | 'PASS_POST_LICENSING'
  | 'FINGERPRINTS_APPLY'
  | 'GFI_APPOINTMENTS'
  | 'CE_COURSES'
  | 'EO_INSURANCE'
  | 'DIRECT_DEPOSIT'
  | 'UNDERWRITING'
  | 'GENERAL'

export const LICENSING_TOPICS: LicensingRequestTopic[] = [
  'PRE_LICENSING_COURSE',
  'SCHEDULE_EXAM',
  'PASS_POST_LICENSING',
  'FINGERPRINTS_APPLY',
  'GFI_APPOINTMENTS',
  'CE_COURSES',
  'EO_INSURANCE',
  'DIRECT_DEPOSIT',
  'UNDERWRITING',
  'GENERAL',
]

// Agent-facing phrasing (used in the request modal the agent submits).
export const TOPIC_LABELS: Record<LicensingRequestTopic, string> = {
  PRE_LICENSING_COURSE: 'Pre-licensing course',
  SCHEDULE_EXAM: 'Schedule my licensing exam',
  PASS_POST_LICENSING: 'Post-licensing call (I just passed)',
  FINGERPRINTS_APPLY: 'Fingerprints & state application',
  GFI_APPOINTMENTS: 'Submit to GFI / carrier appointments',
  CE_COURSES: 'CE courses (AML, Annuity, Ethics)',
  EO_INSURANCE: 'E&O insurance',
  DIRECT_DEPOSIT: 'Direct deposit setup',
  UNDERWRITING: 'Underwriting question',
  GENERAL: 'Something else',
}

// LC-facing "Purpose" phrasing, matching the LC Notes Guide SOP wording.
// Used in the structured Licensing note composer and the daily digest.
export const LC_PURPOSE_LABELS: Record<LicensingRequestTopic, string> = {
  PRE_LICENSING_COURSE: 'Pre-Licensing Course',
  SCHEDULE_EXAM: 'Schedule Exam',
  PASS_POST_LICENSING: 'Post-Licensing',
  FINGERPRINTS_APPLY: 'Finger-Prints + Apply for License',
  GFI_APPOINTMENTS: 'Submit to GFI',
  CE_COURSES: 'CE Courses',
  EO_INSURANCE: 'E&O Insurance',
  DIRECT_DEPOSIT: 'Direct Deposit',
  UNDERWRITING: 'Underwriting',
  GENERAL: 'Other',
}

export function isLicensingTopic(v: unknown): v is LicensingRequestTopic {
  return typeof v === 'string' && (LICENSING_TOPICS as string[]).includes(v)
}

// LC-facing label for a stored purpose value. Falls back to the raw
// string so an unknown/legacy value still renders something readable.
export function lcPurposeLabel(purpose: string | null | undefined): string {
  if (!purpose) return ''
  return LC_PURPOSE_LABELS[purpose as LicensingRequestTopic] ?? purpose
}
