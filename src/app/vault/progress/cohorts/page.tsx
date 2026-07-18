'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence, animate } from 'framer-motion'
import { GeistSans } from 'geist/font/sans'
import {
  computeProgress, teamOptions, filterByTeam, trainingPlays,
  BLOCKER_META, LICENSE_RED_FLAG_DAYS, LICENSE_STEP_TOTAL,
  type CohortKey, type MatrixPayload, type AgentProgress, type Play, type BlockerKey, type Effort,
} from '@/lib/progression-cohorts'
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
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: C.gold, margin: '16px 0 8px' }}>{children}</div>
}

// Long milestone lists live in a fixed-height scroll box so the page stays
// tight instead of running for thousands of pixels.
function TrackCard({ children, cap = 340 }: { children: React.ReactNode; cap?: number }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '2px 4px', maxHeight: cap, overflowY: 'auto' }}>{children}</div>
}

function AgentLine({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: `1px solid #f0f3f7` }}>{children}</div>
}

export default function CohortsPage() {
  const [data, setData] = useState<MatrixPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [plays, setPlays] = useState<Play[] | null>(null)
  const [playsSource, setPlaysSource] = useState<'ai' | 'fallback' | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [teamKey, setTeamKey] = useState<string>('') // "" = whole team; else "recruiter::X" / "trainer::Y"
  const [selectedBlocker, setSelectedBlocker] = useState<BlockerKey | null>(null)
  const [activeTab, setActiveTab] = useState<'licensing' | 'field' | 'cft' | 'attention'>('licensing')
  const [showCompose, setShowCompose] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailResult, setEmailResult] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleDuration, setScheduleDuration] = useState(60)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleResult, setScheduleResult] = useState<string | null>(null)
  const [scheduleLink, setScheduleLink] = useState<string | null>(null)

  // Prefill a per-cohort email template whenever a group's drawer opens.
  useEffect(() => {
    if (!selectedBlocker) { setShowCompose(false); setEmailResult(null); return }
    const g = BLOCKER_META[selectedBlocker]
    setEmailSubject("Let's get you to your next milestone")
    setEmailBody(`Hi {{firstName}},\n\nYou're at the "${g.label}" stage. ${g.training ? `We're running "${g.training}" to help you clear it, and I want you in it. ` : ''}Let's knock out your next step this week. Reply here or reach out to your trainer and we'll get it scheduled.\n\nAll Financial Freedom`)
    setEmailResult(null); setShowCompose(false)
    setShowSchedule(false); setScheduleResult(null); setScheduleLink(null)
  }, [selectedBlocker])

  useEffect(() => {
    fetch('/api/admin/progress-matrix')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(() => setError('Could not load the roster. Are you signed in as an admin?'))
  }, [])

  // Exclude leadership + referral partners: they aren't in the onboarding
  // funnel, so counting them made "the team" look far bigger than it is.
  const allRowsRaw = useMemo(() => (data ? computeProgress(data) : []), [data])
  const allRows = useMemo(() => allRowsRaw.filter(r => !r.agent.isLeadership && !r.agent.isReferralPartner), [allRowsRaw])
  const excludedCount = allRowsRaw.length - allRows.length
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

  const needsAttention = useMemo(() => [...byCohort['at-risk'], ...byCohort.behind, ...byCohort.stalled], [byCohort])

  // Distinct trainer/CFT names in the system, for FTA pairing assignment.
  const trainerOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of allRowsRaw) { const c = r.agent.cft?.trim(); if (c) s.add(c) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [allRowsRaw])

  const trainings = useMemo(() => trainingPlays(rows), [rows])

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

  // Pair an FTA agent with a trainer/CFT. Optimistic; persists via the agents
  // route (cft is a whitelisted field there).
  async function assignTrainer(agentId: string, cft: string) {
    setData(d => d ? { ...d, agents: d.agents.map(a => a.id === agentId ? { ...a, cft: cft || null } : a) } : d)
    try {
      await fetch(`/api/admin/agents/${agentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cft: cft || null }),
      })
    } catch { /* optimistic; a reload reflects server truth */ }
  }

  async function scheduleTraining(blocker: BlockerKey, test: boolean) {
    const g = BLOCKER_META[blocker]
    if (!g.training) return
    if (!test && !scheduleTime) { setScheduleResult('Pick a date and time first.'); return }
    const ids = rows.filter(r => r.blocker === blocker && r.agent.email).map(r => r.agent.id)
    if (!ids.length) { setScheduleResult('No agents with an email in this group.'); return }
    setScheduleBusy(true); setScheduleResult(null); setScheduleLink(null)
    try {
      const res = await fetch('/api/admin/progress-matrix/schedule-training', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentProfileIds: ids, cohortLabel: g.label, training: g.training, startTime: scheduleTime, durationMinutes: scheduleDuration, test }),
      })
      const j = await res.json()
      if (!res.ok) setScheduleResult(j.error || 'Failed')
      else if (j.test) setScheduleResult(`Preview: would create a Zoom and email ${j.wouldSend} agent${j.wouldSend === 1 ? '' : 's'}${j.noEmail ? `, ${j.noEmail} have no email` : ''}.`)
      else { setScheduleLink(j.joinUrl); setScheduleResult(`Zoom created for ${j.whenLabel}. Emailed ${j.sent}${j.failed ? `, ${j.failed} failed` : ''}.`) }
    } catch { setScheduleResult('Failed.') }
    finally { setScheduleBusy(false) }
  }

  async function sendCohortEmail(blocker: BlockerKey, test: boolean) {
    const ids = rows.filter(r => r.blocker === blocker && r.agent.email).map(r => r.agent.id)
    if (!ids.length) { setEmailResult('No agents in this group have an email on file.'); return }
    setEmailBusy(true); setEmailResult(null)
    try {
      const res = await fetch('/api/admin/progress-matrix/cohort-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentProfileIds: ids, subject: emailSubject, body: emailBody, cohortLabel: BLOCKER_META[blocker].label, test }),
      })
      const j = await res.json()
      if (!res.ok) setEmailResult(j.error || 'Failed')
      else if (j.test) setEmailResult(`Preview: would send to ${j.wouldSend} agent${j.wouldSend === 1 ? '' : 's'}${j.noEmail ? `, ${j.noEmail} have no email` : ''}.`)
      else setEmailResult(`Sent ${j.sent}${j.failed ? `, ${j.failed} failed` : ''}${j.skipped ? `, ${j.skipped} skipped (no email)` : ''}.`)
    } catch { setEmailResult('Failed to send.') }
    finally { setEmailBusy(false) }
  }

  if (error) return <div style={{ padding: 40, color: C.ink }}>{error}</div>
  if (!data) return <div style={{ padding: 40, color: C.muted }}>Loading roster…</div>

  return (
    <div className={GeistSans.className} style={{ background: C.bg, minHeight: '100dvh', padding: '20px 22px 60px', color: C.ink }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <style>{`@media (max-width: 860px){.cluster-grid{grid-template-columns:1fr !important}}`}</style>

        {/* Top bar: title + team filter + AI, all in one row */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 23, margin: '0 0 2px', color: C.navy }}>Get Everyone On Track</h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
              {rows.length} agent{rows.length === 1 ? '' : 's'} in view{!team && excludedCount > 0 ? ` · ${excludedCount} excluded` : ''} · <Link href="/vault/progress" style={{ color: C.gold, fontWeight: 600 }}>Full matrix →</Link>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select value={teamKey} onChange={e => onTeamChange(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, minWidth: 190 }}>
              <option value="">Whole team ({allRows.length})</option>
              <optgroup label="By recruiter">
                {teams.filter(t => t.kind === 'recruiter').map(t => <option key={`r-${t.value}`} value={`recruiter::${t.value}`}>{t.label} ({t.count})</option>)}
              </optgroup>
              <optgroup label="By trainer / CFT">
                {teams.filter(t => t.kind === 'trainer').map(t => <option key={`t-${t.value}`} value={`trainer::${t.value}`}>{t.label} ({t.count})</option>)}
              </optgroup>
            </select>
            {team && <button onClick={() => onTeamChange('')} style={{ background: 'none', border: 'none', color: C.gold, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Clear</button>}
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={runAnalysis} disabled={analyzing}
              style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 15px', fontWeight: 700, fontSize: 13, cursor: analyzing ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <span style={{ color: C.gold }}>✦</span>{analyzing ? 'Analyzing…' : team ? 'Analyze team' : 'AI analysis'}
            </motion.button>
          </div>
        </motion.div>

        {/* KPIs */}
        <motion.div key={teamKey} initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, margin: '14px 0 4px' }}>
          {[
            { n: rows.length, l: 'Agents in view', c: C.navy },
            { n: needAttention, l: 'Need attention', c: C.red },
            { n: licenseFlags, l: `In licensing 21+ days`, c: licenseFlags ? C.red : C.green },
            { n: avgPct, l: 'Avg phase completion', c: C.green, suffix: '%' },
          ].map(k => (
            <motion.div key={k.l} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 14px' }}>
              <div style={{ fontSize: 25, fontWeight: 800, color: k.c, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={k.n} suffix={k.suffix ?? ''} /></div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>{k.l}</div>
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

        {/* ── Milestone tracks (tabbed) ── */}
        <SectionLabel>Milestone tracks</SectionLabel>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${C.line}`, marginBottom: 10 }}>
          {([
            { k: 'licensing' as const, label: 'Licensing', n: licensing.length, flag: licenseFlags > 0 },
            { k: 'field' as const, label: 'Field training', n: fieldTraining.length, flag: false },
            { k: 'cft' as const, label: 'CFT track', n: cftTrack.length, flag: false },
            { k: 'attention' as const, label: 'Needs attention', n: needsAttention.length, flag: needsAttention.length > 0 },
          ]).map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)}
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === t.k ? C.gold : 'transparent'}`, color: activeTab === t.k ? C.navy : C.muted, fontWeight: 700, fontSize: 13, padding: '8px 10px', marginBottom: -1, cursor: 'pointer' }}>
              {t.label} <span style={{ color: t.flag ? C.red : C.muted, fontWeight: 800 }}>{t.n}</span>
            </button>
          ))}
        </div>
        <TrackCard cap={440}>
          {activeTab === 'licensing' && licensing.map(r => {
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
          {activeTab === 'field' && fieldTraining.map(r => {
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
                    {m.ftaDone < 10 && (
                      <div style={{ fontSize: 11.5, marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ color: C.muted }}>FTA trainer:</span>
                        <select value={r.agent.cft ?? ''} onChange={e => assignTrainer(r.agent.id, e.target.value)}
                          style={{ fontSize: 11.5, padding: '3px 6px', borderRadius: 6, color: C.ink, border: `1px solid ${r.agent.cft ? C.line : '#f0d9a8'}`, background: r.agent.cft ? '#fff' : '#fff7e6' }}>
                          <option value="">Unassigned — pick a trainer</option>
                          {trainerOptions.map(t => <option key={t} value={t}>{t}</option>)}
                          {r.agent.cft && !trainerOptions.includes(r.agent.cft) && <option value={r.agent.cft}>{r.agent.cft}</option>}
                        </select>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Bar pct={m.ftaDone / 10} color={m.ftaDone >= 10 ? C.green : C.gold} />
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{m.ftaDone}/10 FTAs</div>
                  </div>
                </AgentLine>
              )
            })}
          {activeTab === 'cft' && cftTrack.map(r => {
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
          {activeTab === 'attention' && (needsAttention.length === 0
            ? <div style={{ padding: '14px 16px', color: C.muted, fontSize: 13 }}>Nobody needs urgent attention in this view.</div>
            : needsAttention.map(r => (
              <AgentLine key={r.agent.id}>
                <div>
                  <div style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{r.agent.firstName} {r.agent.lastName}
                    <span style={{ fontWeight: 400, color: C.muted, fontSize: 11.5 }}> · {r.agent.agentCode} · P{r.phase}</span></div>
                  <div style={{ fontSize: 12.5, color: C.ink, marginTop: 3 }}>
                    <span style={{ color: r.cohort === 'at-risk' ? C.red : r.cohort === 'behind' ? C.amber : C.muted, fontWeight: 700, textTransform: 'capitalize' }}>{r.cohort.replace('-', ' ')}</span>
                    {r.nextItems[0] && <> · Stuck on: <b>{r.nextItems[0].label}</b></>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {r.daysInPhase != null && <>{r.daysInPhase}d in phase · </>}{r.daysSinceProgress != null && <>{r.daysSinceProgress}d since progress · </>}last login {r.lastLoginDays == null ? '—' : r.lastLoginDays === 0 ? 'today' : `${r.lastLoginDays}d ago`}
                  </div>
                </div>
                {r.agent.email && <a href={`mailto:${r.agent.email}`} style={{ fontSize: 12, fontWeight: 700, color: C.gold, textDecoration: 'none', whiteSpace: 'nowrap' }}>Email →</a>}
              </AgentLine>
            )))}
        </TrackCard>

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
                      {members.some(m => m.agent.email) && (
                        <div style={{ marginTop: 16, borderTop: '1px solid #eef2f7', paddingTop: 14 }}>
                          {!showCompose ? (
                            <button onClick={() => setShowCompose(true)} style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
                              ✉ Email this group ({members.filter(m => m.agent.email).length})
                            </button>
                          ) : (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Email {members.filter(m => m.agent.email).length} agent{members.filter(m => m.agent.email).length === 1 ? '' : 's'}</div>
                              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject"
                                style={{ width: '100%', padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, marginBottom: 8 }} />
                              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={8}
                                style={{ width: '100%', padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
                              <div style={{ fontSize: 11, color: C.muted, margin: '4px 0 10px' }}>Personalize with {'{{firstName}}'}, {'{{lastName}}'}, {'{{agentCode}}'}. Sends from operations@allfinancialfreedom.com.</div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => sendCohortEmail(g.key, true)} disabled={emailBusy}
                                  style={{ flex: 1, background: '#eef2f7', color: C.ink, border: 'none', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: 12.5, cursor: emailBusy ? 'wait' : 'pointer' }}>Preview</button>
                                <button onClick={() => { if (window.confirm(`Send this email to ${members.filter(m => m.agent.email).length} agents?`)) sendCohortEmail(g.key, false) }} disabled={emailBusy}
                                  style={{ flex: 1, background: C.gold, color: '#1a1a1a', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 800, fontSize: 12.5, cursor: emailBusy ? 'wait' : 'pointer' }}>{emailBusy ? 'Sending…' : 'Send'}</button>
                              </div>
                              {emailResult && <div style={{ marginTop: 8, fontSize: 12.5, color: C.navy, fontWeight: 600 }}>{emailResult}</div>}
                            </>
                          )}
                        </div>
                      )}
                      {g.training && members.some(m => m.agent.email) && (
                        <div style={{ marginTop: 12, borderTop: '1px solid #eef2f7', paddingTop: 12 }}>
                          {!showSchedule ? (
                            <button onClick={() => setShowSchedule(true)} style={{ background: '#fff', color: C.navy, border: `1px solid ${C.navy}`, borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
                              ▶ Schedule &ldquo;{g.training}&rdquo; (auto-Zoom)
                            </button>
                          ) : (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Schedule {g.training}</div>
                              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ flex: 1, minWidth: 170, padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12.5 }} />
                                <select value={scheduleDuration} onChange={e => setScheduleDuration(Number(e.target.value))} style={{ padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12.5 }}>
                                  <option value={30}>30 min</option><option value={60}>60 min</option><option value={90}>90 min</option>
                                </select>
                              </div>
                              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Creates a Zoom (Eastern) and emails the link to the group.</div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => scheduleTraining(g.key, true)} disabled={scheduleBusy} style={{ flex: 1, background: '#eef2f7', color: C.ink, border: 'none', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Preview</button>
                                <button onClick={() => { if (scheduleTime && window.confirm(`Create a Zoom and email ${members.filter(m => m.agent.email).length} agents?`)) scheduleTraining(g.key, false) }} disabled={scheduleBusy || !scheduleTime} style={{ flex: 1, background: C.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 800, fontSize: 12.5, cursor: scheduleBusy ? 'wait' : 'pointer', opacity: scheduleTime ? 1 : 0.6 }}>{scheduleBusy ? 'Working…' : 'Create & email'}</button>
                              </div>
                              {scheduleResult && <div style={{ marginTop: 8, fontSize: 12.5, color: C.navy, fontWeight: 600 }}>{scheduleResult}</div>}
                              {scheduleLink && <div style={{ marginTop: 4, fontSize: 12 }}><a href={scheduleLink} style={{ color: C.gold, fontWeight: 700, textDecoration: 'none' }}>Zoom link →</a></div>}
                            </>
                          )}
                        </div>
                      )}
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
