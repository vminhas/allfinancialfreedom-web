'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { MODULES } from '@/lib/diagnostic/questions'
import {
  CLASS_LABEL,
  MAX_OVERALL,
  type DiagnosticClass,
} from '@/lib/diagnostic/scoring'

// Public results report for a completed AFF Success Diagnostic. Reads the
// row id (an unguessable capability token) from the route, fetches the
// subject view, and renders the score gauge, module breakdown, limiting
// factor, probability meters, recommended focus, and consistency badge.

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
.diag-theme:hover { color:var(--ink); border-color:var(--gold); }
.diag-report-body { display:grid; grid-template-columns:1.35fr 1fr; gap:30px; }
.diag-report-hero { display:grid; grid-template-columns:auto 1fr; gap:28px; align-items:center; }
@keyframes diagspin { to { transform:rotate(360deg); } }
@media (max-width:720px) {
  .diag-report-body { grid-template-columns:1fr; }
  .diag-report-hero { grid-template-columns:1fr; text-align:center; justify-items:center; }
}
@media (prefers-reduced-motion: reduce) { * { animation-duration:0.001ms !important; } }
`

// Class -> theme-aware color + wash variables.
const CLASS_COLOR: Record<DiagnosticClass, { color: string; wash: string }> = {
  ENTRY: { color: 'var(--crit)', wash: 'var(--crit-wash)' },
  EMERGING: { color: 'var(--warn)', wash: 'var(--warn-wash)' },
  DEVELOPING: { color: 'var(--gold-deep)', wash: 'var(--gold-wash)' },
  ADVANCED: { color: 'var(--good)', wash: 'var(--good-wash)' },
  ELITE: { color: 'var(--elite)', wash: 'var(--elite-wash)' },
}

const MODULE_ORDER: Record<string, number> = Object.fromEntries(
  MODULES.map((m) => [m.key, m.order]),
)

interface ModuleScore {
  key: string
  name: string
  pct: number
  class: DiagnosticClass
}
interface Probabilities {
  licensing: number
  retention: number
  network: number
  leadership: number
}
interface ResultData {
  id: string
  name: string
  completedAt: string | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
  probabilities: Probabilities
  consistencyLabel: string
}

function useTheme() {
  const toggle = () => {
    const root = document.documentElement
    const current =
      root.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    root.dataset.theme = current === 'dark' ? 'light' : 'dark'
  }
  return { toggle }
}

export default function ResultsPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { toggle } = useTheme()

  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading')
  const [result, setResult] = useState<ResultData | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    setStatus('loading')
    fetch(`/api/diagnostic/result/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (active) setStatus('notfound')
          return
        }
        if (!res.ok) {
          if (active) setStatus('error')
          return
        }
        const data = (await res.json()) as { result?: ResultData }
        if (active) {
          if (data.result) {
            setResult(data.result)
            setStatus('ready')
          } else {
            setStatus('error')
          }
        }
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [id])

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
            maxWidth: 920,
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

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '30px 20px 64px' }}>
        {status === 'loading' && <StateCard title="Building your report…" spinner />}
        {status === 'notfound' && (
          <StateCard
            title="Report not found"
            body="This results link is invalid or has expired. If you just finished the diagnostic, please check the link and try again."
          />
        )}
        {status === 'error' && (
          <StateCard
            title="Something went wrong"
            body="We could not load this report right now. Please refresh the page in a moment."
          />
        )}
        {status === 'ready' && result && <Report result={result} />}
      </main>
    </div>
  )
}

function StateCard({ title, body, spinner }: { title: string; body?: string; spinner?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        boxShadow: 'var(--shadow)',
        padding: '48px 30px',
        textAlign: 'center',
        maxWidth: 520,
        margin: '40px auto 0',
      }}
    >
      {spinner && (
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: '3px solid var(--surface-3)',
            borderTopColor: 'var(--gold-deep)',
            display: 'inline-block',
            animation: 'diagspin .8s linear infinite',
            marginBottom: 18,
          }}
        />
      )}
      <h2 style={{ fontSize: 22, marginBottom: body ? 10 : 0 }}>{title}</h2>
      {body && <p style={{ color: 'var(--ink-soft)', fontSize: 15, lineHeight: 1.6 }}>{body}</p>}
    </div>
  )
}

function Pill({ className: cls, label }: { className: DiagnosticClass; label: string }) {
  const { color, wash } = CLASS_COLOR[cls]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.03em',
        padding: '3px 9px',
        borderRadius: 999,
        textTransform: 'uppercase',
        color,
        background: wash,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {label}
    </span>
  )
}

