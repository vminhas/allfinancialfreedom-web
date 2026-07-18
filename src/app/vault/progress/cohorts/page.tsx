'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence, animate } from 'framer-motion'
import {
  computeProgress, COHORT_META, teamOptions, filterByTeam, trainingPlays,
  BLOCKER_GROUPS, BLOCKER_META, LICENSE_RED_FLAG_DAYS, LICENSE_STEP_TOTAL,
  type CohortKey, type MatrixPayload, type AgentProgress, type Play, type BlockerKey, type Effort,
} from '@/lib/progression-cohorts'
import { PHASE_LABELS } from '@/lib/agent-constants'
import TeamClusterViz from './TeamClusterViz'

const C = {
  bg: '#f4f6f9', card: '#fff', ink: '#1b3a5c', navy: '#0b192c',
  gold: '#c9a96e', muted: '#6b8299', line: '#e4e9f0',
  red: '#c0392b', amber: '#b7791f', green: '#2f855a', blue: '#2b6cb0',
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

function Bar({ pct, color = C.gold, h = 8 }: { pct: number; color?: string; h?: number }) {
  return (
    <span style={{ display: 'inline-block', width: 96, height: h, background: '#eef2f7', borderRadius: 5, overflow: 'hidden', verticalAlign: 'middle' }}>
      <motion.span initial={{ width: 0 }} animate={{ width: `${Math.round(pct * 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ display: 'block', height: '100%', background: color }} />
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: C.gold, margin: '30px 0 12px' }}>{children}</div>
}

function TrackCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '6px 4px' }}>{children}</div>
}

function AgentLine({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: `1px solid #f0f3f7` }}>{children}</div>
}

export default function CohortsPage() {
  const [data, setData] = useState<MatrixPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<CohortKey | null>('at-risk')
  const [plays, setPlays] = useState<Play[] | null>(null)
  const [playsSource, setPlaysSource] = useState<'ai' | 'fallback' | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [teamKey, setTeamKey] = useState<string>('') // "" = whole team; else "recruiter::X" / "trainer::Y"
  const [selectedBlocker, setSelectedBlocker] = useState<BlockerKey | null>(null)

  useEffect(() => {
    fetch('/api/admin/progress-matrix')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(() => setError('Could not load the roster. Are you signed in as an admin?'))
  }, [])

  const allRows = useMemo(() => (data ? computeProgress(data) : []), [data])
  const teams = useMemo(() => teamOptions(allRows), [allRows])
  const team = useMemo(() => {
    if (!teamKey) return null
    const [kind, value] = teamKey.split('::')
    return { kind: kind as 'recruiter' | 'trainer', value }
  }, [teamKey])
  const teamLabel = useMemo(() => teams.find(t => `${t.kind}::${t.value}` === teamKey)?.label ?? null, [teams, teamKey])
  const rows = useMemo(() => filterByTeam(allRows, team), [allRows, team])

  const byCohort = useMemo(() => {
    const m: Record<CohortKey, AgentProgress[]> = { 'at-risk': [], behind: [], stalled: [], ready: [], new: [], 'on-track': [] }
    for (const r of rows) m[r.cohort].push(r)
    for (const k of COHORT_ORDER) m[k].sort((a, b) => (b.daysSinceProgress ?? 0) - (a.daysSinceProgress ?? 0))
    return m
  }, [rows])

  const needAttention = byCohort['at-risk'].length + byCohort.behind.length + byCohort.stalled.length
  const avgPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.ratio, 0) / rows.length * 100) : 0

  // Milestone tracks
  const licensing = useMemo(() =>
    rows.filter(r => r.phase === 1)
      .sort((a, b) => Number(b.milestones.licenseFlag) - Number(a.milestones.licenseFlag) || (b.milestones.daysInLicensing ?? b.daysInPhase ?? 0) - (a.milestones.daysInLicensing ?? a.daysInPhase ?? 0)),
    [rows])
  const licenseFlags = licensing.filter(r => r.milestones.licenseFlag).length
  const fieldTraining = useMemo(() => rows.filter(r => r.phase === 2).sort((a, b) => b.milestones.ftaDone - a.milestones.ftaDone), [rows])
  const cftTrack = useMemo(() => rows.filter(r => r.phase === 3).sort((a, b) => b.milestones.cftDone - a.milestones.cftDone), [rows])

  const phaseCounts = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of rows) m.set(r.phase, (m.get(r.phase) ?? 0) + 1)
    return m
  }, [rows])
  const maxPhase = Math.max(1, ...[...phaseCounts.values()])

  const trainings = useMemo(() => trainingPlays(rows), [rows])
  const blockerCounts = useMemo(() => {
    const m = {} as Record<BlockerKey, number>
    for (const g of BLOCKER_GROUPS) m[g.key] = 0
    for (const r of rows) m[r.blocker]++
    return m
  }, [rows])

  async function runAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/admin/progress-matrix/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team ? { team: { ...team, label: teamLabel } } : {}),
      })
      const json = await res.json()
      setPlays(json.plays ?? [])
      setPlaysSource(json.source ?? 'fallback')
    } catch {
      setPlays([]); setPlaysSource('fallback')
    } finally { setAnalyzing(false) }
  }
  // Re-running analysis when the team changes keeps the plays in sync.
  function onTeamChange(v: string) { setTeamKey(v); setPlays(null) }

  if (error) return <div style={{ padding: 40, color: C.ink }}>{error}</div>
  if (!data) return <div style={{ padding: 40, color: C.muted }}>Loading roster…</div>

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', padding: '26px 22px 70px', color: C.ink }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <style>{`@media (max-width: 860px){.cluster-grid{grid-template-columns:1fr !important}.cohort-cards{grid-template-columns:1fr 1fr !important}}`}</style>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, margin: '0 0 4px', color: C.navy }}>Get Everyone On Track</h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 13.5, maxWidth: 640 }}>
              Milestone tracks, cohorts, and the exact step each agent is stuck on.{' '}
              <Link href="/vault/progress" style={{ color: C.gold, fontWeight: 600 }}>Full matrix →</Link>
            </p>
          </div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={runAnalysis} disabled={analyzing}
            style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 700, fontSize: 13.5, cursor: analyzing ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.gold }}>✦</span>{analyzing ? 'Analyzing…' : team ? `Analyze ${teamLabel}'s team` : 'Highest-impact analysis'}
          </motion.button>
        </motion.div>

        {/* Team filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Viewing</span>
          <select value={teamKey} onChange={e => onTeamChange(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, minWidth: 240 }}>
            <option value="">Whole team ({allRows.length})</option>
            <optgroup label="By recruiter">
              {teams.filter(t => t.kind === 'recruiter').map(t => <option key={`r-${t.value}`} value={`recruiter::${t.value}`}>{t.label} ({t.count})</option>)}
            </optgroup>
            <optgroup label="By trainer / CFT">
              {teams.filter(t => t.kind === 'trainer').map(t => <option key={`t-${t.value}`} value={`trainer::${t.value}`}>{t.label} ({t.count})</option>)}
            </optgroup>
          </select>
          {team && <button onClick={() => onTeamChange('')} style={{ background: 'none', border: 'none', color: C.gold, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Clear</button>}
          <span style={{ fontSize: 12, color: C.muted }}>{rows.length} agent{rows.length === 1 ? '' : 's'} in view</span>
        </div>

        {/* KPIs */}
        <motion.div key={teamKey} initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '18px 0 8px' }}>
          {[
            { n: rows.length, l: 'Agents in view', c: C.navy },
            { n: needAttention, l: 'Need attention', c: C.red },
            { n: licenseFlags, l: `In licensing 21+ days`, c: licenseFlags ? C.red : C.green },
            { n: avgPct, l: 'Avg phase completion', c: C.green, suffix: '%' },
          ].map(k => (
            <motion.div key={k.l} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: k.c, lineHeight: 1 }}><AnimatedNumber value={k.n} suffix={k.suffix ?? ''} /></div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>{k.l}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── 10k view: cluster + training plays ── */}
        <SectionLabel>The whole team · clustered by blocker</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, alignItems: 'start' }} className="cluster-grid">
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
            <TeamClusterViz rows={rows} onSelect={setSelectedBlocker} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: C.gold, marginBottom: 10 }}>Training plays · highest impact</div>
            {trainings.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No blockers in this view.</div>}
            {trainings.map((p, i) => (
              <motion.div key={p.blocker} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedBlocker(p.blocker)}
                style={{ border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.gold}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: C.navy, color: C.gold, borderRadius: 6, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flex: '0 0 22px' }}>{i + 1}</span>
                  <h4 style={{ margin: 0, fontSize: 14, color: C.navy }}>{p.training}</h4>
                  <span style={{ marginLeft: 'auto', fontWeight: 800, color: C.navy, fontSize: 15, whiteSpace: 'nowrap' }}>{p.unblocks}<span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}> unblocked</span></span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: C.ink, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <EffortBadge effort={p.effort} />
                  {p.quickWin && <span style={{ fontSize: 10, fontWeight: 800, color: '#8a6d1f', background: '#f6efdb', borderRadius: 20, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.5px' }}>Quick win</span>}
                  <span>Clears: <b>{BLOCKER_META[p.blocker].label}</b></span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Cohort breakdown cards */}
        <SectionLabel>Cohort breakdown · click for names</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} className="cohort-cards">
          {BLOCKER_GROUPS.filter(g => blockerCounts[g.key] > 0).map(g => (
            <motion.button key={g.key} whileHover={{ y: -2 }} onClick={() => setSelectedBlocker(g.key)}
              style={{ textAlign: 'left', background: C.card, border: `1px solid ${C.line}`, borderTop: `4px solid ${g.color}`, borderRadius: 12, padding: '14px 15px', cursor: 'pointer' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.navy, lineHeight: 1 }}>{blockerCounts[g.key]}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginTop: 6 }}>{g.label}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{g.training ? `Training: ${g.training}` : 'Keep the momentum going'}</div>
            </motion.button>
          ))}
        </div>

        {/* AI plays */}
        <AnimatePresence>
          {plays && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginTop: 22 }}>
              <SectionLabel>Highest-impact plays{team ? ` · ${teamLabel}'s team` : ''}{playsSource === 'fallback' && <span style={{ color: C.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · rule-based</span>}</SectionLabel>
              <motion.div variants={{ show: { transition: { staggerChildren: 0.07 } } }} initial="hidden" animate="show" style={{ display: 'grid', gap: 12 }}>
                {plays.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Nothing urgent surfaced. This group is in good shape.</div>}
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
                        {p.agentCodes.map(code => <span key={code} style={{ fontSize: 11, background: '#f2f5f9', border: `1px solid ${C.line}`, borderRadius: 20, padding: '3px 9px', color: C.ink }}>{nameFor(allRows, code)}</span>)}
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Licensing pipeline ── */}
        {licensing.length > 0 && <>
          <SectionLabel>Licensing pipeline · Phase 1 (not yet in field training){licenseFlags > 0 && <span style={{ color: C.red }}> · {licenseFlags} flagged 21+ days</span>}</SectionLabel>
          <TrackCard>
            {licensing.map(r => {
              const m = r.milestones
              const days = m.daysInLicensing ?? r.daysInPhase
              const dc = m.licenseFlag ? C.red : (days != null && days >= 14 ? C.amber : C.muted)
              return (
                <AgentLine key={r.agent.id}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{r.agent.firstName} {r.agent.lastName}
                      <span style={{ fontWeight: 400, color: C.muted, fontSize: 11.5 }}> · {r.agent.agentCode}{r.agent.state ? ` · ${r.agent.state}` : ''}</span></div>
                    <div style={{ fontSize: 12.5, color: C.ink, marginTop: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {m.passedExam
                        ? <span style={{ color: C.green, fontWeight: 700 }}>✓ Passed exam</span>
                        : <span style={{ color: dc, fontWeight: 700 }}>{days != null ? `${days}d in licensing` : 'in licensing'}{m.licenseFlag ? ' ⚑' : ''}</span>}
                      <span style={{ color: C.muted }}>·</span>
                      <span style={{ color: m.examScheduled ? C.blue : C.muted }}>{m.examScheduled ? 'Exam scheduled' : 'No exam date'}</span>
                      {!m.passedExam && m.nextLicenseStep && <><span style={{ color: C.muted }}>·</span><span>Next: <b>{m.nextLicenseStep}</b></span></>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Bar pct={m.licenseDone / LICENSE_STEP_TOTAL} color={m.licenseFlag ? C.red : C.gold} />
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{m.licenseDone}/{LICENSE_STEP_TOTAL} steps</div>
                  </div>
                </AgentLine>
              )
            })}
          </TrackCard>
        </>}

        {/* ── Field Training → Senior Associate ── */}
        {fieldTraining.length > 0 && <>
          <SectionLabel>Field training → Senior Associate · Phase 2</SectionLabel>
          <TrackCard>
            {fieldTraining.map(r => {
              const m = r.milestones
              return (
                <AgentLine key={r.agent.id}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{r.agent.firstName} {r.agent.lastName}
                      <span style={{ fontWeight: 400, color: C.muted, fontSize: 11.5 }}> · {r.agent.agentCode}{r.daysInPhase != null ? ` · ${r.daysInPhase}d in phase` : ''}</span></div>
                    <div style={{ fontSize: 12.5, color: C.ink, marginTop: 3 }}>
                      {m.associateNeeds.length === 0
                        ? <span style={{ color: C.green, fontWeight: 700 }}>All Senior Associate requirements met</span>
                        : <><span style={{ color: C.muted }}>Still needs:</span> {m.associateNeeds.slice(0, 3).join(', ')}{m.associateNeeds.length > 3 ? ` +${m.associateNeeds.length - 3}` : ''}</>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Bar pct={m.ftaDone / 10} color={m.ftaDone >= 10 ? C.green : C.gold} />
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{m.ftaDone}/10 FTAs</div>
                  </div>
                </AgentLine>
              )
            })}
          </TrackCard>
        </>}

        {/* ── On track for CFT ── */}
        {cftTrack.length > 0 && <>
          <SectionLabel>On track for CFT · Phase 3</SectionLabel>
          <TrackCard>
            {cftTrack.map(r => {
              const m = r.milestones
              const sc = r.status === 'at-risk' ? C.red : r.status === 'behind' ? C.amber : C.green
              return (
                <AgentLine key={r.agent.id}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{r.agent.firstName} {r.agent.lastName}
                      <span style={{ fontWeight: 400, color: C.muted, fontSize: 11.5 }}> · {r.agent.agentCode}{r.daysInPhase != null ? ` · ${r.daysInPhase}d in phase` : ''}</span></div>
                    <div style={{ fontSize: 12.5, marginTop: 3 }}>
                      <span style={{ color: sc, fontWeight: 700, textTransform: 'capitalize' }}>{r.status.replace('-', ' ')}</span>
                      {r.nextItems[0] && <><span style={{ color: C.muted }}> · Next: </span><b>{r.nextItems[0].label}</b></>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Bar pct={m.cftDone / m.cftTotal} color={sc} />
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{m.cftDone}/{m.cftTotal} sign-offs</div>
                  </div>
                </AgentLine>
              )
            })}
          </TrackCard>
        </>}

        {/* Phase distribution */}
        <SectionLabel>Phase distribution</SectionLabel>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 18px' }}>
          {[1, 2, 3, 4, 5, 6].map(p => {
            const c = phaseCounts.get(p) ?? 0
            const info = PHASE_LABELS[p]
            return (
              <div key={p} style={{ display: 'grid', gridTemplateColumns: '210px 1fr 40px', alignItems: 'center', gap: 12, padding: '7px 0', borderTop: p > 1 ? '1px solid #f0f3f7' : 'none' }}>
                <div style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>Phase {p}: {info?.title}
                  <span style={{ display: 'block', fontWeight: 400, color: C.muted, fontSize: 11.5 }}>{info?.goal}</span></div>
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
        <motion.div key={`cohorts-${teamKey}`} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} style={{ display: 'grid', gap: 12 }}>
          {COHORT_ORDER.filter(k => byCohort[k].length).map(k => {
            const meta = COHORT_META[k]; const list = byCohort[k]; const open = expanded === k
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
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 16px 14px', display: 'grid', gap: 8 }}>
                        {list.map(r => (
                          <div key={r.agent.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', background: '#fafcff', border: `1px solid ${C.line}`, borderRadius: 8 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{r.agent.firstName} {r.agent.lastName}
                                <span style={{ fontWeight: 400, color: C.muted, fontSize: 11.5 }}> · {r.agent.agentCode}{r.agent.state ? ` · ${r.agent.state}` : ''} · Phase {r.phase}</span></div>
                              <div style={{ fontSize: 12.5, color: C.ink, marginTop: 3 }}>
                                {r.nextItems[0] ? <><span style={{ color: C.muted }}>Stuck on:</span> <b>{r.nextItems[0].label}</b></> : <span style={{ color: C.green }}>Phase complete, ready to advance</span>}
                              </div>
                              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                                {r.done}/{r.total} done ({Math.round(r.ratio * 100)}%)
                                {r.daysInPhase != null && <> · {r.daysInPhase}d in phase</>}
                                {r.daysSinceProgress != null && <> · {r.daysSinceProgress}d since progress</>}
                                {r.lastLoginDays != null && <> · last login {r.lastLoginDays === 0 ? 'today' : `${r.lastLoginDays}d ago`}</>}
                              </div>
                            </div>
                            {r.agent.email && <a href={`mailto:${r.agent.email}`} style={{ fontSize: 12, fontWeight: 700, color: C.gold, textDecoration: 'none', whiteSpace: 'nowrap' }}>Email →</a>}
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
          Live data, refreshes on load. Same at-risk math as the rest of the portal. A Phase-1 agent {LICENSE_RED_FLAG_DAYS}+ days
          in without a passed exam is flagged red. &ldquo;Highest-impact analysis&rdquo; is Claude ranking the plays; pick a recruiter
          or trainer to scope everything, including the AI, to that team.
        </p>

        {/* Member drawer */}
        <AnimatePresence>
          {selectedBlocker && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedBlocker(null)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(6,14,26,.35)', zIndex: 40 }} />
              <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 400, maxWidth: '92vw', background: '#fff', boxShadow: '-16px 0 50px rgba(11,25,44,.25)', zIndex: 41, overflowY: 'auto', padding: 22 }}>
                <button onClick={() => setSelectedBlocker(null)} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, border: 'none', background: '#f0f3f7', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 17 }}>×</button>
                {(() => {
                  const g = BLOCKER_META[selectedBlocker]
                  const members = rows.filter(r => r.blocker === selectedBlocker)
                  return (
                    <>
                      <h3 style={{ margin: '0 0 2px', fontSize: 18, color: C.navy }}>{g.label}</h3>
                      <p style={{ color: C.muted, fontSize: 13, margin: '0 0 8px' }}>{members.length} agent{members.length === 1 ? '' : 's'} · {g.gap}</p>
                      {g.training && <div style={{ background: '#faf6ee', border: '1px solid #efe6d3', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, margin: '8px 0 6px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span><b>Training:</b> {g.training}</span>{g.effort && <EffortBadge effort={g.effort} />}</div>}
                      {members.map(r => (
                        <div key={r.agent.id} style={{ padding: '10px 0', borderTop: '1px solid #eef2f7' }}>
                          <div><b style={{ color: C.navy }}>{r.agent.firstName} {r.agent.lastName}</b> <span style={{ color: C.muted, fontSize: 11.5 }}>· {r.agent.agentCode} · P{r.phase}{r.daysInPhase != null ? ` · ${r.daysInPhase}d` : ''}</span></div>
                          <div style={{ fontSize: 12, color: C.ink, marginTop: 2 }}>{r.nextItems[0] ? <>Stuck on: <b>{r.nextItems[0].label}</b></> : 'Ready to advance'}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                            {r.agent.recruiterId ? `Recruiter ${nameFor(allRows, r.agent.recruiterId)}` : ''}{r.agent.cft ? `${r.agent.recruiterId ? ' · ' : ''}Trainer ${r.agent.cft}` : ''}
                            {r.agent.email && <> · <a href={`mailto:${r.agent.email}`} style={{ color: C.gold, fontWeight: 700, textDecoration: 'none' }}>Email →</a></>}
                          </div>
                        </div>
                      ))}
                    </>
                  )
                })()}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function EffortBadge({ effort }: { effort: Effort }) {
  const map: Record<Effort, { bg: string; fg: string }> = {
    Low: { bg: '#e8f5ee', fg: '#2f855a' }, Medium: { bg: '#fdf3e2', fg: '#b7791f' }, High: { bg: '#fdecea', fg: '#c0392b' },
  }
  const c = map[effort]
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '.4px', background: c.bg, color: c.fg }}>{effort} effort</span>
}

function nameFor(rows: AgentProgress[], code: string): string {
  const r = rows.find(x => x.agent.agentCode === code)
  return r ? `${r.agent.firstName} ${r.agent.lastName}` : code
}
