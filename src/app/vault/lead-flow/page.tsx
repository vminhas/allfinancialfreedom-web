'use client'

import { useState, useEffect, useCallback } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface FlowSource { id: string; label: string; color: string; dbValues: string[] }
interface FlowStage { id: string; label: string; color: string; dbValues: string[] }
interface FlowExit { id: string; label: string; color: string; fromStages: string[]; dbValues: string[] }
interface FlowConfig { sources: FlowSource[]; stages: FlowStage[]; exits: FlowExit[] }
interface CalendarCount { name: string; count: number }
interface AssignmentCount { name: string; count: number }

interface FlowData {
  config: FlowConfig
  stageCounts: Record<string, number>
  sourceCounts: Record<string, number>
  calendars: CalendarCount[]
  assignments: AssignmentCount[]
}

const PRESET_COLORS = [
  '#60a5fa', '#a78bfa', '#f472b6', '#4ade80', '#C9A96E', '#94a3b8',
  '#f59e0b', '#22d3ee', '#fb923c', '#f87171', '#818cf8', '#34d399',
]

export default function LeadFlowPage() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<FlowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editConfig, setEditConfig] = useState<FlowConfig | null>(null)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/lead-flow')
      .then(r => r.json())
      .then((d: FlowData) => {
        setData(d)
        setEditConfig(JSON.parse(JSON.stringify(d.config)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) return <div style={{ padding: 32, color: '#6B8299' }}>Loading lead flow...</div>
  if (!data) return <div style={{ padding: 32, color: '#f87171' }}>Failed to load lead flow data.</div>

  const config = editing && editConfig ? editConfig : data.config
  const maxStageCount = Math.max(...config.stages.map(s => data.stageCounts[s.id] ?? 0), 1)

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

  const cancelEdit = () => {
    setEditing(false)
    setEditConfig(JSON.parse(JSON.stringify(data.config)))
  }

  // --- Edit helpers ---
  const updateSource = (id: string, field: string, value: string | string[]) => {
    setEditConfig(prev => prev ? {
      ...prev,
      sources: prev.sources.map(s => s.id === id ? { ...s, [field]: value } : s),
    } : prev)
  }
  const addSource = () => {
    setEditConfig(prev => prev ? {
      ...prev,
      sources: [...prev.sources, { id: `src-${Date.now()}`, label: 'New Source', color: '#94a3b8', dbValues: [] }],
    } : prev)
  }
  const removeSource = (id: string) => {
    setEditConfig(prev => prev ? {
      ...prev,
      sources: prev.sources.filter(s => s.id !== id),
    } : prev)
  }
  const updateStage = (id: string, field: string, value: string) => {
    setEditConfig(prev => prev ? {
      ...prev,
      stages: prev.stages.map(s => s.id === id ? { ...s, [field]: value } : s),
    } : prev)
  }
  const updateExit = (id: string, field: string, value: string) => {
    setEditConfig(prev => prev ? {
      ...prev,
      exits: prev.exits.map(e => e.id === id ? { ...e, [field]: value } : e),
    } : prev)
  }
  const addExit = () => {
    setEditConfig(prev => prev ? {
      ...prev,
      exits: [...prev.exits, { id: `exit-${Date.now()}`, label: 'New Exit', color: '#6b7280', fromStages: [], dbValues: [] }],
    } : prev)
  }
  const removeExit = (id: string) => {
    setEditConfig(prev => prev ? {
      ...prev,
      exits: prev.exits.filter(e => e.id !== id),
    } : prev)
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,169,110,0.25)',
    borderRadius: 4, padding: '3px 6px', color: '#ffffff', outline: 'none',
    fontSize: 11, width: '100%',
  }

  return (
    <div style={{ padding: isMobile ? 16 : '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: 0 }}>Lead Flow Diagram</h1>
          <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
            Visualize where leads come from and how they convert into active agents.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button onClick={cancelEdit} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#9BB0C4', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.3)',
                color: '#C9A96E', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
              }}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#6B8299', cursor: 'pointer',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -1 }}>
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
                </svg>
                Edit
              </button>
              <button onClick={loadData} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#6B8299', cursor: 'pointer',
              }}>Refresh</button>
            </>
          )}
        </div>
      </div>

      {/* ── LEAD SOURCES ── */}
      <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: isMobile ? 14 : 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>
          Inbound Lead Sources
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {config.sources.map(src => {
            const count = data.sourceCounts[src.id] ?? 0
            return (
              <div key={src.id} style={{
                flex: isMobile ? '1 1 calc(50% - 5px)' : '1 1 0',
                minWidth: isMobile ? 0 : 100, maxWidth: 200,
                background: `${src.color}0D`, border: `1px solid ${src.color}35`,
                borderRadius: 8, padding: '12px 14px', position: 'relative',
              }}>
                {editing && (
                  <button onClick={() => removeSource(src.id)} style={{
                    position: 'absolute', top: 4, right: 6, background: 'none',
                    border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
                  }}>x</button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: src.color, flexShrink: 0 }} />
                  {editing ? (
                    <input value={src.label} onChange={e => updateSource(src.id, 'label', e.target.value)}
                      style={{ ...inputStyle, fontWeight: 600 }} />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#ffffff' }}>{src.label}</span>
                  )}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: src.color, lineHeight: 1 }}>
                  {count.toLocaleString()}
                </div>
                {editing && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 8, color: '#6B8299', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Tracks values
                    </div>
                    <input
                      value={src.dbValues.join(', ')}
                      onChange={e => updateSource(src.id, 'dbValues', e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
                      style={{ ...inputStyle, fontSize: 9 }}
                      placeholder="e.g. prophog, manual"
                    />
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => updateSource(src.id, 'color', c)} style={{
                          width: 14, height: 14, borderRadius: '50%', background: c, padding: 0,
                          border: c === src.color ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                          cursor: 'pointer',
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
              flex: isMobile ? '1 1 calc(50% - 5px)' : '0 0 auto', minWidth: 100,
              background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(201,169,110,0.2)',
              borderRadius: 8, padding: '12px 14px', color: '#6B8299', fontSize: 12,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>+ Add Source</button>
          )}
        </div>
      </div>

      {/* Connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 0' }}>
        <div style={{ width: 2, height: 16, background: 'linear-gradient(to bottom, rgba(201,169,110,0.25), rgba(201,169,110,0.08))' }} />
        <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid rgba(201,169,110,0.2)' }} />
      </div>

      {/* ── PIPELINE FLOW ── */}
      <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: isMobile ? 14 : 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>
          Pipeline Flow
        </div>
        {config.stages.map((stage, i) => {
          const count = data.stageCounts[stage.id] ?? 0
          const barWidth = Math.max(3, (count / maxStageCount) * 100)
          const exits = config.exits.filter(e => e.fromStages.includes(stage.id))
          const isLast = i === config.stages.length - 1
          const isTerminal = stage.id === 'active-agent'

          return (
            <div key={stage.id}>
              {/* Stage row */}
              <div style={{
                display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile && exits.length > 0 ? 'column' : 'row',
                gap: isMobile ? 4 : 8,
              }}>
                {/* Stage bar */}
                <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <div style={{
                      width: isMobile ? 105 : 150, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{
                        width: isTerminal ? 10 : 8, height: isTerminal ? 10 : 8,
                        borderRadius: '50%', background: stage.color, flexShrink: 0,
                        boxShadow: isTerminal ? `0 0 8px ${stage.color}60` : 'none',
                      }} />
                      {editing ? (
                        <input value={stage.label} onChange={e => updateStage(stage.id, 'label', e.target.value)}
                          style={{ ...inputStyle, fontWeight: 500 }} />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: isTerminal ? 700 : 500, color: isTerminal ? stage.color : '#9BB0C4' }}>
                          {stage.label}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${barWidth}%`,
                          background: `linear-gradient(90deg, ${stage.color}, ${stage.color}60)`,
                          borderRadius: 4, transition: 'width 0.5s',
                          display: 'flex', alignItems: 'center', paddingLeft: 8,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                            {count.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exit branches */}
                {exits.length > 0 && !editing && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                    ...(isMobile ? { paddingLeft: 20, marginBottom: 4 } : {}),
                  }}>
                    <svg width="20" height="12" viewBox="0 0 20 12" style={{ flexShrink: 0, opacity: 0.4 }}>
                      <path d="M0 6 L14 6 L11 3 M14 6 L11 9" stroke="#f87171" strokeWidth="1.5" fill="none" />
                    </svg>
                    {exits.map(exit => {
                      const exitCount = data.stageCounts[exit.id] ?? 0
                      return (
                        <div key={exit.id} style={{
                          padding: '3px 8px', borderRadius: 4,
                          background: `${exit.color}0D`, border: `1px solid ${exit.color}25`,
                          fontSize: 9, color: exit.color, whiteSpace: 'nowrap',
                          fontWeight: 600,
                        }}>
                          {exit.label} {exitCount > 0 && <span style={{ opacity: 0.7 }}>({exitCount})</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Connector to next stage */}
              {!isLast && (
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: isMobile ? 50 : 70 }}>
                  <div style={{
                    width: 2, height: 10,
                    background: 'rgba(201,169,110,0.12)',
                  }} />
                </div>
              )}
            </div>
          )
        })}

        {/* Edit exits section */}
        {editing && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(201,169,110,0.1)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f87171', marginBottom: 10 }}>
              Exit Points
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {editConfig?.exits.map(exit => (
                <div key={exit.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', background: `${exit.color}08`, border: `1px solid ${exit.color}20`,
                  borderRadius: 6,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: exit.color, flexShrink: 0 }} />
                  <input value={exit.label} onChange={e => updateExit(exit.id, 'label', e.target.value)}
                    style={{ ...inputStyle, maxWidth: 140 }} />
                  <div style={{ fontSize: 8, color: '#6B8299', flexShrink: 0 }}>from:</div>
                  <select
                    multiple
                    value={exit.fromStages}
                    onChange={e => {
                      const selected = Array.from(e.target.selectedOptions).map(o => o.value)
                      setEditConfig(prev => prev ? {
                        ...prev,
                        exits: prev.exits.map(ex => ex.id === exit.id ? { ...ex, fromStages: selected } : ex),
                      } : prev)
                    }}
                    style={{
                      ...inputStyle, maxWidth: 200, fontSize: 9, height: 50,
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    {editConfig?.stages.map(s => (
                      <option key={s.id} value={s.id} style={{ background: '#0A1628', color: '#9BB0C4' }}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => removeExit(exit.id)} style={{
                    background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: 4,
                  }}>x</button>
                </div>
              ))}
              <button onClick={addExit} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11,
                background: 'rgba(248,113,113,0.05)', border: '1px dashed rgba(248,113,113,0.2)',
                color: '#f87171', cursor: 'pointer', width: 'fit-content',
              }}>+ Add Exit Point</button>
            </div>
          </div>
        )}
      </div>

      {/* ── CALENDAR + ASSIGNMENT CHARTS ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 12, marginTop: 12,
      }}>
        {/* Calendar Breakdown */}
        <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Calendar Bookings
          </div>
          <p style={{ fontSize: 10, color: '#4B5563', margin: '0 0 10px' }}>
            Which calendars leads are booking on — shows their entry point.
          </p>
          {data.calendars.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: 11 }}>No calendar booking data yet. Bookings will appear here as appointments come in via GHL webhooks.</div>
          ) : data.calendars.slice(0, 10).map((cal, i) => {
            const maxCal = Math.max(...data.calendars.map(c => c.count), 1)
            const w = Math.max(5, (cal.count / maxCal) * 100)
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                  <span style={{
                    color: '#9BB0C4', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', maxWidth: '75%',
                  }}>{cal.name}</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>{cal.count}</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${w}%`, background: 'linear-gradient(90deg, #f59e0b, #f59e0b80)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Assignment Distribution */}
        <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Assigned To
          </div>
          <p style={{ fontSize: 10, color: '#4B5563', margin: '0 0 10px' }}>
            Who leads are assigned to based on calendar bookings.
          </p>
          {data.assignments.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: 11 }}>No assignment data yet. Assignments populate from calendar bookings.</div>
          ) : data.assignments.slice(0, 10).map((a, i) => {
            const maxA = Math.max(...data.assignments.map(x => x.count), 1)
            const w = Math.max(5, (a.count / maxA) * 100)
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: '#9BB0C4' }}>{a.name || 'Unassigned'}</span>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>{a.count}</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${w}%`, background: 'linear-gradient(90deg, #a78bfa, #a78bfa80)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── LEGEND / NOTES ── */}
      <div style={{
        marginTop: 12, padding: '14px 20px',
        background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8,
        fontSize: 10, color: '#4B5563', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#6B8299' }}>How this works:</strong> Lead sources show where contacts enter the system.
        The pipeline tracks their journey from first contact to becoming an active agent ($199 + ICA).
        Exit points branch off at key stages — no-shows can reschedule, not-qualified or not-interested exit the funnel.
        Calendar and assignment data comes from GHL appointment webhooks.
        {editing && (
          <span style={{ color: '#C9A96E', display: 'block', marginTop: 6 }}>
            Editing tip: Changes to stage names only affect this diagram. Update GHL pipeline stage names separately to match.
            &quot;Tracks values&quot; maps which Contact.source database values count toward each source.
          </span>
        )}
      </div>
    </div>
  )
}
