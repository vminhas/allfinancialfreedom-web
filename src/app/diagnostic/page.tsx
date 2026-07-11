'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUESTIONS,
  MODULES,
  FREQUENCY_OPTIONS,
  SCALE_LABELS,
  SCALE_STEPS,
  TOTAL_QUESTIONS,
  type Question,
  type ModuleMeta,
} from '@/lib/diagnostic/questions'

// Public-facing AFF Success Diagnostic: one question per screen, grouped by
// module, with a welcome screen and an end lead-capture step. Answers are
// encoded per the question bank (scale 1..7, frequency 0..4, choice 0-based
// index) and posted to /api/diagnostic/submit for server-side scoring.

// Palette + the handful of rules inline styles cannot express (theme
// variables, hover states, keyframes, responsive collapse). Everything else
// is inline via var(--x), matching the mockup and the codebase convention.
const THEME_CSS = `
:root {
  --paper:#F7F5F0; --surface:#FFFFFF; --surface-2:#FBFAF7; --surface-3:#F1EEE7;
  --ink:#16324E; --ink-soft:#40566C; --muted:#6B8299;
  --line:#E4E1D9; --line-strong:#D4D9DF;
  --gold:#C9A96E; --gold-deep:#A87F3C; --gold-wash:rgba(201,169,110,0.14);
  --good:#2E7D57; --good-wash:rgba(46,125,87,0.12);
  --elite:#1F6E4A; --elite-wash:rgba(31,110,74,0.14);
  --warn:#B67A22; --warn-wash:rgba(182,122,34,0.14);
  --crit:#B4451F; --crit-wash:rgba(180,69,31,0.12);
  --navy-wash:rgba(22,50,78,0.05);
  --shadow:0 1px 2px rgba(22,50,78,0.06), 0 12px 32px -12px rgba(22,50,78,0.18);
  --shadow-lg:0 2px 4px rgba(22,50,78,0.08), 0 30px 60px -24px rgba(22,50,78,0.32);
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:"SF Mono",ui-monospace,"Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper:#0F151B; --surface:#161F29; --surface-2:#1A242F; --surface-3:#202C38;
    --ink:#F1ECE2; --ink-soft:#C4D0DB; --muted:#8698AA;
    --line:#26323E; --line-strong:#334150;
    --gold:#D8B877; --gold-deep:#E4C68C; --gold-wash:rgba(216,184,119,0.12);
    --good:#5FB68A; --good-wash:rgba(95,182,138,0.14);
    --elite:#7ED0A6; --elite-wash:rgba(126,208,166,0.14);
    --warn:#DBA24C; --warn-wash:rgba(219,162,76,0.16);
    --crit:#E0805F; --crit-wash:rgba(224,128,95,0.15);
    --navy-wash:rgba(255,255,255,0.04);
    --shadow:0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6);
    --shadow-lg:0 2px 4px rgba(0,0,0,0.5), 0 30px 60px -24px rgba(0,0,0,0.7);
  }
}
:root[data-theme="light"] {
  --paper:#F7F5F0; --surface:#FFFFFF; --surface-2:#FBFAF7; --surface-3:#F1EEE7;
  --ink:#16324E; --ink-soft:#40566C; --muted:#6B8299;
  --line:#E4E1D9; --line-strong:#D4D9DF;
  --gold:#C9A96E; --gold-deep:#A87F3C; --gold-wash:rgba(201,169,110,0.14);
  --good:#2E7D57; --good-wash:rgba(46,125,87,0.12);
  --elite:#1F6E4A; --elite-wash:rgba(31,110,74,0.14);
  --warn:#B67A22; --warn-wash:rgba(182,122,34,0.14);
  --crit:#B4451F; --crit-wash:rgba(180,69,31,0.12);
  --navy-wash:rgba(22,50,78,0.05);
  --shadow:0 1px 2px rgba(22,50,78,0.06), 0 12px 32px -12px rgba(22,50,78,0.18);
  --shadow-lg:0 2px 4px rgba(22,50,78,0.08), 0 30px 60px -24px rgba(22,50,78,0.32);
}
:root[data-theme="dark"] {
  --paper:#0F151B; --surface:#161F29; --surface-2:#1A242F; --surface-3:#202C38;
  --ink:#F1ECE2; --ink-soft:#C4D0DB; --muted:#8698AA;
  --line:#26323E; --line-strong:#334150;
  --gold:#D8B877; --gold-deep:#E4C68C; --gold-wash:rgba(216,184,119,0.12);
  --good:#5FB68A; --good-wash:rgba(95,182,138,0.14);
  --elite:#7ED0A6; --elite-wash:rgba(126,208,166,0.14);
  --warn:#DBA24C; --warn-wash:rgba(219,162,76,0.16);
  --crit:#E0805F; --crit-wash:rgba(224,128,95,0.15);
  --navy-wash:rgba(255,255,255,0.04);
  --shadow:0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6);
  --shadow-lg:0 2px 4px rgba(0,0,0,0.5), 0 30px 60px -24px rgba(0,0,0,0.7);
}
.diag-root { background:var(--paper); color:var(--ink); font-family:var(--sans); min-height:100vh; overflow-x:hidden; }
.diag-root h1,.diag-root h2,.diag-root h3 { font-family:var(--serif); font-weight:600; line-height:1.15; margin:0; letter-spacing:-0.01em; }
.diag-opt { transition:transform .12s, border-color .12s, background .12s, color .12s; }
.diag-opt:hover { border-color:var(--gold); transform:translateY(-2px); }
.diag-btn { transition:border-color .12s, transform .12s, opacity .12s; }
.diag-btn:hover:not(:disabled) { border-color:var(--gold); }
.diag-btn:disabled { opacity:0.45; cursor:not-allowed; }
.diag-theme:hover { color:var(--ink); border-color:var(--gold); }
.diag-input:focus { outline:none; border-color:var(--gold); }
.diag-prog i { transition:width .3s ease; }
@keyframes diagspin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .diag-opt,.diag-btn,.diag-prog i { transition:none !important; } }
`

