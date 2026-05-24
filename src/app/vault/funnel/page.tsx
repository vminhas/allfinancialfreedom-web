'use client'

import { useState, useEffect } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

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

const STAGE_COLORS: Record<string, string> = {
  'New Lead': '#6B8299',
  'Contacted': '#60a5fa',
  'Engaged': '#a78bfa',
  'Discovery Booked': '#f59e0b',
  'Discovery Completed': '#4ade80',
  'Qualified': '#22d3ee',
  'Interview Booked': '#38bdf8',
  'Interview Completed': '#818cf8',
  'Onboarding': '#C9A96E',
  'Active Agent': '#22c55e',
  'No-Show': '#f87171',
  'Rescheduled': '#fbbf24',
  'Not Qualified': '#fb923c',
  'Not Interested': '#6b7280',
}

const FUNNEL_STAGES = ['New Lead', 'Contacted', 'Engaged', 'Discovery Booked', 'Discovery Completed', 'Qualified', 'Interview Booked', 'Interview Completed', 'Onboarding', 'Active Agent']

interface StageContact {
  id: string; firstName: string; lastName: string; email: string
  phone: string | null; source: string; ghlPipelineStage: string | null
  outreachStatus: string | null; ghlAppointmentDate: string | null
  assignedTo: string | null; createdAt: string
}

const NEXT_STAGE: Record<string, string> = {
  'New Lead': 'Contacted',
  'Contacted': 'Engaged',
  'Engaged': 'Discovery Booked',
  'Discovery Booked': 'Discovery Completed',
  'Discovery Completed': 'Qualified',
  'Qualified': 'Interview Booked',
  'Interview Booked': 'Interview Completed',
  'Interview Completed': 'Onboarding',
  'Onboarding': 'Active Agent',
}

