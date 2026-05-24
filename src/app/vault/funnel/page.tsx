'use client'

import { useState, useEffect, useCallback } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

// ── Types ────────────────────────────────────────────────────────
interface FunnelStage { name: string; count: number }
interface SourceCount { source: string; count: number }
interface FunnelData {
  stages: FunnelStage[]
  sources: SourceCount[]
  totalContacts: number
  totalConverted: number
  convertedThisMonth: number
  appointmentsToday: number
  appointmentsThisWeek: number
  noShowRate: number
  emailsSentToday: number
  emailsSentThisWeek: number
}

interface FlowSource { id: string; label: string; color: string; dbValues: string[] }
interface FlowExit { id: string; label: string; color: string; fromStages: string[]; dbValues: string[] }
interface FlowConfig { sources: FlowSource[]; stages: { id: string; label: string; color: string; dbValues: string[] }[]; exits: FlowExit[] }
interface FlowData {
  config: FlowConfig
  stageCounts: Record<string, number>
  sourceCounts: Record<string, number>
  calendars: { name: string; count: number }[]
  assignments: { name: string; count: number }[]
}

interface StageContact {
  id: string; firstName: string; lastName: string; email: string
  phone: string | null; source: string; ghlPipelineStage: string | null
  outreachStatus: string | null; ghlAppointmentDate: string | null
  assignedTo: string | null; createdAt: string
}

// ── Constants ────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  'New Lead': '#6B8299', 'Contacted': '#60a5fa', 'Engaged': '#a78bfa',
  'Discovery Booked': '#f59e0b', 'Discovery Completed': '#4ade80',
  'Qualified': '#22d3ee', 'Interview Booked': '#38bdf8',
  'Interview Completed': '#818cf8', 'Onboarding': '#C9A96E',
  'Active Agent': '#22c55e', 'No-Show': '#f87171', 'Rescheduled': '#fbbf24',
  'Not Qualified': '#fb923c', 'Not Interested': '#6b7280',
}

const FUNNEL_STAGES = [
  'New Lead', 'Contacted', 'Engaged', 'Discovery Booked', 'Discovery Completed',
  'Qualified', 'Interview Booked', 'Interview Completed', 'Onboarding', 'Active Agent',
]

const NEXT_STAGE: Record<string, string> = {
  'New Lead': 'Contacted', 'Contacted': 'Engaged', 'Engaged': 'Discovery Booked',
  'Discovery Booked': 'Discovery Completed', 'Discovery Completed': 'Qualified',
  'Qualified': 'Interview Booked', 'Interview Booked': 'Interview Completed',
  'Interview Completed': 'Onboarding', 'Onboarding': 'Active Agent',
}

// Exit stages that branch off at specific pipeline stages
const EXIT_MAP: Record<string, { stage: string; label: string; color: string }[]> = {
  'Discovery Booked': [
    { stage: 'No-Show', label: 'No-Show', color: '#f87171' },
    { stage: 'Rescheduled', label: 'Rescheduled', color: '#fbbf24' },
  ],
  'Discovery Completed': [
    { stage: 'Not Qualified', label: 'Not Qualified', color: '#fb923c' },
  ],
  'Interview Booked': [
    { stage: 'No-Show', label: 'No-Show', color: '#f87171' },
  ],
  'Interview Completed': [
    { stage: 'Not Interested', label: 'Not Interested', color: '#6b7280' },
  ],
}

const PRESET_COLORS = [
  '#60a5fa', '#a78bfa', '#f472b6', '#4ade80', '#C9A96E', '#94a3b8',
  '#f59e0b', '#22d3ee', '#fb923c', '#f87171', '#818cf8', '#34d399',
]