const MODULE_BY_KEY: Record<string, ModuleMeta> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
)

type Phase = 'welcome' | 'questions' | 'lead'
type Answers = Record<string, number>

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)
  useEffect(() => {
    const root = document.documentElement
    const t = (root.dataset.theme as 'light' | 'dark' | undefined) ?? null
    setTheme(t)
  }, [])
  const toggle = () => {
    const root = document.documentElement
    const current =
      root.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    setTheme(next)
  }
  return { theme, toggle }
}

export default function DiagnosticPage() {
  const router = useRouter()
  const { toggle } = useTheme()

  const [phase, setPhase] = useState<Phase>('welcome')
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [recruiterName, setRecruiterName] = useState('')
  const [recruiterCode, setRecruiterCode] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const ref = params.get('ref')
      if (ref) setRecruiterCode(ref.trim())
    } catch {
      /* no-op */
    }
  }, [])

  const answeredCount = Object.keys(answers).length
  const progressPct = Math.round((answeredCount / TOTAL_QUESTIONS) * 100)
  const question = QUESTIONS[qIndex]
  const module = question ? MODULE_BY_KEY[question.module] : undefined
  const currentAnswered = question ? answers[question.key] != null : false

  function setAnswer(key: string, value: number) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function goNext() {
    setError(null)
    if (qIndex < TOTAL_QUESTIONS - 1) setQIndex((i) => i + 1)
    else setPhase('lead')
  }
  function goBack() {
    setError(null)
    if (phase === 'lead') {
      setPhase('questions')
      setQIndex(TOTAL_QUESTIONS - 1)
    } else if (qIndex > 0) {
      setQIndex((i) => i - 1)
    } else {
      setPhase('welcome')
    }
  }

  async function submit() {
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please enter your first name, last name, and email.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/diagnostic/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          company: company.trim() || undefined,
          recruiterCode: recruiterCode || undefined,
          recruiterName: recruiterName.trim() || undefined,
          answers,
          pageUrl: window.location.href,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string; missing?: string[] }
      if (!res.ok || !data.ok || !data.id) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      router.push(`/diagnostic/results/${data.id}`)
    } catch {
      setError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="diag-root">
      <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />

      {/* top bar (sticky, iOS safe area aware) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'color-mix(in srgb, var(--paper) 88%, transparent)',
          backdropFilter: 'saturate(1.4) blur(12px)',
          WebkitBackdropFilter: 'saturate(1.4) blur(12px)',
          borderBottom: '1px solid var(--line)',
          paddingTop: 'calc(12px + env(safe-area-inset-top))',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '0 20px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: 'linear-gradient(150deg,var(--ink),#0d2036)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--gold)',
                fontFamily: 'var(--serif)',
                fontSize: 15,
                boxShadow: 'inset 0 0 0 1px rgba(201,169,110,0.35)',
              }}
            >
              A
            </span>
            <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em' }}>
              All Financial Freedom
              <small
                style={{
                  display: 'block',
                  fontFamily: 'var(--sans)',
                  fontWeight: 500,
                  fontSize: 10.5,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                Success Diagnostic
              </small>
            </span>
          </div>
          <button
            className="diag-theme"
            onClick={toggle}
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
            style={{
              marginLeft: 'auto',
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink-soft)',
              width: 38,
              height: 38,
              borderRadius: 9,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 16,
            }}
          >
            ◑
          </button>
        </div>
      </div>

      <main
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: '36px 20px 64px',
        }}
      >
        {phase === 'welcome' && (
          <Welcome onBegin={() => setPhase('questions')} referred={recruiterCode} />
        )}

        {phase === 'questions' && question && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              boxShadow: 'var(--shadow)',
              padding: '28px 26px 24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 18,
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--gold-deep)',
                  fontWeight: 600,
                }}
              >
                {module ? `Module ${module.order} · ${module.name}` : ''}
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {answeredCount} / {TOTAL_QUESTIONS}
              </span>
            </div>

            <div
              className="diag-prog"
              style={{
                height: 5,
                borderRadius: 3,
                background: 'var(--surface-3)',
                overflow: 'hidden',
                marginBottom: 26,
              }}
            >
              <i
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg,var(--gold),var(--gold-deep))',
                  borderRadius: 3,
                }}
              />
            </div>

            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 12,
                color: 'var(--gold-deep)',
                fontWeight: 600,
              }}
            >
              QUESTION {qIndex + 1}
            </div>
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 22,
                lineHeight: 1.3,
                margin: '8px 0 24px',
                color: 'var(--ink)',
              }}
            >
              {question.text}
            </p>

            <QuestionInput
              question={question}
              value={answers[question.key]}
              onSelect={(v) => setAnswer(question.key, v)}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 28,
                paddingTop: 20,
                borderTop: '1px solid var(--line)',
                gap: 12,
              }}
            >
              <button
                className="diag-btn"
                onClick={goBack}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  border: '1px solid var(--line-strong)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--sans)',
                }}
              >
                ← Back
              </button>
              <button
                className="diag-btn"
                onClick={goNext}
                disabled={!currentAnswered}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: '10px 18px',
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  background: 'linear-gradient(180deg,var(--gold),var(--gold-deep))',
                  color: '#241900',
                  boxShadow: 'var(--shadow)',
                  fontFamily: 'var(--sans)',
                }}
              >
                {qIndex === TOTAL_QUESTIONS - 1 ? 'Continue →' : 'Next →'}
              </button>
            </div>
          </div>
        )}

        {phase === 'lead' && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              boxShadow: 'var(--shadow)',
              padding: '30px 26px 26px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--gold-deep)',
                fontWeight: 600,
              }}
            >
              Almost done
            </div>
            <h2 style={{ fontSize: 25, margin: '12px 0 8px' }}>Where should we send your results?</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 22 }}>
              You have answered all {TOTAL_QUESTIONS} questions. Add your details and we will build your
              personal performance report.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="First name" required>
                <input
                  className="diag-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  style={inputStyle}
                />
              </Field>
              <Field label="Last name" required>
                <input
                  className="diag-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Email" required>
                <input
                  className="diag-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Company (optional)">
                <input
                  className="diag-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Who referred you? (optional)">
                <input
                  className="diag-input"
                  value={recruiterName}
                  onChange={(e) => setRecruiterName(e.target.value)}
                  placeholder={recruiterCode ? 'We already have your referral' : 'Name of the person who sent you'}
                  style={inputStyle}
                />
              </Field>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 18,
                  background: 'var(--crit-wash)',
                  border: '1px solid color-mix(in srgb,var(--crit) 30%, transparent)',
                  color: 'var(--crit)',
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 13.5,
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 24,
                gap: 12,
              }}
            >
              <button
                className="diag-btn"
                onClick={goBack}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  border: '1px solid var(--line-strong)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--sans)',
                }}
              >
                ← Back
              </button>
              <button
                className="diag-btn"
                onClick={submit}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 9,
                  borderRadius: 9,
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '11px 20px',
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  background: 'linear-gradient(180deg,var(--gold),var(--gold-deep))',
                  color: '#241900',
                  boxShadow: 'var(--shadow)',
                  fontFamily: 'var(--sans)',
                }}
              >
                {submitting && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      border: '2px solid rgba(36,25,0,0.35)',
                      borderTopColor: '#241900',
                      display: 'inline-block',
                      animation: 'diagspin .7s linear infinite',
                    }}
                  />
                )}
                {submitting ? 'Scoring your results…' : 'See my results →'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--line-strong)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  borderRadius: 9,
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: 'var(--sans)',
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--ink-soft)',
          marginBottom: 6,
          letterSpacing: '0.01em',
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--crit)' }}> *</span>}
      </span>
      {children}
    </label>
  )
}

function Welcome({ onBegin, referred }: { onBegin: () => void; referred: string | null }) {
  const stats = [
    { n: '120', l: 'scored questions' },
    { n: '10', l: 'performance modules' },
    { n: '800', l: 'point success score' },
    { n: '4', l: 'probability indicators' },
  ]
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        boxShadow: 'var(--shadow)',
        padding: '32px 28px 28px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--gold-deep)',
          fontWeight: 600,
        }}
      >
        Behavioral assessment
      </div>
      <h1 style={{ fontSize: 32, margin: '14px 0 12px', lineHeight: 1.08 }}>
        The AFF Success Diagnostic
      </h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 16, lineHeight: 1.6 }}>
        About 120 short items across 10 performance modules. It scores how you actually operate, flags
        your number one limiting factor, and predicts your odds of getting licensed and producing. It
        takes roughly 12 to 15 minutes.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 14,
          margin: '24px 0',
        }}
      >
        {stats.map((s) => (
          <div
            key={s.l}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--ink)', lineHeight: 1 }}>
              {s.n}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          background: 'var(--gold-wash)',
          border: '1px solid color-mix(in srgb,var(--gold) 40%, transparent)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 24,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1.2 }} aria-hidden="true">
          🎯
        </span>
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          Answer honestly, not the way you wish you were. Some items are worded in reverse and cross-check
          each other, so the most useful result comes from your first, real reaction.
        </p>
      </div>

      {referred && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>
          Referred by code <b style={{ color: 'var(--ink-soft)' }}>{referred}</b>. We will credit them
          automatically.
        </p>
      )}

      <button
        onClick={onBegin}
        className="diag-btn"
        style={{
          width: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 600,
          padding: '13px 18px',
          cursor: 'pointer',
          border: '1px solid transparent',
          background: 'linear-gradient(180deg,var(--gold),var(--gold-deep))',
          color: '#241900',
          boxShadow: 'var(--shadow)',
          fontFamily: 'var(--sans)',
        }}
      >
        Begin the diagnostic →
      </button>
    </div>
  )
}

function QuestionInput({
  question,
  value,
  onSelect,
}: {
  question: Question
  value: number | undefined
  onSelect: (v: number) => void
}) {
  if (question.type === 'scale') {
    return (
      <div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: SCALE_STEPS }, (_, i) => i + 1).map((n) => {
            const on = value === n
            return (
              <button
                key={n}
                type="button"
                className="diag-opt"
                aria-pressed={on}
                onClick={() => onSelect(n)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  aspectRatio: '1 / 1',
                  borderRadius: 11,
                  border: `1.5px solid ${on ? 'var(--gold)' : 'var(--line-strong)'}`,
                  background: on ? 'var(--gold-wash)' : 'var(--surface)',
                  color: on ? 'var(--gold-deep)' : 'var(--ink-soft)',
                  fontFamily: 'var(--mono)',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--muted)',
            marginTop: 12,
            gap: 8,
          }}
        >
          <span>{SCALE_LABELS.left}</span>
          <span>{SCALE_LABELS.center}</span>
          <span style={{ textAlign: 'right' }}>{SCALE_LABELS.right}</span>
        </div>
      </div>
    )
  }

  // choice + frequency both render as a vertical stack of option buttons.
  const options: string[] =
    question.type === 'choice' ? question.options.map((o) => o.label) : [...FREQUENCY_OPTIONS]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {options.map((label, i) => {
        const on = value === i
        return (
          <button
            key={i}
            type="button"
            className="diag-opt"
            aria-pressed={on}
            onClick={() => onSelect(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textAlign: 'left',
              borderRadius: 11,
              border: `1.5px solid ${on ? 'var(--gold)' : 'var(--line-strong)'}`,
              background: on ? 'var(--gold-wash)' : 'var(--surface)',
              color: on ? 'var(--ink)' : 'var(--ink-soft)',
              padding: '13px 15px',
              fontSize: 14.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
              lineHeight: 1.4,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                flexShrink: 0,
                border: `2px solid ${on ? 'var(--gold-deep)' : 'var(--line-strong)'}`,
                background: on ? 'var(--gold-deep)' : 'transparent',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {on && (
                <span
                  style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--surface)' }}
                />
              )}
            </span>
            {label}
          </button>
        )
      })}
    </div>
  )
}
