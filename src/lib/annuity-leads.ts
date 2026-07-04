import type { LeadScore } from '@/generated/prisma/client'

// The four qualifier questions on the retirement-income landing page,
// kept in one place so the form, the API validation, and the stored
// consent record all agree on the exact option wording. The labels are
// what the lead sees AND what we persist, so the saved row reads exactly
// as the form did. Ranges use plain hyphens (house rule: no em-dashes in
// user-visible text).

export const AGE_OPTIONS = ['Under 50', '50-59', '60-69', '70+'] as const

export const SAVINGS_OPTIONS = [
  'Under $50k',
  '$50k-$100k',
  '$100k-$250k',
  '$250k-$500k',
  '$500k+',
] as const

export const TIMING_OPTIONS = [
  'Right away',
  '1-3 yrs',
  '4-10 yrs',
  'Just exploring',
] as const

export const PRIORITY_OPTIONS = [
  "Income I can't outlive",
  'Protect from market loss',
  'Growth',
  'Leave to family',
] as const

// Multi-select. Five consolidated buckets covering the common US
// retirement account types: employer plans (401k/403b/TSP) together, the
// two IRAs together, pension, non-qualified savings, and a catch-all.
// Labels are kept short so the chips wrap cleanly in the selector.
export const ACCOUNT_TYPE_OPTIONS = [
  '401(k), 403(b) & TSP',
  'Traditional or Roth IRA',
  'Pension',
  'Savings, CDs, brokerage & cash',
  'Other',
] as const

// Optional "how did you hear about us?" single-select. The AFF-agent
// option reveals a referrer-name field on the form.
export const REFERRAL_SOURCE_OPTIONS = [
  'An All Financial Freedom agent',
  'Friend or family',
  'Facebook or Instagram',
  'Google or web search',
  'Other',
] as const
// The one option that asks for a referrer name.
export const REFERRAL_AGENT_OPTION = 'An All Financial Freedom agent'

export type ReferralSource = (typeof REFERRAL_SOURCE_OPTIONS)[number]

export type AgeBand = (typeof AGE_OPTIONS)[number]
export type SavingsBand = (typeof SAVINGS_OPTIONS)[number]
export type IncomeTiming = (typeof TIMING_OPTIONS)[number]
export type Priority = (typeof PRIORITY_OPTIONS)[number]
export type AccountType = (typeof ACCOUNT_TYPE_OPTIONS)[number]

export const QUALIFIER_QUESTIONS = [
  { key: 'ageBand', label: 'What is your age?', options: AGE_OPTIONS },
  { key: 'savingsBand', label: 'About how much have you saved for retirement?', options: SAVINGS_OPTIONS },
  { key: 'incomeTiming', label: 'When would you want this income to start?', options: TIMING_OPTIONS },
  { key: 'priority', label: 'What matters most to you right now?', options: PRIORITY_OPTIONS },
] as const

// Savings bands that clear the $100k "A-lead" bar.
const HIGH_SAVINGS: readonly string[] = ['$100k-$250k', '$250k-$500k', '$500k+']
// Timing answers that signal near-term intent.
const NEAR_TERM: readonly string[] = ['Right away', '1-3 yrs']

// Lead scoring, per the campaign playbook:
//   A        = $100k+ saved AND income needed now or in 1-3 yrs (call first)
//   NURTURE  = under $50k saved OR "just exploring" (drip, not a same-day call)
//   STANDARD = everyone else
// A is checked before NURTURE so a high-intent lead is never demoted; a
// "$500k+ / just exploring" lead is not near-term, so it falls through to
// NURTURE, which is the intended behavior (no same-day call for browsers).
export function scoreLead(input: { savingsBand: string; incomeTiming: string }): LeadScore {
  if (HIGH_SAVINGS.includes(input.savingsBand) && NEAR_TERM.includes(input.incomeTiming)) {
    return 'A'
  }
  if (input.savingsBand === 'Under $50k' || input.incomeTiming === 'Just exploring') {
    return 'NURTURE'
  }
  return 'STANDARD'
}

// The exact TCPA consent disclosure shown above the submit button and
// stored verbatim with every lead. Counsel approves the final wording;
// this is the working copy from the campaign playbook, rewritten to drop
// em-dashes per the house style rule. Keep this as the single source so
// the rendered text and the stored consentText can never drift.
// Editable speed-to-lead message templates. These are the DEFAULTS; the
// live values are stored in Settings (keys below) and edited from the
// Vault Ad Leads page. `{firstName}` is substituted at send time. The
// email body is plain text: blank lines become paragraphs.
export const LEAD_MESSAGE_SETTING_KEYS = {
  sms: 'LEAD_SMS_MESSAGE',
  emailSubject: 'LEAD_EMAIL_SUBJECT',
  emailBody: 'LEAD_EMAIL_BODY',
} as const

export const LEAD_MESSAGE_DEFAULTS = {
  sms:
    'Hi {firstName}, this is All Financial Freedom. Thanks for requesting your free ' +
    'retirement income estimate. A licensed agent will reach out shortly.',
  emailSubject: 'Your retirement income estimate request',
  emailBody:
    'Hi {firstName},\n\n' +
    'Thanks for requesting a free, no-obligation retirement income estimate from ' +
    'All Financial Freedom. A licensed financial professional will reach out shortly to ' +
    'put your personalized estimate together.\n\n' +
    'While you wait, here is your free guide on how retirees turn savings into income for life:\n' +
    'https://allfinancialfreedom.com/AFF-Retirement-Income-Guide.pdf\n\n' +
    'Prefer to pick a time? Schedule your free assessment here:\n' +
    'https://allfinancialfreedom.com/schedule\n\n' +
    'All Financial Freedom is a licensed insurance agency. A licensed insurance agent ' +
    'will contact you.',
} as const

export const CONSENT_TEXT =
  'By submitting, I confirm my information is accurate and I ask that All Financial Freedom ' +
  'and its licensed insurance agents contact me at the phone number and email I provided, ' +
  'including by autodialed calls, prerecorded messages, and text messages, about annuities ' +
  'and retirement income products. Consent is not a condition of purchase. Message and data ' +
  'rates may apply; reply STOP to opt out. This is a solicitation for insurance; a licensed ' +
  'insurance agent will contact you. All Financial Freedom is a licensed insurance agency. ' +
  'Product guarantees are subject to the claims-paying ability of the issuing insurer.'
