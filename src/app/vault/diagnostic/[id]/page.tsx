'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// VAULT Success Diagnostic — full per-result report for admin + LCs.

const card: React.CSSProperties = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }
const detailLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }

type Risk = 'NEEDS_IMPROVEMENT' | 'MODERATE' | 'ON_TRACK' | 'STRONG'
type OverallClass = 'ENTRY' | 'EMERGING' | 'DEVELOPING' | 'ADVANCED' | 'ELITE'

interface ModuleView { key: string; name: string; pct: number; class: OverallClass }
interface VaultView {
  id: string
  name: string
  state: string | null
  completedAt: string | null
  createdAt: string
  status: string
  version: string | null
  overallScore: number
  overallClass: OverallClass
  overallClassLabel: string
  modules: ModuleView[]
  limitingModule: string | null
  limitingModuleName: string | null
  recommendedFocus: string | null
  email: string | null
  phone: string | null
  company: string | null
  source: string | null
  recruiterCode: string | null
  recruiterName: string | null
  risk: Risk
  probabilities: { licensing: number; retention: number; network: number; leadership: number }
  consistencyIndex: number
  consistencyPenaltyPct: number
  consistencyLabel: string
}

const MAX_SCORE = 800
const CLASS_COLOR: Record<OverallClass, string> = {
  ENTRY: '#B4451F', EMERGING: '#C9862E', DEVELOPING: '#C9A96E', ADVANCED: '#2E7D57', ELITE: '#1F6E4A',
}
const RISK_COLOR: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: '#B4451F', MODERATE: '#C9862E', ON_TRACK: '#3B6EA5', STRONG: '#2E7D57',
}
const RISK_LABEL: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: 'Needs improvement', MODERATE: 'Moderate', ON_TRACK: 'On track', STRONG: 'Strong',
}

