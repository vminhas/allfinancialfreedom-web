'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// VAULT Success Diagnostic — list view for admin + licensing coordinators.
// Fetches completed diagnostic results, offers rich client-side filtering,
// group-by, metric cards, and a CSV export of the current filtered view.

const card: React.CSSProperties = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }
const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' }

type Risk = 'NEEDS_IMPROVEMENT' | 'MODERATE' | 'ON_TRACK' | 'STRONG'
type OverallClass = 'ENTRY' | 'EMERGING' | 'DEVELOPING' | 'ADVANCED' | 'ELITE'

interface VaultListItem {
  id: string
  createdAt: string
  completedAt: string | null
  status: string
  name: string
  email: string
  state: string | null
  source: string | null
  recruiterCode: string | null
  recruiterName: string | null
  overallScore: number
  overallClass: OverallClass
  overallClassLabel: string
  risk: Risk
  limitingModule: string | null
  limitingModuleName: string | null
  licensingProbability: number
}

const CLASS_ORDER: OverallClass[] = ['ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE']
const CLASS_COLOR: Record<OverallClass, string> = {
  ENTRY: '#B4451F', EMERGING: '#C9862E', DEVELOPING: '#C9A96E', ADVANCED: '#2E7D57', ELITE: '#1F6E4A',
}
const RISK_ORDER: Risk[] = ['NEEDS_IMPROVEMENT', 'MODERATE', 'ON_TRACK', 'STRONG']
const RISK_COLOR: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: '#B4451F', MODERATE: '#C9862E', ON_TRACK: '#3B6EA5', STRONG: '#2E7D57',
}
const RISK_LABEL: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: 'Needs improvement', MODERATE: 'Moderate', ON_TRACK: 'On track', STRONG: 'Strong',
}

const MAX_SCORE = 800

type GroupKey = 'none' | 'class' | 'risk' | 'module' | 'recruiter' | 'state'
const GROUP_OPTIONS: { key: GroupKey; label: string }[] = [
  { key: 'none', label: 'None (flat table)' },
  { key: 'class', label: 'Overall class' },
  { key: 'risk', label: 'Risk' },
  { key: 'module', label: 'Weakest module' },
  { key: 'recruiter', label: 'Recruiter' },
  { key: 'state', label: 'State' },
]

// ── CSV export helper (mirrors /vault/progress). UTF-8 BOM so Excel reads
// it as Unicode; quote any cell with a comma / quote / newline. ──────────
function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

