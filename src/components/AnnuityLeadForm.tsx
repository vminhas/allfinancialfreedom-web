'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUALIFIER_QUESTIONS, ACCOUNT_TYPE_OPTIONS, CONSENT_TEXT,
  REFERRAL_SOURCE_OPTIONS, REFERRAL_AGENT_OPTION,
} from '@/lib/annuity-leads'

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
  }
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

// Pull ad attribution off the landing URL + referrer so the lead record
// can tie back to the campaign/ad set. Cheap and best-effort.
function readAttribution() {
  if (typeof window === 'undefined') return {}
  const p = new URLSearchParams(window.location.search)
  return {
    pageUrl: window.location.href,
    referrer: document.referrer || undefined,
    utmSource: p.get('utm_source') || undefined,
    utmMedium: p.get('utm_medium') || undefined,
    utmCampaign: p.get('utm_campaign') || undefined,
    utmContent: p.get('utm_content') || undefined,
    utmTerm: p.get('utm_term') || undefined,
    fbclid: p.get('fbclid') || undefined,
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
          ...readAttribution(),
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; eventId?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      // Fire the Pixel Lead event with the same eventID the server used
      // for the Conversions API event, so Meta counts it once.
      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'Lead', { content_name: 'Retirement Income Estimate' },
          data.eventId ? { eventID: data.eventId } : undefined)
      }
      router.push('/retirement-income/thank-you')
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
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