export default function VaultDiagnosticDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const [result, setResult] = useState<VaultView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/vault/diagnostic/${id}`)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ result: VaultView }>
      })
      .then(d => setResult(d.result))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [id])

  const backLink = (
    <Link href="/vault/diagnostic" style={{ fontSize: 12, color: '#C9A96E', textDecoration: 'none' }}>
      ← Back to diagnostics
    </Link>
  )

  if (loading) {
    return <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto', color: '#6B8299' }}>{backLink}<div style={{ marginTop: 20 }}>Loading report…</div></div>
  }
  if (error || !result) {
    return <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto', color: '#E08A6B' }}>{backLink}<div style={{ marginTop: 20 }}>Couldn&apos;t load this diagnostic{error ? ` (${error})` : ''}.</div></div>
  }

  const r = result
  const classColor = CLASS_COLOR[r.overallClass] ?? '#6B8299'
  const scorePct = Math.max(0, Math.min(1, r.overallScore / MAX_SCORE))

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto', color: '#E6EDF5' }}>
      <div style={{ marginBottom: 16 }}>{backLink}</div>
      <div style={sectionLabel}>Success Diagnostic</div>

      {/* Header: identity + contact + attribution */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 300, color: '#ffffff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            {r.name || 'Unnamed respondent'}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: '#9BB0C4' }}>
            {r.email && <span>{r.email}</span>}
            {r.phone && <span>{r.phone}</span>}
            {r.company && <span>{r.company}</span>}
            {r.state && <span>{r.state}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: '#6B8299', marginTop: 8 }}>
            <span>Recruiter: <span style={{ color: '#C9A96E' }}>{r.recruiterName || r.recruiterCode || '—'}</span></span>
            {r.source && <span>Source: {r.source}</span>}
            <span>Completed: {r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}</span>
            {r.version && <span>v{r.version}</span>}
          </div>
        </div>

        {/* Score gauge + class + risk */}
        <div style={{ ...card, padding: '18px 22px', minWidth: 240, flex: '0 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 300, color: classColor, letterSpacing: '-0.03em', lineHeight: 1 }}>{r.overallScore}</span>
            <span style={{ fontSize: 15, color: '#6B8299' }}>/ {MAX_SCORE}</span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', margin: '10px 0 14px' }}>
            <div style={{ width: `${scorePct * 100}%`, height: '100%', background: classColor, borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ClassPill overallClass={r.overallClass} label={r.overallClassLabel} />
            <RiskPill risk={r.risk} />
          </div>
        </div>
      </div>

      {/* Module breakdown */}
      <div style={{ ...card, padding: '18px 22px', marginBottom: 20 }}>
        <div style={sectionLabel}>Module breakdown</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {r.modules.map(m => {
            const c = CLASS_COLOR[m.class] ?? '#C9A96E'
            const isLimiting = m.key === r.limitingModule
            const pct = Math.max(0, Math.min(100, m.pct))
            return (
              <div key={m.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, color: '#E6EDF5', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {m.name}
                    {isLimiting && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B4451F', border: '1px solid rgba(180,69,31,0.5)', background: 'rgba(180,69,31,0.12)', borderRadius: 3, padding: '1px 6px' }}>
                        Limiting
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: c, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 4 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* #1 limiting factor + recommended focus */}
      {(r.limitingModuleName || r.recommendedFocus) && (
        <div style={{ ...card, padding: '18px 22px', marginBottom: 20, borderLeft: '3px solid #B4451F' }}>
          <div style={sectionLabel}>#1 limiting factor</div>
          {r.limitingModuleName && (
            <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', marginBottom: r.recommendedFocus ? 10 : 0 }}>
              {r.limitingModuleName}
            </div>
          )}
          {r.recommendedFocus && (
            <>
              <div style={{ ...detailLabel, marginTop: 4 }}>Recommended focus</div>
              <p style={{ fontSize: 13.5, color: '#C7D3E0', lineHeight: 1.6, margin: 0 }}>{r.recommendedFocus}</p>
            </>
          )}
        </div>
      )}

      {/* Probability meters */}
      <div style={{ ...card, padding: '18px 22px', marginBottom: 20 }}>
        <div style={sectionLabel}>Predicted probabilities</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <ProbabilityMeter label="Licensing" value={r.probabilities.licensing} />
          <ProbabilityMeter label="Retention" value={r.probabilities.retention} />
          <ProbabilityMeter label="Network growth" value={r.probabilities.network} />
          <ProbabilityMeter label="Leadership" value={r.probabilities.leadership} />
        </div>
      </div>

      {/* Consistency / integrity panel */}
      <div style={{ ...card, padding: '18px 22px', marginBottom: 20 }}>
        <div style={sectionLabel}>Consistency &middot; integrity</div>
        <p style={{ fontSize: 12, color: '#6B8299', margin: '0 0 16px', lineHeight: 1.5 }}>
          Internal honesty check. Flags response patterns that look inconsistent or too self-favorable. Not shown to the respondent.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <div style={{ background: '#0F1E33', borderRadius: 6, padding: '14px 16px' }}>
            <div style={detailLabel}>Assessment</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff' }}>{r.consistencyLabel || '—'}</div>
          </div>
          <div style={{ background: '#0F1E33', borderRadius: 6, padding: '14px 16px' }}>
            <div style={detailLabel}>Consistency index</div>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>{r.consistencyIndex}</div>
          </div>
          <div style={{ background: '#0F1E33', borderRadius: 6, padding: '14px 16px' }}>
            <div style={detailLabel}>Penalty applied</div>
            <div style={{ fontSize: 22, fontWeight: 300, color: r.consistencyPenaltyPct > 0 ? '#C9862E' : '#9BB0C4', fontVariantNumeric: 'tabular-nums' }}>
              {r.consistencyPenaltyPct > 0 ? '−' : ''}{r.consistencyPenaltyPct}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProbabilityMeter({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  // Traffic-tone the meter by band so a weak likelihood reads immediately.
  const color = pct >= 70 ? '#2E7D57' : pct >= 45 ? '#C9A96E' : pct >= 25 ? '#C9862E' : '#B4451F'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9BB0C4' }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function ClassPill({ overallClass, label }: { overallClass: OverallClass; label: string }) {
  const c = CLASS_COLOR[overallClass] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 11px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {label || (overallClass.charAt(0) + overallClass.slice(1).toLowerCase())}
    </span>
  )
}

function RiskPill({ risk }: { risk: Risk }) {
  const c = RISK_COLOR[risk] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 11px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {RISK_LABEL[risk] ?? risk}
    </span>
  )
}