// ── Component ────────────────────────────────────────────────────
export default function FunnelPage() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<FunnelData | null>(null)
  const [flow, setFlow] = useState<FlowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStage, setSelectedStage] = useState<string | null>(null)
  const [stageContacts, setStageContacts] = useState<StageContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [advancing, setAdvancing] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editConfig, setEditConfig] = useState<FlowConfig | null>(null)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/funnel-stats').then(r => r.json()),
      fetch('/api/admin/lead-flow').then(r => r.json()),
    ])
      .then(([funnelData, flowData]: [FunnelData, FlowData]) => {
        setData(funnelData)
        setFlow(flowData)
        setEditConfig(JSON.parse(JSON.stringify(flowData.config)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) return <div style={{ padding: 32, color: '#6B8299' }}>Loading funnel...</div>
  if (!data || !flow) return <div style={{ padding: 32, color: '#f87171' }}>Failed to load funnel data.</div>

  const maxCount = Math.max(...FUNNEL_STAGES.map(s => data.stages.find(st => st.name === s)?.count ?? 0), 1)
  const config = editing && editConfig ? editConfig : flow.config

  const handleSave = async () => {
    if (!editConfig) return
    setSaving(true)
    await fetch('/api/admin/lead-flow', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: editConfig }),
    })
    setSaving(false)
    setEditing(false)
    loadData()
  }

  const cancelEdit = () => { setEditing(false); setEditConfig(JSON.parse(JSON.stringify(flow.config))) }

  // Edit helpers
  const updateSource = (id: string, field: string, value: string | string[]) => {
    setEditConfig(prev => prev ? {
      ...prev, sources: prev.sources.map(s => s.id === id ? { ...s, [field]: value } : s),
    } : prev)
  }
  const addSource = () => {
    setEditConfig(prev => prev ? {
      ...prev, sources: [...prev.sources, { id: `src-${Date.now()}`, label: 'New Source', color: '#94a3b8', dbValues: [] }],
    } : prev)
  }
  const removeSource = (id: string) => {
    setEditConfig(prev => prev ? { ...prev, sources: prev.sources.filter(s => s.id !== id) } : prev)
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,169,110,0.25)',
    borderRadius: 4, padding: '3px 6px', color: '#ffffff', outline: 'none', fontSize: 11, width: '100%',
  }

  return (
    <div style={{ padding: isMobile ? 16 : '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: 0 }}>Recruiting Funnel</h1>
          <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
            Lead sources, pipeline stages, calendar bookings, and assignments. Syncs from GHL every 15 min.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button onClick={cancelEdit} style={{ ...btnStyle, color: '#9BB0C4' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                ...btnStyle, background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.3)',
                color: '#C9A96E', opacity: saving ? 0.6 : 1,
              }}>{saving ? 'Saving...' : 'Save'}</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={{ ...btnStyle, color: '#6B8299' }}>Edit Sources</button>
              <button onClick={loadData} style={{ ...btnStyle, color: '#6B8299' }}>Refresh</button>
            </>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Contacts', value: data.totalContacts.toLocaleString(), color: '#9BB0C4' },
          { label: 'Converted', value: String(data.totalConverted), color: '#4ade80' },
          { label: 'This Month', value: String(data.convertedThisMonth), color: '#C9A96E' },
          { label: 'Appts Today', value: String(data.appointmentsToday), color: '#60a5fa' },
          { label: 'No-Show Rate', value: `${data.noShowRate}%`, color: data.noShowRate > 30 ? '#f87171' : '#4ade80' },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: '#132238', border: '1px solid rgba(201,169,110,0.1)',
            borderRadius: 8, padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 3 }}>{kpi.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ── Lead Sources ── */}
      <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: isMobile ? 14 : 20, marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
          Inbound Lead Sources
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {config.sources.map(src => {
            const count = flow.sourceCounts[src.id] ?? 0
            return (
              <div key={src.id} style={{
                flex: isMobile ? '1 1 calc(50% - 4px)' : '1 1 0',
                minWidth: isMobile ? 0 : 90, maxWidth: 180,
                background: `${src.color}0D`, border: `1px solid ${src.color}35`,
                borderRadius: 8, padding: '10px 12px', position: 'relative',
              }}>
                {editing && (
                  <button onClick={() => removeSource(src.id)} style={{
                    position: 'absolute', top: 3, right: 5, background: 'none',
                    border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, padding: 0,
                  }}>x</button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: src.color, flexShrink: 0 }} />
                  {editing ? (
                    <input value={src.label} onChange={e => updateSource(src.id, 'label', e.target.value)} style={{ ...inputStyle, fontWeight: 600 }} />
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#ffffff' }}>{src.label}</span>
                  )}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: src.color, lineHeight: 1 }}>{count.toLocaleString()}</div>
                {editing && (
                  <div style={{ marginTop: 6 }}>
                    <input value={src.dbValues.join(', ')} onChange={e => updateSource(src.id, 'dbValues', e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
                      style={{ ...inputStyle, fontSize: 9 }} placeholder="Tracks: prophog, manual" />
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 4 }}>
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => updateSource(src.id, 'color', c)} style={{
                          width: 12, height: 12, borderRadius: '50%', background: c, padding: 0,
                          border: c === src.color ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                        }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {editing && (
            <button onClick={addSource} style={{
              flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto', minWidth: 90,
              background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(201,169,110,0.2)',
              borderRadius: 8, padding: '10px 12px', color: '#6B8299', fontSize: 11, cursor: 'pointer',
            }}>+ Add Source</button>
          )}
        </div>
      </div>

      {/* Connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 2, height: 14, background: 'linear-gradient(to bottom, rgba(201,169,110,0.25), rgba(201,169,110,0.08))' }} />
        <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '5px solid rgba(201,169,110,0.2)' }} />
      </div>

      {/* ── Pipeline Stages ── */}
      <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: isMobile ? 14 : 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E' }}>
            Pipeline Flow
          </div>
          <div style={{ fontSize: 9, color: '#4B5563' }}>Click any stage to see contacts</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FUNNEL_STAGES.map((stage, i) => {
            const count = data.stages.find(s => s.name === stage)?.count ?? 0
            const barWidth = maxCount > 0 ? Math.max(3, (count / maxCount) * 100) : 3
            const color = STAGE_COLORS[stage] ?? '#6B8299'
            const isSelected = selectedStage === stage
            const isTerminal = stage === 'Active Agent'
            const exits = EXIT_MAP[stage] ?? []
            const isLast = i === FUNNEL_STAGES.length - 1

            return (
              <div key={stage}>
                <div style={{
                  display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                  flexDirection: isMobile && exits.length > 0 ? 'column' : 'row', gap: isMobile ? 3 : 6,
                }}>
                  {/* Stage bar */}
                  <button
                    onClick={async () => {
                      if (selectedStage === stage) { setSelectedStage(null); return }
                      setSelectedStage(stage)
                      setContactsLoading(true)
                      const res = await fetch(`/api/admin/funnel-contacts?stage=${encodeURIComponent(stage)}`)
                      if (res.ok) {
                        const d = await res.json() as { contacts: StageContact[] }
                        setStageContacts(d.contacts ?? [])
                      }
                      setContactsLoading(false)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0, width: '100%',
                      background: isSelected ? 'rgba(201,169,110,0.06)' : 'transparent',
                      border: isSelected ? '1px solid rgba(201,169,110,0.2)' : '1px solid transparent',
                      borderRadius: 6, padding: '4px 8px 4px 0', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: isMobile ? 100 : 145, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{
                        width: isTerminal ? 9 : 7, height: isTerminal ? 9 : 7,
                        borderRadius: '50%', background: color, flexShrink: 0,
                        boxShadow: isTerminal ? `0 0 8px ${color}60` : 'none',
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: isSelected ? 600 : (isTerminal ? 700 : 400),
                        color: isSelected ? '#C9A96E' : (isTerminal ? color : '#9BB0C4'),
                        textAlign: 'right', flex: 1,
                      }}>{stage}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 26, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${barWidth}%`,
                          background: `linear-gradient(90deg, ${color}, ${color}60)`,
                          borderRadius: 4, transition: 'width 0.5s',
                          display: 'flex', alignItems: 'center', paddingLeft: 8,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                            {count.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Exit branches */}
                  {exits.length > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                      ...(isMobile ? { paddingLeft: 18, marginBottom: 2 } : {}),
                    }}>
                      <svg width="16" height="10" viewBox="0 0 16 10" style={{ flexShrink: 0, opacity: 0.35 }}>
                        <path d="M0 5 L11 5 L9 2.5 M11 5 L9 7.5" stroke="#f87171" strokeWidth="1.2" fill="none" />
                      </svg>
                      {exits.map(exit => {
                        const exitCount = data.stages.find(s => s.name === exit.stage)?.count ?? 0
                        return (
                          <div key={exit.stage} style={{
                            padding: '2px 7px', borderRadius: 4,
                            background: `${exit.color}0D`, border: `1px solid ${exit.color}25`,
                            fontSize: 8, color: exit.color, whiteSpace: 'nowrap', fontWeight: 600,
                          }}>
                            {exit.label} {exitCount > 0 && <span style={{ opacity: 0.7 }}>({exitCount})</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Connector */}
                {!isLast && (
                  <div style={{ display: 'flex', alignItems: 'center', paddingLeft: isMobile ? 47 : 68 }}>
                    <div style={{ width: 2, height: 6, background: 'rgba(201,169,110,0.1)' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Contact drawer ── */}
        {selectedStage && (
          <div style={{ marginTop: 14, borderTop: '1px solid rgba(201,169,110,0.1)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>
                {selectedStage} <span style={{ color: '#6B8299', fontWeight: 400 }}>({stageContacts.length} shown)</span>
              </div>
              <button onClick={() => setSelectedStage(null)} style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 11, cursor: 'pointer' }}>Close</button>
            </div>

            {contactsLoading ? (
              <div style={{ color: '#6B8299', fontSize: 11 }}>Loading...</div>
            ) : stageContacts.length === 0 ? (
              <div style={{ color: '#4B5563', fontSize: 11 }}>No contacts at this stage.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 400, overflowY: 'auto' }}>
                {stageContacts.map(c => {
                  const nextStage = NEXT_STAGE[selectedStage]
                  const isAdv = advancing === c.id
                  return (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      background: 'rgba(255,255,255,0.02)', borderRadius: 4,
                      border: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#ffffff' }}>
                          {c.firstName} {c.lastName}
                        </div>
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.email}
                          {c.phone && ` · ${c.phone}`}
                          {c.source && c.source !== 'unknown' && ` · ${c.source}`}
                        </div>
                      </div>
                      {c.phone && (
                        <a href={`sms:${c.phone.replace(/\D/g, '')}`} title="Text" style={{
                          width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                          color: '#4ade80', textDecoration: 'none', flexShrink: 0,
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </a>
                      )}
                      {nextStage && (
                        <button disabled={isAdv} onClick={async () => {
                          setAdvancing(c.id)
                          const res = await fetch(`/api/admin/contacts/${c.id}/advance`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ stage: nextStage }),
                          })
                          if (res.ok) {
                            setStageContacts(prev => prev.filter(p => p.id !== c.id))
                            loadData()
                          }
                          setAdvancing(null)
                        }} style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                          background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)',
                          color: '#C9A96E', cursor: isAdv ? 'wait' : 'pointer',
                          flexShrink: 0, whiteSpace: 'nowrap', opacity: isAdv ? 0.6 : 1,
                        }}>
                          {isAdv ? '...' : `→ ${nextStage}`}
                        </button>
                      )}
                      {selectedStage !== 'Not Interested' && (
                        <button onClick={async () => {
                          setAdvancing(c.id)
                          await fetch(`/api/admin/contacts/${c.id}/advance`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ stage: 'Not Interested' }),
                          })
                          setStageContacts(prev => prev.filter(p => p.id !== c.id))
                          loadData()
                          setAdvancing(null)
                        }} style={{
                          padding: '4px 6px', borderRadius: 4, fontSize: 9,
                          background: 'transparent', border: '1px solid rgba(248,113,113,0.2)',
                          color: '#f87171', cursor: 'pointer', flexShrink: 0,
                        }}>x</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Calendar + Assignment side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10 }}>
            Calendar Bookings
          </div>
          {flow.calendars.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: 11 }}>No calendar data yet.</div>
          ) : flow.calendars.slice(0, 8).map((cal, i) => {
            const maxCal = Math.max(...flow.calendars.map(c => c.count), 1)
            const w = Math.max(5, (cal.count / maxCal) * 100)
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                  <span style={{ color: '#9BB0C4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{cal.name}</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>{cal.count}</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${w}%`, background: 'linear-gradient(90deg, #f59e0b, #f59e0b80)', borderRadius: 3 }} />
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10 }}>
            Assigned To
          </div>
          {flow.assignments.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: 11 }}>No assignment data yet.</div>
          ) : flow.assignments.slice(0, 8).map((a, i) => {
            const maxA = Math.max(...flow.assignments.map(x => x.count), 1)
            const w = Math.max(5, (a.count / maxA) * 100)
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                  <span style={{ color: '#9BB0C4' }}>{a.name || 'Unassigned'}</span>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>{a.count}</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${w}%`, background: 'linear-gradient(90deg, #a78bfa, #a78bfa80)', borderRadius: 3 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Outreach Activity ── */}
      <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '14px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10 }}>
          Outreach Activity
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
          <div><span style={{ color: '#6B8299' }}>Emails today: </span><span style={{ color: '#60a5fa', fontWeight: 700 }}>{data.emailsSentToday}</span></div>
          <div><span style={{ color: '#6B8299' }}>This week: </span><span style={{ color: '#60a5fa', fontWeight: 700 }}>{data.emailsSentThisWeek}</span></div>
          <div><span style={{ color: '#6B8299' }}>Appts this week: </span><span style={{ color: '#f59e0b', fontWeight: 700 }}>{data.appointmentsThisWeek}</span></div>
        </div>
      </div>

      {/* ── How leads stay updated ── */}
      <div style={{
        marginTop: 12, padding: '12px 18px',
        background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8,
        fontSize: 10, color: '#4B5563', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#6B8299' }}>How leads move through the funnel:</strong>
        <br />
        <strong style={{ color: '#9BB0C4' }}>Automatic:</strong> PropHog emails set Contacted. Calendar bookings set Discovery/Interview Booked. Tevah sync + ICA approval set Active Agent.
        <br />
        <strong style={{ color: '#9BB0C4' }}>Manual:</strong> After calls, click the stage above to open contacts, then use the advance button to move them forward or mark Not Interested.
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
}
