'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/useIsMobile'

// Class colors, shared by pills and bars.
const CLASS_COLOR: Record<string, string> = {
  ENTRY: '#B4451F',
  EMERGING: '#B67A22',
  DEVELOPING: '#C9A96E',
  ADVANCED: '#4ADE80',
  ELITE: '#34D399',
}

const MAX_OVERALL = 800

// Which classes each segmented-control bucket includes.
const CLASS_BUCKETS: Record<string, string[]> = {
  ALL: ['ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE'],
  ADVANCED: ['ADVANCED', 'ELITE'],
  EMERGING: ['EMERGING', 'DEVELOPING'],
  ENTRY: ['ENTRY'],
}
const BUCKET_LABEL: Record<string, string> = {
  ALL: 'All',
  ADVANCED: 'Advanced+',
  EMERGING: 'Emerging',
  ENTRY: 'Entry',
}

interface ModuleScore {
  key: string
  name: string
  pct: number
  class: string
}

interface SubjectView {
  id: string
  name: string
  completedAt: string | null
  overallScore: number
  overallClass: string
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
  probabilities: { licensing: number; retention: number; network: number; leadership: number }
  consistencyLabel: string
}

interface CoachingListItem {
  id: string
  name: string
  completedAt: string | null
  overallScore: number
  overallClass: string
  overallClassLabel: string
  limitingModule: string
  limitingModuleName: string
}

