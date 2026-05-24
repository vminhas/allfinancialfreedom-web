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
  'Responded': '#a78bfa',
  'Discovery Booked': '#f59e0b',
  'Discovery Completed': '#4ade80',
  'No-Show': '#f87171',
  'Qualified': '#C9A96E',
  'Ready to Onboard': '#4ade80',
  'Onboarded': '#22c55e',
  'Not Interested': '#4B5563',
}

const FUNNEL_STAGES = ['New Lead', 'Contacted', 'Responded', 'Discovery Booked', 'Discovery Completed', 'Qualified', 'Ready to Onboard', 'Onboarded']

export default function FunnelPage() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)

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
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 16 }}>
          Pipeline Funnel
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FUNNEL_STAGES.map((stage, i) => {
            const count = data.stages.find(s => s.name === stage)?.count ?? 0
            const prevCount = i > 0 ? (data.stages.find(s => s.name === FUNNEL_STAGES[i - 1])?.count ?? 0) : 0
            const convRate = i > 0 && prevCount > 0 ? Math.round((count / prevCount) * 100) : null
            const barWidth = maxCount > 0 ? Math.max(3, (count / maxCount) * 100) : 3
            const color = STAGE_COLORS[stage] ?? '#6B8299'

            return (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: isMobile ? 90 : 140, flexShrink: 0, fontSize: 11, color: '#9BB0C4', textAlign: 'right' }}>
                  {stage}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
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
                  {convRate !== null && (
                    <span style={{ fontSize: 9, color: convRate > 50 ? '#4ade80' : convRate > 20 ? '#f59e0b' : '#f87171', fontWeight: 700, flexShrink: 0, width: 35 }}>
                      {convRate}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
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
