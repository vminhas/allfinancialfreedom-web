'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUALIFIER_QUESTIONS, ACCOUNT_TYPE_OPTIONS, CONSENT_TEXT,
  REFERRAL_SOURCE_OPTIONS, REFERRAL_AGENT_OPTION,
} from '@/lib/annuity-leads'
import { LEADS_PIPELINE_ENABLED } from '@/lib/leads-flags'
import { readStoredAttribution } from '@/lib/attribution'

const chipStyle = (selected: boolean): React.CSSProperties => ({
  cursor: 'pointer',
  padding: '9px 14px',
  fontSize: 14,
  borderRadius: 6,
  border: `1.5px solid ${selected ? '#C9A96E' : '#D8DEE6'}`,
  background: selected ? 'rgba(201,169,110,0.12)' : '#fff',
  color: selected ? '#1B3A5C' : '#41566B',
  fontWeight: selected ? 600 : 400,
  transition: 'all 0.12s',
})

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    gtag?: (...args: unknown[]) => void
    uetq?: unknown[]
  }
}

// SHA-256 hex digest, used for Bing UET enhanced conversions (hash PII in the
// browser so raw email/phone never hit the network).
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const buf = await window.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Normalize an email per Bing's enhanced-conversions rules before hashing:
// trim/lowercase, strip whitespace + accents, drop a "+tag", remove dots in the
// local part, and no trailing period.
function normalizeEmailForHash(email: string): string {
  let e = email.trim().toLowerCase().replace(/\s+/g, '')
  e = e.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
  e = e.replace(/\+[^@]*@/, '@')                          // remove +tag
  const at = e.indexOf('@')
  if (at > -1) e = e.slice(0, at).replace(/\./g, '') + e.slice(at)
  return e.replace(/\.$/, '')
}

// Format a phone number to E.164 (assume US when no country code is present).
function normalizePhoneE164(phone: string): string {
  const trimmed = phone.trim()
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '')
  const digits = trimmed.replace(/\D/g, '')
  return '+' + (digits.length === 10 ? '1' + digits : digits)
}

type QualifierKey = 'ageBand' | 'savingsBand' | 'incomeTiming' | 'priority'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 15,
  border: '1px solid #D8DEE6',
  borderRadius: 6,
  background: '#fff',
  color: '#1B3A5C',
}
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#1B3A5C',
  marginBottom: 8,
}

// The GA4 client_id, read from the browser _ga cookie
// ("GA1.1.<cid1>.<cid2>" -> "<cid1>.<cid2>"). Captured with the lead so a
// down-funnel conversion (qualify/close) can be sent server-side later via the
// GA4 Measurement Protocol and attributed to the same user. Best-effort: if the
// cookie is not set yet (gtag loads lazily) this is just omitted.
function readGaClientId(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const m = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/)
  if (!m) return undefined
  const cid = m[1]!.match(/^GA\d+\.\d+\.(\d+\.\d+)$/)
  return cid ? cid[1] : undefined
}

// Pull ad attribution off the landing URL + referrer so the lead record
// can tie back to the campaign/ad set. Cheap and best-effort.
function readAttribution() {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.search)
  // Current URL wins; fall back to the first-touch values captured on landing
  // (AttributionCapture) so a lead that arrived via the homepage and navigated
  // to this form still carries its utm_* / gclid / fbclid.
  const stored = readStoredAttribution()
  const pick = (key: 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term' | 'gclid' | 'fbclid') =>
    p.get(key) || stored[key] || undefined
  return {
    pageUrl: window.location.href,
    referrer: document.referrer || undefined,
    utmSource: pick('utm_source'),
    utmMedium: pick('utm_medium'),
    utmCampaign: pick('utm_campaign'),
    utmContent: pick('utm_content'),
    utmTerm: pick('utm_term'),
    fbclid: pick('fbclid'),
    // Google Ads click id + GA4 client id, for offline conversion import.
    gclid: pick('gclid'),
    gaClientId: readGaClientId(),
  }
}