// The coaching drill-in view. No risk, no probabilities, no consistency.
interface CoachingView {
  id: string
  name: string
  state: string | null
  completedAt: string | null
  overallScore: number
  overallClass: string
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ClassPill({ cls, label }: { cls: string; label: string }) {
  const color = CLASS_COLOR[cls] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color, background: `${color}1A`, border: `1px solid ${color}55`,
      borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// A thin score bar colored by class, filled proportional to score/800.
function ScoreBar({ score, cls, width = 80 }: { score: number; cls: string; width?: number | string }) {
  const color = CLASS_COLOR[cls] ?? '#6B8299'
  const pct = Math.max(0, Math.min(100, (score / MAX_OVERALL) * 100))
  return (
    <div style={{ width, height: 6, borderRadius: 999, background: 'rgba(155,176,196,0.15)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  )
}

// A single module row in the 10-module breakdown.
function ModuleRow({ m }: { m: ModuleScore }) {
  const color = CLASS_COLOR[m.class] ?? '#6B8299'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#9BB0C4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m.name}
      </div>
      <div style={{ flex: '0 0 96px', height: 6, borderRadius: 999, background: 'rgba(155,176,196,0.15)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, m.pct))}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <div style={{ flex: '0 0 40px', textAlign: 'right', fontSize: 11, fontWeight: 700, color }}>
        {Math.round(m.pct)}%
      </div>
    </div>
  )
}

function ModuleBreakdown({ modules }: { modules: ModuleScore[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {modules.map(m => <ModuleRow key={m.key} m={m} />)}
    </div>
  )
}

export default function DiagnosticPage() {
  const router = useRouter()
  const isMobile = useIsMobile()

  const [loading, setLoading] = useState(true)
  const [mine, setMine] = useState<SubjectView | null>(null)
  const [team, setTeam] = useState<CoachingListItem[]>([])
  const [agentCode, setAgentCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState<'ALL' | 'ADVANCED' | 'EMERGING' | 'ENTRY'>('ALL')
  const [moduleFilter, setModuleFilter] = useState<string>('ALL')

  // Drill-in modal
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CoachingView | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    // Preserve ?preview=<token> so admin "view portal as X" keeps working.
    const search = typeof window !== 'undefined' ? window.location.search : ''
    fetch(`/api/agents/diagnostic${search}`)
      .then(r => r.json())
      .then((d: { mine: SubjectView | null; team: CoachingListItem[] }) => {
        setMine(d.mine ?? null)
        setTeam(Array.isArray(d.team) ? d.team : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    fetch(`/api/agents/me${search}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { agentCode?: string } | null) => { if (d?.agentCode) setAgentCode(d.agentCode) })
      .catch(() => {})
  }, [])

  const openDetail = useCallback((id: string) => {
    setOpenId(id)
    setDetail(null)
    setDetailLoading(true)
    const qs = typeof window !== 'undefined' ? window.location.search : ''
    fetch(`/api/agents/diagnostic/${id}${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { tier: string; result: CoachingView } | null) => { setDetail(d?.result ?? null) })
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }, [])

  const copyShareLink = useCallback(async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = agentCode
      ? `${origin}/diagnostic?ref=${encodeURIComponent(agentCode)}`
      : `${origin}/diagnostic`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy your diagnostic link:', link)
    }
  }, [agentCode])

  // Module chips available to filter by (from the team's limiting modules).
  const moduleOptions = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const t of team) {
      if (t.limitingModule) byKey.set(t.limitingModule, t.limitingModuleName)
    }
    return [...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [team])

  const filteredTeam = useMemo(() => {
    const q = search.trim().toLowerCase()
    const bucket = CLASS_BUCKETS[classFilter]
    return team
      .filter(t => {
        if (q && !t.name.toLowerCase().includes(q)) return false
        if (!bucket.includes(t.overallClass)) return false
        if (moduleFilter !== 'ALL' && t.limitingModule !== moduleFilter) return false
        return true
      })
      .sort((a, b) => a.overallScore - b.overallScore) // weakest first
  }, [team, search, classFilter, moduleFilter])

  const panel = '#142D48'
  const card = '#132238'
  const gold = '#C9A96E'

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628' }}>
      {/* Sticky header */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: isMobile
          ? 'calc(10px + env(safe-area-inset-top)) 14px 10px'
          : 'calc(14px + env(safe-area-inset-top)) clamp(16px,4vw,32px) 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: gold, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: gold }}>
            AFF Success Diagnostic
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 1 }}>Diagnostic</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px,4vw,28px)' }}>
        {loading ? (
          <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>Loading...</div>
        ) : (
          <>
            {/* Your result */}
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B8299', margin: '0 0 12px' }}>
                Your result
              </h2>

              {mine ? (
                <div style={{
                  background: panel, border: '1px solid rgba(201,169,110,0.14)', borderRadius: 12,
                  padding: 'clamp(16px,3vw,22px)',
                }}>
                  {/* Score + class */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{mine.overallScore}</span>
                      <span style={{ fontSize: 16, color: '#6B8299', fontWeight: 600 }}>/ {MAX_OVERALL}</span>
                    </div>
                    <div style={{ paddingBottom: 4 }}>
                      <ClassPill cls={mine.overallClass} label={mine.overallClassLabel} />
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6B8299', paddingBottom: 6 }}>
                      Completed {formatDate(mine.completedAt)}
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <ScoreBar score={mine.overallScore} cls={mine.overallClass} width="100%" />
                  </div>

                  {/* Module breakdown */}
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 10 }}>
                    Module breakdown
                  </div>
                  <ModuleBreakdown modules={mine.modules} />

                  {/* Limiting factor + recommended focus */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 20 }}>
                    <div style={{ background: card, border: '1px solid rgba(180,69,31,0.35)', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B4451F', marginBottom: 6 }}>
                        #1 Limiting factor
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{mine.limitingModuleName}</div>
                    </div>
                    <div style={{ background: card, border: '1px solid rgba(201,169,110,0.25)', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: gold, marginBottom: 6 }}>
                        Recommended focus
                      </div>
                      <div style={{ fontSize: 13, color: '#9BB0C4', lineHeight: 1.5 }}>{mine.recommendedFocus}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: panel, border: '1px solid rgba(201,169,110,0.14)', borderRadius: 12,
                  padding: 'clamp(20px,4vw,28px)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                    You haven&apos;t taken the diagnostic yet
                  </div>
                  <div style={{ fontSize: 13, color: '#9BB0C4', marginBottom: 18, lineHeight: 1.5 }}>
                    Get your AFF success score across all 10 modules and see exactly where to focus next.
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <a
                      href="/diagnostic"
                      style={{
                        display: 'inline-block', background: gold, color: '#0A1628',
                        fontWeight: 700, fontSize: 13, letterSpacing: '0.03em',
                        borderRadius: 8, padding: '10px 20px', textDecoration: 'none',
                      }}
                    >
                      Take the diagnostic
                    </a>
                    <button
                      onClick={copyShareLink}
                      style={{
                        background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.3)',
                        color: gold, fontWeight: 700, fontSize: 13, borderRadius: 8,
                        padding: '10px 20px', cursor: 'pointer',
                      }}
                    >
                      {copied ? 'Link copied' : 'Share your link'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Your team */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B8299', margin: 0 }}>
                  Your team
                </h2>
                {team.length > 0 && (
                  <span style={{ fontSize: 11, color: '#4B5563' }}>
                    {filteredTeam.length} of {team.length}
                  </span>
                )}
                {mine && (
                  <button
                    onClick={copyShareLink}
                    style={{
                      marginLeft: 'auto',
                      background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.3)',
                      color: gold, fontWeight: 700, fontSize: 11, borderRadius: 6,
                      padding: '6px 12px', cursor: 'pointer',
                    }}
                  >
                    {copied ? 'Link copied' : 'Share your link'}
                  </button>
                )}
              </div>

              {team.length === 0 ? (
                <div style={{
                  background: panel, border: '1px solid rgba(201,169,110,0.1)', borderRadius: 12,
                  padding: 'clamp(20px,4vw,32px)', textAlign: 'center',
                  color: '#9BB0C4', fontSize: 13, lineHeight: 1.6,
                }}>
                  No completed diagnostics from your team yet. Share your link to get started.
                </div>
              ) : (
                <>
                  {/* Filters */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name..."
                        style={{
                          flex: 1, minWidth: 160,
                          background: card, border: '1px solid rgba(201,169,110,0.2)',
                          borderRadius: 6, color: '#9BB0C4', padding: '8px 12px', fontSize: 13,
                        }}
                      />
                      {/* Class segmented control */}
                      <div style={{ display: 'inline-flex', background: card, border: '1px solid rgba(201,169,110,0.2)', borderRadius: 8, padding: 3, gap: 2 }}>
                        {(['ALL', 'ADVANCED', 'EMERGING', 'ENTRY'] as const).map(b => {
                          const active = classFilter === b
                          return (
                            <button
                              key={b}
                              onClick={() => setClassFilter(b)}
                              style={{
                                background: active ? 'rgba(201,169,110,0.18)' : 'transparent',
                                border: active ? '1px solid rgba(201,169,110,0.4)' : '1px solid transparent',
                                color: active ? gold : '#6B8299',
                                fontSize: 11, fontWeight: 700, borderRadius: 6,
                                padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              {BUCKET_LABEL[b]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Weakest-module chips */}
                    {moduleOptions.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4B5563', marginRight: 2 }}>
                          Top gap
                        </span>
                        {[['ALL', 'All'] as [string, string], ...moduleOptions].map(([key, label]) => {
                          const active = moduleFilter === key
                          return (
                            <button
                              key={key}
                              onClick={() => setModuleFilter(key)}
                              style={{
                                background: active ? 'rgba(201,169,110,0.18)' : 'rgba(201,169,110,0.04)',
                                border: active ? '1px solid rgba(201,169,110,0.4)' : '1px solid rgba(201,169,110,0.12)',
                                color: active ? gold : '#9BB0C4',
                                fontSize: 11, fontWeight: 600, borderRadius: 999,
                                padding: '4px 11px', cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Team list */}
                  {filteredTeam.length === 0 ? (
                    <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                      No recruits match these filters.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filteredTeam.map(t => (
                        <button
                          key={t.id}
                          onClick={() => openDetail(t.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr auto' : '1.5fr 1.2fr auto 1.4fr auto',
                            alignItems: 'center', gap: isMobile ? 8 : 14,
                            background: card, border: '1px solid rgba(201,169,110,0.1)',
                            borderRadius: 10, padding: isMobile ? '12px 14px' : '12px 16px',
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.name}
                            </div>
                            {isMobile && (
                              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Gap: {t.limitingModuleName}
                              </div>
                            )}
                          </div>

                          {!isMobile && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ScoreBar score={t.overallScore} cls={t.overallClass} width={70} />
                              <span style={{ fontSize: 11, color: '#9BB0C4', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {t.overallScore}/{MAX_OVERALL}
                              </span>
                            </div>
                          )}

                          <ClassPill cls={t.overallClass} label={t.overallClassLabel} />

                          {!isMobile && (
                            <div style={{ fontSize: 12, color: '#9BB0C4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.limitingModuleName}
                            </div>
                          )}

                          <div style={{ fontSize: 11, color: '#6B8299', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {isMobile ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                <span style={{ color: '#9BB0C4', fontWeight: 600 }}>{t.overallScore}/{MAX_OVERALL}</span>
                                <span>{formatDate(t.completedAt)}</span>
                              </div>
                            ) : (
                              formatDate(t.completedAt)
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* Drill-in modal */}
      {openId && (
        <div
          onClick={() => setOpenId(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(10,22,40,0.82)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
            padding: isMobile ? 0 : 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#142D48', border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: isMobile ? '16px 16px 0 0' : 14,
              width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
              padding: 'clamp(18px,4vw,24px)',
              paddingBottom: isMobile ? 'calc(24px + env(safe-area-inset-bottom))' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A96E' }}>
                Coaching view
              </div>
              <button
                onClick={() => setOpenId(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#6B8299', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>

            {detailLoading ? (
              <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Loading...</div>
            ) : !detail ? (
              <div style={{ color: '#9BB0C4', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
                Could not load this result.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{detail.name}</div>
                  {detail.state && <div style={{ fontSize: 12, color: '#6B8299', paddingBottom: 3 }}>{detail.state}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{detail.overallScore}</span>
                  <span style={{ fontSize: 14, color: '#6B8299' }}>/ {MAX_OVERALL}</span>
                  <span style={{ marginLeft: 4 }}><ClassPill cls={detail.overallClass} label={detail.overallClassLabel} /></span>
                </div>
                <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 16 }}>
                  Completed {formatDate(detail.completedAt)}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 10 }}>
                  Module breakdown
                </div>
                <ModuleBreakdown modules={detail.modules} />

                <div style={{ background: '#132238', border: '1px solid rgba(180,69,31,0.35)', borderRadius: 10, padding: 14, marginTop: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B4451F', marginBottom: 6 }}>
                    #1 Limiting factor
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{detail.limitingModuleName}</div>
                </div>

                <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.25)', borderRadius: 10, padding: 14, marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
                    Recommended focus
                  </div>
                  <div style={{ fontSize: 13, color: '#9BB0C4', lineHeight: 1.5 }}>{detail.recommendedFocus}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