function Report({ result }: { result: ResultData }) {
  const pct = Math.round((result.overallScore / MAX_OVERALL) * 100)
  // Gauge arc: radius 74, circumference ~= 464.9. Fill proportional to score.
  const CIRC = 2 * Math.PI * 74
  const dashOffset = CIRC * (1 - result.overallScore / MAX_OVERALL)

  const modules = [...result.modules].sort(
    (a, b) => (MODULE_ORDER[a.key] ?? 99) - (MODULE_ORDER[b.key] ?? 99),
  )

  const limiting = result.modules.find((m) => m.key === result.limitingModule)
  const limitingPct = limiting ? Math.round(limiting.pct) : 0

  const probs: { label: string; value: number }[] = [
    { label: 'Licensing probability', value: result.probabilities.licensing },
    { label: 'Retention probability', value: result.probabilities.retention },
    { label: 'Network expansion', value: result.probabilities.network },
    { label: 'Leadership potential', value: result.probabilities.leadership },
  ]

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      {/* hero */}
      <div
        className="diag-report-hero"
        style={{
          padding: '30px 28px 26px',
          background: 'radial-gradient(600px 300px at 90% -20%, var(--gold-wash), transparent 60%)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ position: 'relative', width: 172, height: 172 }}>
          <svg width="172" height="172" viewBox="0 0 172 172" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="86" cy="86" r="74" fill="none" stroke="var(--surface-3)" strokeWidth="14" />
            <circle
              cx="86"
              cy="86"
              r="74"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={CIRC.toFixed(1)}
              strokeDashoffset={dashOffset.toFixed(1)}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeContent: 'center',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 42,
                lineHeight: 1,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {result.overallScore}
              <small style={{ fontSize: 16, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                /{MAX_OVERALL}
              </small>
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--gold-deep)',
                marginTop: 6,
              }}
            >
              Success Score
            </div>
          </div>
        </div>

        <div>
          <h3
            style={{
              fontSize: 15,
              fontFamily: 'var(--sans)',
              fontWeight: 600,
              color: 'var(--muted)',
              letterSpacing: '0.02em',
            }}
          >
            Personal Performance Report
          </h3>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, margin: '2px 0 14px', color: 'var(--ink)' }}>
            {result.name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, justifyContent: 'inherit' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--ink-soft)',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: '7px 12px',
              }}
            >
              Overall class <Pill className={result.overallClass} label={result.overallClassLabel} />
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--ink-soft)',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: '7px 12px',
              }}
            >
              Consistency <b style={{ color: 'var(--good)', fontWeight: 600 }}>{result.consistencyLabel}</b>
            </span>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="diag-report-body" style={{ padding: '26px 28px 30px' }}>
        {/* left: module breakdown */}
        <div>
          <div style={blockTitleStyle}>
            <span style={{ color: 'var(--gold-deep)' }}>■</span> Module breakdown
          </div>

          {modules.map((m) => {
            const p = Math.round(m.pct)
            const { color } = CLASS_COLOR[m.class]
            return (
              <div
                key={m.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '6px 12px',
                  alignItems: 'center',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{m.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Pill className={m.class} label={CLASS_LABEL[m.class]} />
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      width: 44,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p}%
                  </span>
                </div>
                <div
                  style={{
                    gridColumn: '1 / -1',
                    height: 6,
                    borderRadius: 4,
                    background: 'var(--surface-3)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      width: `${p}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>
            )
          })}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'var(--good-wash)',
              border: '1px solid color-mix(in srgb,var(--good) 28%, transparent)',
              borderRadius: 12,
              padding: '14px 16px',
              marginTop: 20,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--surface)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--good)',
                flexShrink: 0,
                boxShadow: 'var(--shadow)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              <b style={{ color: 'var(--good)' }}>Consistency: {result.consistencyLabel}.</b> Your
              reverse-worded items line up with their positive twins, so this score reflects your real
              pattern.
            </div>
          </div>
        </div>

        {/* right: limiting factor + probabilities */}
        <div>
          <div
            style={{
              background: 'var(--crit-wash)',
              border: '1px solid color-mix(in srgb,var(--crit) 30%, transparent)',
              borderRadius: 12,
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--crit)',
                fontWeight: 700,
              }}
            >
              ⚠ #1 Limiting factor
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 19, margin: '6px 0 3px', color: 'var(--ink)' }}>
              {result.limitingModuleName}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              Lowest module at{' '}
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--crit)', fontWeight: 700 }}>
                {limitingPct}%
              </span>
              . Everything downstream is capped here first.
            </div>
          </div>

          <div style={{ ...blockTitleStyle, marginTop: 26 }}>
            <span style={{ color: 'var(--gold-deep)' }}>■</span> Probability indicators
          </div>
          {probs.map((p) => {
            const v = Math.round(p.value)
            return (
              <div key={p.label} style={{ marginBottom: 15 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    marginBottom: 6,
                    color: 'var(--ink-soft)',
                  }}
                >
                  <span>{p.label}</span>
                  <b style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>{v}%</b>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 5,
                      width: `${v}%`,
                      background: 'linear-gradient(90deg,#3b6ea5,var(--ink))',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* recommended focus, full width */}
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
            background: 'linear-gradient(120deg,var(--surface-2),var(--surface-3))',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '18px 22px',
          }}
        >
          <div>
            <b
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--gold-deep)',
              }}
            >
              🎯 Recommended focus area
            </b>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, marginTop: 3, color: 'var(--ink)' }}>
              {result.recommendedFocus}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const blockTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
