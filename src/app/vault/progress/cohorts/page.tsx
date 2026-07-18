'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence, animate } from 'framer-motion'
import {
  computeProgress, COHORT_META,
  type CohortKey, type MatrixPayload, type AgentProgress, type Play,
} from '@/lib/progression-cohorts'
import { PHASE_LABELS } from '@/lib/agent-constants'

const C = {
  bg: '#f4f6f9', card: '#fff', ink: '#1b3a5c', navy: '#0b192c',
  gold: '#c9a96e', muted: '#6b8299', line: '#e4e9f0',
}
const COHORT_ORDER: CohortKey[] = ['at-risk', 'behind', 'stalled', 'ready', 'new', 'on-track']

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(0, value, { duration: 0.8, ease: 'easeOut', onUpdate: v => setDisplay(Math.round(v)) })
    return () => controls.stop()
  }, [value])
  return <>{display}{suffix}</>
}

export default function CohortsPage() {
  const [data, setData] = useState<MatrixPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<CohortKey | null>('at-risk')
  const [plays, setPlays] = useState<Play[] | null>(null)
  const [playsSource, setPlaysSource] = useState<'ai' | 'fallback' | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    fetch('/api/admin/progress-matrix')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(() => setError('Could not load the roster. Are you signed in as an admin?'))
  }, [])

  const rows = useMemo(() => (data ? computeProgress(data) : []), [data])
  const byCohort = useMemo(() => {
    const m: Record<CohortKey, AgentProgress[]> = { 'at-risk': [], behind: [], stalled: [], ready: [], new: [], 'on-track': [] }
    for (const r of rows) m[r.cohort].push(r)
    // Within a cohort, most-stuck first.
    for (const k of COHORT_ORDER) m[k].sort((a, b) => (b.daysSinceProgress ?? 0) - (a.daysSinceProgress ?? 0))
    return m
  }, [rows])

  const needAttention = byCohort['at-risk'].length + byCohort.behind.length + byCohort.stalled.length
  const avgPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.ratio, 0) / rows.length * 100) : 0
  const phaseCounts = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of rows) m.set(r.phase, (m.get(r.phase) ?? 0) + 1)
    return m
  }, [rows])
  const maxPhase = Math.max(1, ...[...phaseCounts.values()])

  async function runAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/admin/progress-matrix/analyze', { method: 'POST' })
      const json = await res.json()
      setPlays(json.plays ?? [])
      setPlaysSource(json.source ?? 'fallback')
    } catch {
      setPlays([])
      setPlaysSource('fallback')
    } finally {
      setAnalyzing(false)
    }
  }

  if (error) {
    return <div style={{ padding: 40, color: C.ink }}>{error}</div>
  }
  if (!data) {
    return <div style={{ padding: 40, color: C.muted }}>Loading roster…</div>
  }

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', padding: '26px 22px 70px', color: C.ink }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, margin: '0 0 4px', color: C.navy }}>
              Get Everyone On Track
            </h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 13.5, maxWidth: 620 }}>
              Every active agent grouped by what they need next, with the exact step they&rsquo;re stuck on.{' '}
              <Link href="/vault/progress" style={{ color: C.gold, fontWeight: 600 }}>See the full matrix →</Link>
            </p>
          </div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={runAnalysis} disabled={analyzing}
            style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px',
              fontWeight: 700, fontSize: 13.5, cursor: analyzing ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.gold }}>✦</span>{analyzing ? 'Analyzing…' : 'Highest-impact analysis'}
          </motion.button>
        </motion.div>

        {/* KPIs */}
        <motion.div initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '22px 0 8px' }}>
          {[
            { n: rows.length, l: 'Active agents', c: C.navy },
            { n: needAttention, l: 'Need attention', c: '#c0392b' },
            { n: byCohort.ready.length, l: 'Ready to advance', c: '#a9812f' },
            { n: avgPct, l: 'Avg phase completion', c: '#2f855a', suffix: '%' },
          ].map(k => (
            <motion.div key={k.l} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: k.c, lineHeight: 1 }}>
                <AnimatedNumber value={k.n} suffix={k.suffix ?? ''} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>{k.l}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* AI plays */}
        <AnimatePresence>
          {plays && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginTop: 22 }}>
              <SectionLabel>Highest-impact plays {playsSource === 'fallback' && <span style={{ color: C.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>&middot; rule-based</span>}</SectionLabel>
              <motion.div variants={{ show: { transition: { staggerChildren: 0.07 } } }} initial="hidden" animate="show"
                style={{ display: 'grid', gap: 12 }}>
                {plays.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nothing urgent surfaced. The team is in good shape.</div>}
                {plays.map((p, i) => (
                  <motion.div key={i} variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }}
                    style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.gold}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ background: C.navy, color: C.gold, borderRadius: 6, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
                      <h3 style={{ margin: 0, fontSize: 15, color: C.navy }}>{p.title}</h3>
                      {p.owner && <span style={{ marginLeft: 'auto', fontSize: 11.5, background: '#eef2f7', color: C.ink, padding: '3px 9px', borderRadius: 20, fontWeight: 600 }}>{p.owner}</span>}
                    </div>
                    {p.impact && <p style={{ margin: '8px 0 6px', fontSize: 13, color: C.ink }}><b style={{ color: C.navy }}>Why:</b> {p.impact}</p>}
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: C.ink }}><b style={{ color: C.navy }}>Do:</b> {p.action}</p>
                    {p.agentCodes?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.agentCodes.map(code => (
                          <span key={code} style={{ fontSize: 11, background: '#f2f5f9', border: `1px solid ${C.line}`, borderRadius: 20, padding: '3px 9px', color: C.ink }}>{nameFor(rows, code)}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase funnel */}
        <SectionLabel>Phase distribution</SectionLabel>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 18px' }}>
          {[1, 2, 3, 4, 5, 6].map(p => {
            const c = phaseCounts.get(p) ?? 0
            const info = PHASE_LABELS[p]
            return (
              <div key={p} style={{ display: 'grid', gridTemplateColumns: '210px 1fr 40px', alignItems: 'center', gap: 12, padding: '7px 0', borderTop: p > 1 ? '1px solid #f0f3f7' : 'none' }}>
                <div style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>Phase {p}: {info?.title}
                  <span style={{ display: 'block', fontWeight: 400, color: C.muted, fontSize: 11.5 }}>{info?.goal}</span>
                </div>
                <div style={{ height: 22, background: '#eef2f7', borderRadius: 6, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(c / maxPhase) * 100}%` }} transition={{ duration: 0.7, ease: 'easeOut' }}
                    style={{ height: '100%', background: `linear-gradient(90deg, #12294a, ${C.gold})`, borderRadius: 6 }} />
                </div>
                <div style={{ textAlign: 'right', fontWeight: 800, color: C.navy }}>{c}</div>
              </div>
            )
          })}
        </div>

        {/* Cohorts */}
        <SectionLabel>Where to focus</SectionLabel>
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          style={{ display: 'grid', gap: 12 }}>
          {COHORT_ORDER.filter(k => byCohort[k].length).map(k => {
            const meta = COHORT_META[k]
            const list = byCohort[k]
            const open = expanded === k
            return (
              <motion.div key={k} layout variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `5px solid ${meta.color}`, borderRadius: 12, overflow: 'hidden' }}>
                <motion.button layout onClick={() => setExpanded(open ? null : k)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color, flex: '0 0 10px' }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{meta.title}</span>
                  <span style={{ fontSize: 13, color: C.muted }}>{meta.blurb}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: C.navy }}>{list.length}</span>
                  <motion.span animate={{ rotate: open ? 90 : 0 }} style={{ color: C.muted, fontSize: 16 }}>›</motion.span>
                </motion.button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 16px 14px', display: 'grid', gap: 8 }}>
                        {list.map(r => (
                          <div key={r.agent.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', background: '#fafcff', border: `1px solid ${C.line}`, borderRadius: 8 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>
                                {r.agent.firstName} {r.agent.lastName}
                                <span style={{ fontWeight: 400, color: C.muted, fontSize: 11.5 }}> &middot; {r.agent.agentCode}{r.agent.state ? ` · ${r.agent.state}` : ''} · Phase {r.phase}</span>
                              </div>
                              <div style={{ fontSize: 12.5, color: C.ink, marginTop: 3 }}>
                                {r.nextItems[0]
                                  ? <><span style={{ color: C.muted }}>Stuck on:</span> <b>{r.nextItems[0].label}</b></>
                                  : <span style={{ color: '#2f855a' }}>Phase complete, ready to advance</span>}
                              </div>
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                                {r.done}/{r.total} done ({Math.round(r.ratio * 100)}%)
                                {r.daysInPhase != null && <> · {r.daysInPhase}d in phase</>}
                                {r.daysSinceProgress != null && <> · {r.daysSinceProgress}d since progress</>}
                                {r.lastLoginDays != null && <> · last login {r.lastLoginDays === 0 ? 'today' : `${r.lastLoginDays}d ago`}</>}
                              </div>
                            </div>
                            {r.agent.email && (
                              <a href={`mailto:${r.agent.email}`} style={{ fontSize: 12, fontWeight: 700, color: C.gold, textDecoration: 'none', whiteSpace: 'nowrap' }}>Email →</a>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>

        <p style={{ color: C.muted, fontSize: 12, marginTop: 20, lineHeight: 1.6 }}>
          Groups use the same time-aware at-risk math as the rest of the portal. &ldquo;Stuck on&rdquo; is each
          agent&rsquo;s first incomplete non-admin item in their current phase. Live data, refreshes on load.
        </p>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: C.gold, margin: '28px 0 12px' }}>{children}</div>
}

function nameFor(rows: AgentProgress[], code: string): string {
  const r = rows.find(x => x.agent.agentCode === code)
  return r ? `${r.agent.firstName} ${r.agent.lastName}` : code
}