export default function FunnelPage() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStage, setSelectedStage] = useState<string | null>(null)
  const [stageContacts, setStageContacts] = useState<StageContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [advancing, setAdvancing] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/funnel-stats')
      .then(r => r.json())
      .then((d: FunnelData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 32, color: '#6B8299' }}>Loading funnel data...</div>
  if (!data) return <div style={{ padding: 32, color: '#f87171' }}>Failed to load funnel data.</div>

  const maxCount = Math.max(...FUNNEL_STAGES.map(s => data.stages.find(st => st.name === s)?.count ?? 0), 1)

  return (
    <div style={{ padding: isMobile ? 16 : '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: 0 }}>Recruiting Funnel</h1>
        <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
          Real-time pipeline from lead to onboarded agent. Syncs from GHL every 15 minutes.
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Contacts', value: data.totalContacts.toLocaleString(), color: '#9BB0C4' },
          { label: 'Converted (All Time)', value: String(data.totalConverted), color: '#4ade80' },
          { label: 'Converted This Month', value: String(data.convertedThisMonth), color: '#C9A96E' },
          { label: 'Appointments Today', value: String(data.appointmentsToday), color: '#60a5fa' },
          { label: 'No-Show Rate', value: `${data.noShowRate}%`, color: data.noShowRate > 30 ? '#f87171' : '#4ade80' },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: '#132238', border: '1px solid rgba(201,169,110,0.1)',
            borderRadius: 8, padding: '14px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Funnel Visualization */}
      <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: isMobile ? 16 : 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E' }}>
            Pipeline Funnel
          </div>
          <div style={{ fontSize: 9, color: '#4B5563' }}>Click any stage to see contacts</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FUNNEL_STAGES.map((stage) => {
            const count = data.stages.find(s => s.name === stage)?.count ?? 0
            const barWidth = maxCount > 0 ? Math.max(3, (count / maxCount) * 100) : 3
            const color = STAGE_COLORS[stage] ?? '#6B8299'
            const isSelected = selectedStage === stage

            return (
              <button
                key={stage}
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
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  background: isSelected ? 'rgba(201,169,110,0.06)' : 'transparent',
                  border: isSelected ? '1px solid rgba(201,169,110,0.2)' : '1px solid transparent',
                  borderRadius: 6, padding: '4px 8px 4px 0', textAlign: 'left',
                }}
              >
                <div style={{ width: isMobile ? 90 : 140, flexShrink: 0, fontSize: 11, color: isSelected ? '#C9A96E' : '#9BB0C4', textAlign: 'right', fontWeight: isSelected ? 600 : 400 }}>
                  {stage}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${barWidth}%`,
                      background: `linear-gradient(90deg, ${color}, ${color}80)`,
                      borderRadius: 4, transition: 'width 0.5s',
                      display: 'flex', alignItems: 'center', paddingLeft: 8,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                        {count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Contact drawer for selected stage */}
        {selectedStage && (
          <div style={{ marginTop: 16, borderTop: '1px solid rgba(201,169,110,0.1)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
                {stageContacts.map(c => {
                  const nextStage = NEXT_STAGE[selectedStage]
                  const isAdvancing = advancing === c.id
                  return (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
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
                          color: '#4ade80', fontSize: 10, textDecoration: 'none', flexShrink: 0,
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </a>
                      )}
                      {nextStage && (
                        <button
                          disabled={isAdvancing}
                          onClick={async () => {
                            setAdvancing(c.id)
                            const res = await fetch(`/api/admin/contacts/${c.id}/advance`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ stage: nextStage }),
                            })
                            if (res.ok) {
                              setStageContacts(prev => prev.filter(p => p.id !== c.id))
                              // Refresh funnel data
                              fetch('/api/admin/funnel-stats').then(r => r.json()).then(setData).catch(() => {})
                            }
                            setAdvancing(null)
                          }}
                          style={{
                            padding: '4px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                            background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)',
                            color: '#C9A96E', cursor: isAdvancing ? 'wait' : 'pointer',
                            flexShrink: 0, whiteSpace: 'nowrap',
                            opacity: isAdvancing ? 0.6 : 1,
                          }}
                        >
                          {isAdvancing ? '...' : `→ ${nextStage}`}
                        </button>
                      )}
                      {selectedStage !== 'Not Interested' && (
                        <button
                          onClick={async () => {
                            setAdvancing(c.id)
                            await fetch(`/api/admin/contacts/${c.id}/advance`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ stage: 'Not Interested' }),
                            })
                            setStageContacts(prev => prev.filter(p => p.id !== c.id))
                            fetch('/api/admin/funnel-stats').then(r => r.json()).then(setData).catch(() => {})
                            setAdvancing(null)
                          }}
                          style={{
                            padding: '4px 6px', borderRadius: 4, fontSize: 9,
                            background: 'transparent', border: '1px solid rgba(248,113,113,0.2)',
                            color: '#f87171', cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side-by-side: Other stages + Sources */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* Non-funnel stages */}
        <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Other Stages
          </div>
          {data.stages.filter(s => !FUNNEL_STAGES.includes(s.name) && s.count > 0).map(s => (
            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12 }}>
              <span style={{ color: STAGE_COLORS[s.name] ?? '#9BB0C4' }}>{s.name}</span>
              <span style={{ color: '#6B8299', fontWeight: 600 }}>{s.count.toLocaleString()}</span>
            </div>
          ))}
          {data.stages.filter(s => !FUNNEL_STAGES.includes(s.name) && s.count > 0).length === 0 && (
            <div style={{ color: '#4B5563', fontSize: 11 }}>No contacts in non-funnel stages</div>
          )}
        </div>

        {/* Lead Sources */}
        <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Lead Sources
          </div>
          {data.sources.slice(0, 10).map(s => (
            <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12 }}>
              <span style={{ color: '#9BB0C4' }}>{s.source || 'unknown'}</span>
              <span style={{ color: '#6B8299', fontWeight: 600 }}>{s.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Outreach Activity */}
      <div style={{ marginTop: 16, background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: '16px 20px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
          Outreach Activity
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <div>
            <span style={{ color: '#6B8299' }}>Emails sent today: </span>
            <span style={{ color: '#60a5fa', fontWeight: 700 }}>{data.emailsSentToday}</span>
          </div>
          <div>
            <span style={{ color: '#6B8299' }}>Emails sent this week: </span>
            <span style={{ color: '#60a5fa', fontWeight: 700 }}>{data.emailsSentThisWeek}</span>
          </div>
          <div>
            <span style={{ color: '#6B8299' }}>Appointments this week: </span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{data.appointmentsThisWeek}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