export default function VaultDiagnosticPage() {
  const [items, setItems] = useState<VaultListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [classFilter, setClassFilter] = useState<string>('')
  const [riskFilter, setRiskFilter] = useState<string>('')
  const [moduleFilter, setModuleFilter] = useState<string>('')
  const [recruiterFilter, setRecruiterFilter] = useState<string>('')
  const [stateFilter, setStateFilter] = useState<string>('')
  const [minScore, setMinScore] = useState<number>(0)
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/vault/diagnostic')
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ items: VaultListItem[]; count: number }>
      })
      .then(d => setItems(d.items ?? []))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // Distinct option sets for the dropdowns, derived from the data so we
  // only ever offer values that actually appear.
  const moduleOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items) {
      if (it.limitingModule) m.set(it.limitingModule, it.limitingModuleName ?? it.limitingModule)
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  const recruiterOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items) {
      if (it.recruiterCode) m.set(it.recruiterCode, it.recruiterName ?? it.recruiterCode)
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  const stateOptions = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) if (it.state) s.add(it.state)
    return Array.from(s).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(it => {
      if (classFilter && it.overallClass !== classFilter) return false
      if (riskFilter && it.risk !== riskFilter) return false
      if (moduleFilter && it.limitingModule !== moduleFilter) return false
      if (recruiterFilter && it.recruiterCode !== recruiterFilter) return false
      if (stateFilter && it.state !== stateFilter) return false
      if (minScore > 0 && it.overallScore < minScore) return false
      if (q) {
        const hay = `${it.name} ${it.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, classFilter, riskFilter, moduleFilter, recruiterFilter, stateFilter, minScore, search])

  // ── Metric cards (org-wide, computed from ALL items, not the filtered
  // subset, so they read as a stable overview). ──────────────────────────
  const metrics = useMemo(() => {
    const total = items.length
    const aClass = items.filter(it => it.overallClass === 'ADVANCED' || it.overallClass === 'ELITE').length
    const avgLicensing = total > 0
      ? Math.round(items.reduce((s, it) => s + (it.licensingProbability || 0), 0) / total)
      : 0
    // Most common weakest module org-wide.
    const moduleCounts = new Map<string, number>()
    for (const it of items) {
      if (it.limitingModuleName) moduleCounts.set(it.limitingModuleName, (moduleCounts.get(it.limitingModuleName) ?? 0) + 1)
    }
    let topModule = '—'
    let topCount = 0
    for (const [name, c] of moduleCounts) {
      if (c > topCount) { topModule = name; topCount = c }
    }
    return { total, aClass, avgLicensing, topModule, topCount }
  }, [items])

  // ── Grouping. Each group carries a stable key, a display label, its
  // rows, a count, and the average score across the group. ────────────────
  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: '__all__', label: '', rows: filtered, count: filtered.length, avgScore: avg(filtered) }]
    }
    const buckets = new Map<string, VaultListItem[]>()
    for (const it of filtered) {
      const key = groupKeyFor(it, groupBy)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(it)
    }
    const arr = Array.from(buckets.entries()).map(([key, rows]) => ({
      key,
      label: groupLabelFor(rows[0], groupBy),
      rows,
      count: rows.length,
      avgScore: avg(rows),
      sortIndex: groupSortIndex(rows[0], groupBy),
    }))
    arr.sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex
      return a.label.localeCompare(b.label)
    })
    return arr
  }, [filtered, groupBy])

  const activeFilters = classFilter || riskFilter || moduleFilter || recruiterFilter || stateFilter || minScore > 0 || search.trim()

  const clearAll = () => {
    setClassFilter(''); setRiskFilter(''); setModuleFilter(''); setRecruiterFilter('')
    setStateFilter(''); setMinScore(0); setSearch('')
  }

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const exportCsv = () => {
    const cols = [
      'Name', 'Email', 'State', 'Recruiter', 'Recruiter code', 'Score', 'Class',
      'Risk', 'Licensing %', 'Weakest module', 'Source', 'Completed', 'Created',
    ]
    const rows: string[] = [cols.map(escapeCsv).join(',')]
    for (const it of filtered) {
      const r = [
        it.name ?? '',
        it.email ?? '',
        it.state ?? '',
        it.recruiterName ?? '',
        it.recruiterCode ?? '',
        String(it.overallScore),
        it.overallClassLabel ?? it.overallClass,
        RISK_LABEL[it.risk] ?? it.risk,
        String(it.licensingProbability),
        it.limitingModuleName ?? '',
        it.source ?? '',
        it.completedAt ? new Date(it.completedAt).toISOString() : '',
        it.createdAt ? new Date(it.createdAt).toISOString() : '',
      ]
      rows.push(r.map(escapeCsv).join(','))
    }
    const blob = new Blob(['﻿', rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `aff-diagnostic-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto', color: '#E6EDF5' }}>
      <div style={sectionLabel}>Success Diagnostic</div>
      <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
        Diagnostic Results
      </h1>
      <p style={{ color: '#6B8299', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
        Completed VAULT Success Diagnostics across the org. Filter, group, and open any result for the full report.
      </p>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
        <MetricCard label="Completed diagnostics" value={metrics.total.toLocaleString()} accent="#C9A96E" />
        <MetricCard label="A-class candidates" value={metrics.aClass.toLocaleString()} accent="#2E7D57" hint="Advanced or Elite overall" />
        <MetricCard label="Avg licensing probability" value={`${metrics.avgLicensing}%`} accent="#3B6EA5" />
        <MetricCard label="Most common weak spot" value={metrics.topModule} accent="#B4451F" hint={metrics.topCount > 0 ? `${metrics.topCount} result${metrics.topCount === 1 ? '' : 's'}` : undefined} small />
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: '16px 20px', marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 220px', minWidth: 180 }}>
          <label style={fieldLabel}>Search</label>
          <input style={inputStyle} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={fieldLabel}>Risk</label>
          <select style={inputStyle} value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
            <option value="">All risk levels</option>
            {RISK_ORDER.map(r => <option key={r} value={r}>{RISK_LABEL[r]}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Weakest module</label>
          <select style={inputStyle} value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
            <option value="">All modules</option>
            {moduleOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Recruiter</label>
          <select style={inputStyle} value={recruiterFilter} onChange={e => setRecruiterFilter(e.target.value)}>
            <option value="">All recruiters</option>
            {recruiterOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 120 }}>
          <label style={fieldLabel}>State</label>
          <select style={inputStyle} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="">All states</option>
            {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 130 }}>
          <label style={fieldLabel}>Min score</label>
          <select style={inputStyle} value={String(minScore)} onChange={e => setMinScore(Number(e.target.value))}>
            {[0, 200, 300, 400, 500, 600, 700].map(v => <option key={v} value={v}>{v === 0 ? 'Any' : `${v}+`}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 190 }}>
          <label style={fieldLabel}>Group by</label>
          <select style={inputStyle} value={groupBy} onChange={e => setGroupBy(e.target.value as GroupKey)}>
            {GROUP_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title="Download the current filtered view as a CSV"
          style={{
            background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.3)',
            borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', cursor: filtered.length === 0 ? 'default' : 'pointer',
            opacity: filtered.length === 0 ? 0.4 : 1,
          }}
        >
          ↓ CSV
        </button>
      </div>

      {/* Class segmented control */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <ClassChip label="All classes" active={classFilter === ''} onClick={() => setClassFilter('')} />
        {CLASS_ORDER.map(c => (
          <ClassChip
            key={c}
            label={c.charAt(0) + c.slice(1).toLowerCase()}
            color={CLASS_COLOR[c]}
            active={classFilter === c}
            onClick={() => setClassFilter(classFilter === c ? '' : c)}
          />
        ))}
      </div>

      {/* Active-filter chips */}
      {activeFilters && (
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#6B8299' }}>Active filters:</span>
          {classFilter && <FilterPill label={`Class: ${classFilter.charAt(0) + classFilter.slice(1).toLowerCase()}`} onClear={() => setClassFilter('')} />}
          {riskFilter && <FilterPill label={`Risk: ${RISK_LABEL[riskFilter as Risk]}`} onClear={() => setRiskFilter('')} />}
          {moduleFilter && <FilterPill label={`Module: ${moduleOptions.find(m => m[0] === moduleFilter)?.[1] ?? moduleFilter}`} onClear={() => setModuleFilter('')} />}
          {recruiterFilter && <FilterPill label={`Recruiter: ${recruiterOptions.find(r => r[0] === recruiterFilter)?.[1] ?? recruiterFilter}`} onClear={() => setRecruiterFilter('')} />}
          {stateFilter && <FilterPill label={`State: ${stateFilter}`} onClear={() => setStateFilter('')} />}
          {minScore > 0 && <FilterPill label={`Score ≥ ${minScore}`} onClear={() => setMinScore(0)} />}
          {search.trim() && <FilterPill label={`Search: "${search.trim()}"`} onClear={() => setSearch('')} />}
          <button
            onClick={clearAll}
            style={{ background: 'transparent', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          >Clear all</button>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#6B8299', marginBottom: 10 }}>
        Showing {filtered.length} of {items.length} result{items.length === 1 ? '' : 's'}
      </div>

      {loading ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#6B8299', fontSize: 13 }}>Loading diagnostics…</div>
      ) : error ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#E08A6B', fontSize: 13 }}>Couldn&apos;t load diagnostics ({error}).</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#6B8299', fontSize: 14 }}>
          No results match the current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: groupBy === 'none' ? 0 : 12 }}>
          {groups.map(g => {
            const isCollapsed = groupBy !== 'none' && collapsed.has(g.key)
            return (
              <div key={g.key} style={{ ...card, overflow: 'hidden' }}>
                {groupBy !== 'none' && (
                  <button
                    onClick={() => toggleGroup(g.key)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 16px', background: '#0F1E33', border: 'none', cursor: 'pointer',
                      borderBottom: isCollapsed ? 'none' : '1px solid rgba(201,169,110,0.08)',
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#6B8299', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{g.label}</span>
                    <span style={{ fontSize: 11, color: '#6B8299' }}>{g.count} result{g.count === 1 ? '' : 's'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>
                      avg {g.avgScore}/{MAX_SCORE}
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {['Name', 'Recruiter', 'Score', 'Class', 'Risk', 'Licensing', 'Weakest module', 'Completed'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map(it => (
                          <ResultRow key={it.id} it={it} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ResultRow({ it }: { it: VaultListItem }) {
  const classColor = CLASS_COLOR[it.overallClass] ?? '#6B8299'
  const pct = Math.max(0, Math.min(1, it.overallScore / MAX_SCORE))
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <td style={{ padding: '10px 14px' }}>
        <Link href={`/vault/diagnostic/${it.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{it.name || '—'}</div>
          <div style={{ fontSize: 11, color: '#6B8299' }}>{it.email || '—'}{it.state ? ` · ${it.state}` : ''}</div>
        </Link>
      </td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>
        {it.recruiterName || it.recruiterCode || '—'}
      </td>
      <td style={{ padding: '10px 14px', minWidth: 130 }}>
        <div style={{ fontSize: 12, color: '#E6EDF5', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{it.overallScore}<span style={{ color: '#6B8299' }}>/{MAX_SCORE}</span></div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: classColor, borderRadius: 3 }} />
        </div>
      </td>
      <td style={{ padding: '10px 14px' }}><ClassPill overallClass={it.overallClass} label={it.overallClassLabel} /></td>
      <td style={{ padding: '10px 14px' }}><RiskPill risk={it.risk} /></td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4', fontVariantNumeric: 'tabular-nums' }}>{it.licensingProbability}%</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>{it.limitingModuleName || '—'}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B8299', whiteSpace: 'nowrap' }}>
        {it.completedAt ? new Date(it.completedAt).toLocaleDateString() : '—'}
      </td>
    </tr>
  )
}

// ── Grouping helpers ──────────────────────────────────────────────────────
function groupKeyFor(it: VaultListItem, by: GroupKey): string {
  switch (by) {
    case 'class': return it.overallClass
    case 'risk': return it.risk
    case 'module': return it.limitingModule ?? '__none__'
    case 'recruiter': return it.recruiterCode ?? '__none__'
    case 'state': return it.state ?? '__none__'
    default: return '__all__'
  }
}
function groupLabelFor(it: VaultListItem, by: GroupKey): string {
  switch (by) {
    case 'class': return it.overallClassLabel || (it.overallClass.charAt(0) + it.overallClass.slice(1).toLowerCase())
    case 'risk': return RISK_LABEL[it.risk] ?? it.risk
    case 'module': return it.limitingModuleName || 'No weakest module'
    case 'recruiter': return it.recruiterName || it.recruiterCode || 'No recruiter'
    case 'state': return it.state || 'No state'
    default: return ''
  }
}
function groupSortIndex(it: VaultListItem, by: GroupKey): number {
  if (by === 'class') return CLASS_ORDER.indexOf(it.overallClass)
  if (by === 'risk') return RISK_ORDER.indexOf(it.risk)
  return 0
}
function avg(rows: VaultListItem[]): number {
  if (rows.length === 0) return 0
  return Math.round(rows.reduce((s, r) => s + r.overallScore, 0) / rows.length)
}

// ── Presentational pieces ─────────────────────────────────────────────────
function MetricCard({ label, value, accent, hint, small }: { label: string; value: string; accent: string; hint?: string; small?: boolean }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: small ? 18 : 28, fontWeight: 300, color: accent, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6 }}>{hint}</div>}
    </div>
  )
}

function ClassChip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  const c = color ?? '#C9A96E'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: active ? `${c}22` : 'transparent',
        border: `1px solid ${active ? c : 'rgba(255,255,255,0.08)'}`,
        color: active ? c : '#6B8299', cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function ClassPill({ overallClass, label }: { overallClass: OverallClass; label: string }) {
  const c = CLASS_COLOR[overallClass] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {label || (overallClass.charAt(0) + overallClass.slice(1).toLowerCase())}
    </span>
  )
}

function RiskPill({ risk }: { risk: Risk }) {
  const c = RISK_COLOR[risk] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {RISK_LABEL[risk] ?? risk}
    </span>
  )
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.35)',
      fontSize: 11, fontWeight: 600, color: '#E0C088',
    }}>
      {label}
      <button
        onClick={onClear}
        style={{ background: 'transparent', border: 'none', color: '#E0C088', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
        aria-label={`Clear ${label}`}
      >×</button>
    </span>
  )
}