export default function AnnuityLeadForm() {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<QualifierKey, string>>({
    ageBand: '', savingsBand: '', incomeTiming: '', priority: '',
  })
  const [accountTypes, setAccountTypes] = useState<string[]>([])
  const toggleAccount = (opt: string) =>
    setAccountTypes(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [referralSource, setReferralSource] = useState('')
  const [referrerName, setReferrerName] = useState('')
  const [consent, setConsent] = useState(false)
  const [company, setCompany] = useState('') // honeypot; real users never see it
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ?test=1 -> fire the GA4/Pixel conversion events without creating a real
  // lead or hitting the pipeline. For verifying conversion tracking.
  const [testMode, setTestMode] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTestMode(new URLSearchParams(window.location.search).get('test') === '1')
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!answers.ageBand || !answers.savingsBand || !answers.incomeTiming || !answers.priority) {
      setError('Please answer all the questions.')
      return
    }
    if (accountTypes.length === 0) {
      setError('Please select at least one retirement account type.')
      return
    }
    if (!consent) {
      setError('Please agree to be contacted to continue.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/leads/annuity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, email, phone,
          ...answers,
          accountTypes,
          referralSource,
          referrerName: referralSource === REFERRAL_AGENT_OPTION ? referrerName : '',
          consent,
          company, // honeypot
          test: testMode,
          ...readAttribution(),
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; eventId?: string; value?: number }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      // Dual-post to mycadre's CRM during cutover (best-effort; never blocks
      // the user). Skipped in test mode so verifying conversion tracking never
      // creates a real lead. keepalive lets it finish despite the redirect
      // below. mycadre records its own consent text + IP + timestamp
      // server-side, so we send consent:true (only when the box was checked,
      // enforced above), never the consent language, and never the honeypot.
      if (typeof window !== 'undefined' && !testMode) {
        const attr = readAttribution()
        void fetch('https://aff.mycadre.ai/api/leads/annuity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            key: 'lk_Tb2aeEz46avApgTCFfM1h1rd6tJPyOKT',
            firstName, lastName, email, phone,
            ...answers, // ageBand, savingsBand, incomeTiming, priority
            accountTypes,
            referralSource,
            referrerName: referralSource === REFERRAL_AGENT_OPTION ? referrerName : undefined,
            consent: true,
            source: 'landing_page',
            pageUrl: attr.pageUrl,
            gclid: attr.gclid, fbclid: attr.fbclid,
            utmSource: attr.utmSource, utmMedium: attr.utmMedium,
            utmCampaign: attr.utmCampaign, utmContent: attr.utmContent,
            utmTerm: attr.utmTerm, gaClientId: attr.gaClientId,
          }),
        }).catch(() => {})
      }
      // Fire the Pixel Lead event with the same eventID the server used
      // for the Conversions API event, so Meta counts it once. Gated by
      // LEADS_PIPELINE_ENABLED: mycadre now fires the Meta Lead on the shared
      // pixel, so firing it here too would double-count. GA4 generate_lead
      // below stays on (that top-of-funnel Google Ads event is still ours).
      if (LEADS_PIPELINE_ENABLED && typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'Lead',
          { content_name: 'Retirement Income Estimate', ...(data.value != null ? { value: data.value, currency: 'USD' } : {}) },
          data.eventId ? { eventID: data.eventId } : undefined)
      }
      // GA4 event for the Google Ads campaign. generate_lead is GA4's
      // standard lead-form-submit event; import it as the primary Google
      // conversion. Same score-based value for value-based bidding.
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'generate_lead', {
          ...(data.value != null ? { value: data.value, currency: 'USD' } : {}),
        })
      }
      // Microsoft Advertising (Bing) UET conversion, fired on the SAME success
      // trigger as generate_lead above so Bing and Google count identical
      // leads. Configure the Bing goal as an Event goal: category 'lead',
      // action 'submit'. No-op until the UET base tag (NEXT_PUBLIC_UET_TAG_ID)
      // is set; the push just queues on the uetq array.
      if (typeof window !== 'undefined') {
        window.uetq = window.uetq || []
        // Enhanced conversions: attach the lead's SHA-256-hashed email/phone
        // before the conversion event so Bing can match more conversions.
        // Hashing client-side (per Bing's normalization rules) means raw PII
        // never leaves the browser. Best-effort: skipped if crypto.subtle is
        // unavailable, and never blocks the conversion event.
        try {
          if (window.crypto?.subtle && (email || phone)) {
            const pid: Record<string, string> = {}
            if (email) pid.em = await sha256Hex(normalizeEmailForHash(email))
            if (phone) pid.ph = await sha256Hex(normalizePhoneE164(phone))
            if (Object.keys(pid).length) window.uetq.push('set', { pid })
          }
        } catch {
          // ignore; fall through to the conversion event regardless
        }
        window.uetq.push('event', 'submit', {
          event_category: 'lead',
          event_label: 'retirement_income',
          ...(data.value != null ? { event_value: data.value } : {}),
        })
      }
      router.push('/retirement-income/thank-you')
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {testMode && (
        <div style={{ background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#C9A96E', fontWeight: 600 }}>
          Test mode: this fires conversion tracking (GA4 + Pixel) but does NOT create a lead or contact anyone.
        </div>
      )}
      {/* Honeypot: hidden from real users + assistive tech; bots that fill
          every field trip it and the server silently drops the lead. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={e => setCompany(e.target.value)}
        />
      </div>
      {/* Questions render in order with the multi-select account-types
          question inserted at #3 (right after savings): age, savings,
          accounts, timing, priority. */}
      {[0, 1, 'accounts', 2, 3].map((slot, idx) => {
        const number = idx + 1
        if (slot === 'accounts') {
          return (
            <fieldset key="accounts" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={labelStyle}>
                {number}. What types of retirement savings do you have?{' '}
                <span style={{ fontWeight: 400, color: '#6B8299' }}>(select all that apply)</span>
              </legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ACCOUNT_TYPE_OPTIONS.map(opt => {
                  const selected = accountTypes.includes(opt)
                  return (
                    <label key={opt} style={chipStyle(selected)}>
                      <input
                        type="checkbox"
                        name="accountTypes"
                        value={opt}
                        checked={selected}
                        onChange={() => toggleAccount(opt)}
                        style={{ display: 'none' }}
                      />
                      {opt}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )
        }
        const q = QUALIFIER_QUESTIONS[slot as number]
        return (
          <fieldset key={q.key} style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={labelStyle}>{number}. {q.label}</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {q.options.map(opt => {
                const selected = answers[q.key as QualifierKey] === opt
                return (
                  <label key={opt} style={chipStyle(selected)}>
                    <input
                      type="radio"
                      name={q.key}
                      value={opt}
                      checked={selected}
                      onChange={() => setAnswers(a => ({ ...a, [q.key]: opt }))}
                      style={{ display: 'none' }}
                    />
                    {opt}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      })}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="fn">First name</label>
          <input id="fn" style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} required autoComplete="given-name" />
        </div>
        <div>
          <label style={labelStyle} htmlFor="ln">Last name</label>
          <input id="ln" style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} required autoComplete="family-name" />
        </div>
      </div>
      <div>
        <label style={labelStyle} htmlFor="em">Email</label>
        <input id="em" type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <div>
        <label style={labelStyle} htmlFor="ph">Phone</label>
        <input id="ph" type="tel" style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} required autoComplete="tel" placeholder="(555) 555-5555" />
      </div>

      {/* Optional referral / attribution. No validation; can be left blank. */}
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={labelStyle}>
          How did you hear about us? <span style={{ fontWeight: 400, color: '#6B8299' }}>(optional)</span>
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {REFERRAL_SOURCE_OPTIONS.map(opt => {
            const selected = referralSource === opt
            return (
              <label key={opt} style={chipStyle(selected)}>
                <input
                  type="radio"
                  name="referralSource"
                  value={opt}
                  checked={selected}
                  onChange={() => setReferralSource(selected ? '' : opt)}
                  onClick={() => { if (selected) setReferralSource('') }}
                  style={{ display: 'none' }}
                />
                {opt}
              </label>
            )
          })}
        </div>
        {referralSource === REFERRAL_AGENT_OPTION && (
          <div style={{ marginTop: 10 }}>
            <label style={labelStyle} htmlFor="ref">Who referred you? (agent name)</label>
            <input id="ref" style={inputStyle} value={referrerName} onChange={e => setReferrerName(e.target.value)} placeholder="First and last name" autoComplete="off" />
          </div>
        )}
      </fieldset>

      {/* TCPA consent. Required, unchecked by default, full disclosure
          rendered verbatim above the submit button. */}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={e => setConsent(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0, width: 18, height: 18, accentColor: '#C9A96E' }}
        />
        <span style={{ fontSize: 11.5, lineHeight: 1.55, color: '#6B8299' }}>{CONSENT_TEXT}</span>
      </label>

      {error && (
        <p style={{ color: '#B4451F', fontSize: 13, margin: 0 }}>{error}</p>
      )}

      <button
        type="submit"
        className="btn-gold"
        disabled={submitting}
        style={{ width: '100%', opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
      >
        {submitting ? 'Submitting…' : 'Get My Free Estimate'}
      </button>
      <p style={{ fontSize: 11, color: '#94A6B8', textAlign: 'center', margin: 0 }}>
        No cost. No obligation. A licensed insurance agent will contact you.
      </p>
    </form>
  )
}
