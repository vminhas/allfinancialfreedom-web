'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { PHASE_LABELS, CARRIERS, getAtRiskStatus, PHASE_ITEMS } from '@/lib/agent-constants'

interface Agent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  state: string | null
  phase: number
  phaseStartedAt: string | null
  status: 'ACTIVE' | 'INACTIVE'
  goal: string | null
  cft: string | null
  email: string
  lastLoginAt: string | null
  icaDate: string | null
  phaseCompleted: number
  phaseTotal: number
  carriersAppointed: number
  carriersTotal: number
  milestoneCount: number
  createdAt: string
}

interface CarrierAppointment {
  carrier: string
  status: 'NOT_STARTED' | 'PENDING' | 'APPOINTED' | 'JIT'
  producerNumber: string | null
  appointedDate: string | null
}

interface DetailedAgent extends Agent {
  agentUser: { email: string; lastLoginAt: string | null; inviteToken: string | null }
  phaseItems: { phase: number; itemKey: string; completed: boolean; completedAt: string | null }[]
  carrierAppointments: CarrierAppointment[]
  milestones: { milestone: string; completedAt: string }[]
  _count: { businessPartners: number; policies: number; callLogs: number }
  dateOfBirth: string | null
  phone: string | null
  recruiterId: string | null
  ssn: string | null
  avatarUrl: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  zip: string | null
  country: string | null
  npn: string | null
  licenseNumber: string | null
  examDate: string | null
  dateSubmittedToGfi: string | null
  licenseProcess: string | null
  clientProduct: string | null
  initialPointOfContact: string | null
  welcomeLetterSentAt: string | null
  discordUserId: string | null
  notes: string | null
}

interface TrendPoint { month: string; label: string; newAgents: number; active: number }

interface DashStats {
  totalAgents: number
  activeAgents: number
  inactiveAgents: number
  phaseDistribution: { phase: number; count: number; activeCount: number }[]
  atRiskCount: number
  behindCount: number
  newThisMonth: number
  activeLoginsLast30d: number
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

const PHASE_COLORS: Record<number, string> = {
  1: '#6B8299', 2: '#9B6DFF', 3: '#C9A96E', 4: '#3b82f6', 5: '#4ade80',
}
const STATUS_COLORS = {
  'on-track': { color: '#4ade80', label: 'On Track', bg: 'rgba(74,222,128,0.12)' },
  'behind':   { color: '#f59e0b', label: 'Behind',   bg: 'rgba(245,158,11,0.12)' },
  'at-risk':  { color: '#f87171', label: 'At Risk',  bg: 'rgba(248,113,113,0.12)' },
}
const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  APPOINTED: '#4ade80', PENDING: '#f59e0b', JIT: '#9B6DFF', NOT_STARTED: '#6B8299',
}

export default function TrackerPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [phaseFilter, setPhaseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [atRiskOnly, setAtRiskOnly] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<DetailedAgent | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [stats, setStats] = useState<DashStats | null>(null)

  // Date range state
  type Preset = '3m' | '6m' | '12m' | 'ytd' | 'all' | 'custom'
  const [preset, setPreset] = useState<Preset>('12m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [trendData, setTrendData] = useState<TrendPoint[]>([])

  // Derive actual date range from preset
  function getDateRange(): { start: string; end: string } | null {
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    if (preset === 'all') return null
    if (preset === 'custom') {
      if (!customStart && !customEnd) return null
      return { start: customStart, end: customEnd || fmt(today) }
    }
    const end = fmt(today)
    if (preset === 'ytd') return { start: `${today.getFullYear()}-01-01`, end }
    const months = preset === '3m' ? 3 : preset === '6m' ? 6 : 12
    const start = new Date(today)
    start.setMonth(start.getMonth() - months)
    return { start: fmt(start), end }
  }

  const fetchTrends = useCallback(async () => {
    const range = getDateRange()
    const params = new URLSearchParams()
    if (range?.start) params.set('startDate', range.start)
    if (range?.end)   params.set('endDate', range.end)
    const res = await fetch(`/api/admin/trends?${params}`)
    if (res.ok) {
      const d = await res.json() as { months: TrendPoint[] }
      setTrendData(d.months)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd])

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const range = getDateRange()
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (phaseFilter) params.set('phase', phaseFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (range?.start) params.set('icaStart', range.start)
    if (range?.end)   params.set('icaEnd', range.end)
    const res = await fetch(`/api/admin/agents?${params}`)
    const data = await res.json() as { agents: Agent[]; total: number }
    setAgents(data.agents ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [page, phaseFilter, statusFilter])

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/admin/stats')
    if (res.ok) setStats(await res.json() as DashStats)
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchTrends() }, [fetchTrends])

  const openDrawer = async (id: string) => {
    setDrawerLoading(true)
    setSelectedAgent(null)
    const res = await fetch(`/api/admin/agents/${id}`)
    const data = await res.json() as DetailedAgent
    setSelectedAgent(data)
    setDrawerLoading(false)
  }

  const updateCarrier = async (carrier: string, status: string, producerNumber: string) => {
    if (!selectedAgent) return
    await fetch(`/api/admin/agents/${selectedAgent.id}/carriers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ carrier, status, producerNumber: producerNumber || null }]),
    })
    const res = await fetch(`/api/admin/agents/${selectedAgent.id}`)
    setSelectedAgent(await res.json() as DetailedAgent)
  }

  const advancePhase = async () => {
    if (!selectedAgent || selectedAgent.phase >= 5) return
    await fetch(`/api/admin/agents/${selectedAgent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: selectedAgent.phase + 1 }),
    })
    const res = await fetch(`/api/admin/agents/${selectedAgent.id}`)
    setSelectedAgent(await res.json() as DetailedAgent)
    fetchAgents()
    fetchStats()
  }

  const toggleStatus = async () => {
    if (!selectedAgent) return
    const newStatus = selectedAgent.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await fetch(`/api/admin/agents/${selectedAgent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const res = await fetch(`/api/admin/agents/${selectedAgent.id}`)
    setSelectedAgent(await res.json() as DetailedAgent)
    fetchAgents()
    fetchStats()
  }

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const deleteAgent = async () => {
    if (!selectedAgent) return
    await fetch(`/api/admin/agents/${selectedAgent.id}`, { method: 'DELETE' })
    setSelectedAgent(null)
    setDeleteConfirm(false)
    fetchAgents()
    fetchStats()
  }

  const sendInvite = async () => {
    if (!selectedAgent) return
    setInviteLoading(true)
    setInviteMsg('')
    const res = await fetch('/api/admin/agents/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentUserId: selectedAgent.agentUser ? (selectedAgent as unknown as { agentUserId?: string }).agentUserId : '' }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    setInviteMsg(data.ok ? 'Invite sent!' : (data.error ?? 'Failed'))
    setInviteLoading(false)
  }

  const displayedAgents = atRiskOnly
    ? agents.filter(a => {
        const s = getAtRiskStatus(a.phase, a.phaseStartedAt ? new Date(a.phaseStartedAt) : null, a.phaseCompleted, a.phaseTotal)
        return s !== 'on-track'
      })
    : agents

  // KPI card filter states
  const todayFmt = new Date().toISOString().split('T')[0]
  const thisMonthStart = (() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })()
  const activeAgentsFilterOn = statusFilter === 'active'
  const inactiveAgentsFilterOn = statusFilter === 'inactive'
  const newThisMonthFilterOn = preset === 'custom' && customStart === thisMonthStart

  const selectStyle = {
    background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)',
    borderRadius: 4, color: '#9BB0C4', padding: '7px 12px', fontSize: 12,
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{
        marginBottom: 28,
        padding: '28px 0 24px',
        borderBottom: '1px solid rgba(201,169,110,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
              All Financial Freedom
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              AFF Tracker
            </h1>
            <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
              {stats ? `${stats.activeAgents} active · ${stats.totalAgents} total agents` : 'Agent pipeline and progression'}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: '#C9A96E', color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: '10px 22px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(201,169,110,0.2)',
            }}
          >
            + Add Agent
          </button>
        </div>
      </div>

      {/* ── Dashboard Stats ── */}
      {stats && (
        <div style={{ marginBottom: 28 }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            {/* Active Agents */}
            <div
              onClick={() => { setStatusFilter(activeAgentsFilterOn ? '' : 'active'); setPage(1) }}
              style={{
                background: activeAgentsFilterOn ? 'rgba(74,222,128,0.08)' : '#142D48',
                border: `1px solid ${activeAgentsFilterOn ? 'rgba(74,222,128,0.3)' : 'rgba(201,169,110,0.08)'}`,
                borderRadius: 6, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>Active Agents</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#4ade80', lineHeight: 1, marginBottom: 4 }}>{stats.activeAgents}</div>
              <div style={{ fontSize: 11, color: activeAgentsFilterOn ? '#4ade80' : '#4B5563' }}>
                {activeAgentsFilterOn ? '✕ clear filter' : (
                  <span>
                    <span
                      onClick={e => { e.stopPropagation(); setStatusFilter(inactiveAgentsFilterOn ? '' : 'inactive'); setPage(1) }}
                      style={{ color: inactiveAgentsFilterOn ? '#f59e0b' : '#4B5563', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      {stats.inactiveAgents} inactive
                    </span>
                  </span>
                )}
              </div>
            </div>
            {/* At Risk */}
            <div
              onClick={() => { setAtRiskOnly(v => !v); setPage(1) }}
              style={{
                background: atRiskOnly ? 'rgba(248,113,113,0.1)' : '#142D48',
                border: `1px solid ${atRiskOnly ? 'rgba(248,113,113,0.3)' : 'rgba(201,169,110,0.08)'}`,
                borderRadius: 6, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>At Risk</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#f87171', lineHeight: 1, marginBottom: 4 }}>{stats.atRiskCount}</div>
              <div style={{ fontSize: 11, color: atRiskOnly ? '#f87171' : '#4B5563' }}>
                {atRiskOnly ? '✕ clear filter' : `${stats.behindCount} behind — click to filter`}
              </div>
            </div>
            {/* New This Month */}
            <div
              onClick={() => {
                if (newThisMonthFilterOn) {
                  setPreset('all'); setCustomStart(''); setCustomEnd('')
                } else {
                  setPreset('custom'); setCustomStart(thisMonthStart); setCustomEnd(todayFmt)
                }
                setPage(1)
              }}
              style={{
                background: newThisMonthFilterOn ? 'rgba(201,169,110,0.08)' : '#142D48',
                border: `1px solid ${newThisMonthFilterOn ? 'rgba(201,169,110,0.3)' : 'rgba(201,169,110,0.08)'}`,
                borderRadius: 6, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>New This Month</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#C9A96E', lineHeight: 1, marginBottom: 4 }}>{stats.newThisMonth}</div>
              <div style={{ fontSize: 11, color: newThisMonthFilterOn ? '#C9A96E' : '#4B5563' }}>
                {newThisMonthFilterOn ? '✕ clear filter' : 'by ICA date'}
              </div>
            </div>
            {/* Active Logins */}
            <div style={{ background: '#142D48', border: '1px solid rgba(201,169,110,0.08)', borderRadius: 6, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>Active Logins (30d)</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#9B6DFF', lineHeight: 1, marginBottom: 4 }}>{stats.activeLoginsLast30d}</div>
              <div style={{ fontSize: 11, color: '#4B5563' }}>portal activity</div>
            </div>
            {/* Total Pipeline */}
            <div style={{ background: '#142D48', border: '1px solid rgba(201,169,110,0.08)', borderRadius: 6, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>Total Pipeline</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#9BB0C4', lineHeight: 1, marginBottom: 4 }}>{stats.totalAgents}</div>
              <div style={{ fontSize: 11, color: '#4B5563' }}>all time</div>
            </div>
          </div>

          {/* Phase pipeline + trend chart side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 16 }}>
            {/* Phase pipeline */}
            <div style={{ background: '#142D48', border: '1px solid rgba(201,169,110,0.08)', borderRadius: 6, padding: '18px 24px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>
                Pipeline by Phase
              </div>
              {(() => {
                const maxCount = Math.max(...stats.phaseDistribution.map(p => p.count), 1)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stats.phaseDistribution.map(({ phase, count, activeCount }) => {
                      const barW = Math.max(Math.round((count / maxCount) * 100), count > 0 ? 4 : 1)
                      const isActive = phaseFilter === String(phase)
                      return (
                        <button
                          key={phase}
                          onClick={() => { setPhaseFilter(isActive ? '' : String(phase)); setPage(1); setAtRiskOnly(false) }}
                          style={{
                            display: 'grid', gridTemplateColumns: '20px 1fr 52px',
                            alignItems: 'center', gap: 8,
                            background: isActive ? `${PHASE_COLORS[phase]}14` : 'transparent',
                            border: `1px solid ${isActive ? `${PHASE_COLORS[phase]}40` : 'transparent'}`,
                            borderRadius: 4, padding: '6px 8px', cursor: 'pointer',
                            transition: 'all 0.15s', textAlign: 'left',
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                        >
                          {/* Phase badge */}
                          <span style={{ fontSize: 9, fontWeight: 700, color: PHASE_COLORS[phase], letterSpacing: '0.04em' }}>
                            P{phase}
                          </span>
                          {/* Bar + phase name stacked */}
                          <div>
                            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                              <div style={{ width: `${barW}%`, height: '100%', background: PHASE_COLORS[phase], borderRadius: 3, opacity: isActive ? 1 : 0.82, transition: 'width 0.4s ease' }} />
                            </div>
                            <div style={{ fontSize: 10, color: '#9BB0C4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {PHASE_LABELS[phase].title}
                            </div>
                          </div>
                          {/* Count */}
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: count > 0 ? '#ffffff' : '#4B5563', lineHeight: 1 }}>{count}</div>
                            {activeCount < count && count > 0 && (
                              <div style={{ fontSize: 9, color: '#9BB0C4', marginTop: 2 }}>{activeCount} active</div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Trend chart */}
            <div style={{ background: '#142D48', border: '1px solid rgba(201,169,110,0.08)', borderRadius: 6, padding: '18px 24px', display: 'flex', flexDirection: 'column' }}>
              {/* Header + date range presets */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
                    New Agents / Month
                  </div>
                  {trendData.length > 0 && (
                    <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                      {trendData.reduce((s, d) => s + d.newAgents, 0)} agents in period
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {(['3m', '6m', '12m', 'ytd', 'all'] as Preset[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setPreset(p)}
                      style={{
                        padding: '4px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                        background: preset === p ? '#C9A96E' : 'rgba(255,255,255,0.05)',
                        color: preset === p ? '#142D48' : '#6B8299',
                        transition: 'all 0.1s',
                      }}
                    >
                      {p === 'all' ? 'All' : p.toUpperCase()}
                    </button>
                  ))}
                  <button
                    onClick={() => setPreset('custom')}
                    style={{
                      padding: '4px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                      background: preset === 'custom' ? '#C9A96E' : 'rgba(255,255,255,0.05)',
                      color: preset === 'custom' ? '#142D48' : '#6B8299',
                    }}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Custom date inputs */}
              {preset === 'custom' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    style={{ background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '5px 10px', fontSize: 12 }}
                  />
                  <span style={{ color: '#4B5563', alignSelf: 'center', fontSize: 12 }}>→</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    style={{ background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '5px 10px', fontSize: 12 }}
                  />
                </div>
              )}

              {/* Area chart */}
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" style={{ flex: 1, minHeight: 80 }}>
                  <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#C9A96E" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#C9A96E" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#4B5563', fontSize: 9 }}
                      axisLine={false} tickLine={false}
                      interval={Math.max(0, Math.floor(trendData.length / 8) - 1)}
                    />
                    <YAxis
                      tick={{ fill: '#4B5563', fontSize: 9 }}
                      axisLine={false} tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)',
                        borderRadius: 4, fontSize: 11,
                      }}
                      labelStyle={{ color: '#C9A96E', fontWeight: 700, marginBottom: 4 }}
                      itemStyle={{ color: '#9BB0C4' }}
                      formatter={(val) => [val ?? 0, 'New agents']}
                    />
                    {trendData.length > 1 && (() => {
                      const avg = trendData.reduce((s, d) => s + d.newAgents, 0) / trendData.length
                      return <ReferenceLine y={avg} stroke="rgba(201,169,110,0.25)" strokeDasharray="4 4" label={{ value: `avg ${avg.toFixed(0)}`, fill: '#4B5563', fontSize: 9, position: 'right' }} />
                    })()}
                    <Area
                      type="monotone"
                      dataKey="newAgents"
                      stroke="#C9A96E"
                      strokeWidth={2}
                      fill="url(#goldGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#C9A96E', stroke: '#142D48', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ flex: 1, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 12, color: '#4B5563' }}>No data for selected period</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select style={selectStyle} value={phaseFilter} onChange={e => { setPhaseFilter(e.target.value); setPage(1) }}>
          <option value="">All Phases</option>
          {[1,2,3,4,5].map(n => (
            <option key={n} value={n}>Phase {n} — {PHASE_LABELS[n].title}</option>
          ))}
        </select>
        <select style={selectStyle} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: atRiskOnly ? '#f87171' : '#9BB0C4', cursor: 'pointer', padding: '7px 12px', background: atRiskOnly ? 'rgba(248,113,113,0.08)' : 'transparent', border: `1px solid ${atRiskOnly ? 'rgba(248,113,113,0.3)' : 'rgba(201,169,110,0.15)'}`, borderRadius: 4 }}>
          <input type="checkbox" checked={atRiskOnly} onChange={e => setAtRiskOnly(e.target.checked)} style={{ accentColor: '#f87171' }} />
          At-Risk Only
        </label>
        {/* Active date range indicator */}
        {preset !== 'all' && (
          <div style={{ fontSize: 11, color: '#C9A96E', padding: '7px 12px', background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.6 }}>ICA filter:</span>
            <span>{preset === 'custom' ? `${customStart || '…'} → ${customEnd || 'today'}` : preset.toUpperCase()}</span>
            <button onClick={() => setPreset('all')} style={{ background: 'none', border: 'none', color: '#6B8299', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}>✕</button>
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#4B5563' }}>
          {total} agents
        </div>
      </div>

      {/* ── Agent table ── */}
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.08)',
        borderRadius: 6, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(12,30,48,0.8)' }}>
              {['Agent', 'State', 'Phase', 'Progress', 'Days', 'Carriers', 'Trainer', 'Status', ''].map(h => (
                <th key={h} style={{
                  padding: '11px 16px', textAlign: 'left',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: '#C9A96E', borderBottom: '1px solid rgba(201,169,110,0.1)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  {[...Array(9)].map((_, j) => (
                    <td key={j} style={{ padding: '14px 16px' }}>
                      <div style={{ height: 11, background: 'rgba(255,255,255,0.04)', borderRadius: 4, width: `${40 + Math.random() * 40}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayedAgents.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '60px 16px', textAlign: 'center', color: '#6B8299', fontSize: 13 }}>
                  No agents found
                </td>
              </tr>
            ) : (
              displayedAgents.map(agent => {
                const riskStatus = getAtRiskStatus(
                  agent.phase,
                  agent.phaseStartedAt ? new Date(agent.phaseStartedAt) : null,
                  agent.phaseCompleted,
                  agent.phaseTotal
                )
                const daysInPhase = agent.phaseStartedAt
                  ? Math.floor((Date.now() - new Date(agent.phaseStartedAt).getTime()) / 86400000)
                  : null
                const phasePct = agent.phaseTotal > 0
                  ? Math.round((agent.phaseCompleted / agent.phaseTotal) * 100)
                  : 0

                return (
                  <tr
                    key={agent.id}
                    onClick={() => openDrawer(agent.id)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,169,110,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>
                        {agent.firstName} {agent.lastName}
                      </div>
                      <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2, letterSpacing: '0.05em' }}>{agent.agentCode}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#9BB0C4' }}>{agent.state ?? '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 4,
                        background: `${PHASE_COLORS[agent.phase]}18`,
                        border: `1px solid ${PHASE_COLORS[agent.phase]}33`,
                        color: PHASE_COLORS[agent.phase],
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {agent.phase}
                        <span style={{ fontSize: 9, opacity: 0.7 }}>{PHASE_LABELS[agent.phase]?.title.split(' ')[0]}</span>
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', minWidth: 110 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                          <div style={{
                            height: '100%', width: `${phasePct}%`,
                            background: PHASE_COLORS[agent.phase],
                            borderRadius: 2, transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#9BB0C4', flexShrink: 0 }}>{phasePct}%</span>
                      </div>
                      <div style={{ fontSize: 9, color: '#4B5563', marginTop: 3 }}>
                        {agent.phaseCompleted}/{agent.phaseTotal}
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: daysInPhase != null && daysInPhase > 60 ? '#f59e0b' : '#9BB0C4' }}>
                      {daysInPhase != null ? `${daysInPhase}d` : '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 12, color: agent.carriersAppointed > 0 ? '#4ade80' : '#6B8299' }}>
                        {agent.carriersAppointed}
                      </span>
                      <span style={{ fontSize: 10, color: '#4B5563' }}>/{agent.carriersTotal}</span>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#9BB0C4' }}>{agent.cft ?? '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px', borderRadius: 4,
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: STATUS_COLORS[riskStatus].color,
                        background: STATUS_COLORS[riskStatus].bg,
                      }}>
                        {STATUS_COLORS[riskStatus].label}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#C9A96E', fontSize: 18, opacity: 0.6 }}>›</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20 }}>
          {[...Array(Math.ceil(total / 50))].map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              style={{
                width: 32, height: 32, borderRadius: 4,
                background: page === i + 1 ? '#C9A96E' : 'transparent',
                color: page === i + 1 ? '#142D48' : '#6B8299',
                border: `1px solid ${page === i + 1 ? '#C9A96E' : 'rgba(201,169,110,0.2)'}`,
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* ── Agent detail drawer ── */}
      {(drawerLoading || selectedAgent) && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', justifyContent: 'flex-end',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setSelectedAgent(null); setInviteMsg('') } }}
        >
          <div style={{
            width: 540, height: '100%', overflow: 'auto',
            background: '#0C1E30',
            borderLeft: '1px solid rgba(201,169,110,0.15)',
            padding: 32,
          }}>
            {drawerLoading ? (
              <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
            ) : selectedAgent ? (
              <AgentDrawer
                agent={selectedAgent}
                onAdvancePhase={advancePhase}
                onUpdateCarrier={updateCarrier}
                onSendInvite={sendInvite}
                onToggleStatus={toggleStatus}
                onDelete={deleteAgent}
                deleteConfirm={deleteConfirm}
                onDeleteConfirmChange={setDeleteConfirm}
                inviteLoading={inviteLoading}
                inviteMsg={inviteMsg}
                onClose={() => { setSelectedAgent(null); setInviteMsg(''); setDeleteConfirm(false) }}
              />
            ) : null}
          </div>
        </div>
      )}

      {/* ── Add Agent modal ── */}
      {showAddModal && (
        <AddAgentModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); fetchAgents(); fetchStats() }}
        />
      )}
    </div>
  )
}

// ─── Agent Drawer ──────────────────────────────────────────────────────────────

function AgentDrawer({
  agent,
  onAdvancePhase,
  onUpdateCarrier,
  onSendInvite,
  onToggleStatus,
  onDelete,
  deleteConfirm,
  onDeleteConfirmChange,
  inviteLoading,
  inviteMsg,
  onClose,
}: {
  agent: DetailedAgent
  onAdvancePhase: () => void
  onUpdateCarrier: (carrier: string, status: string, producerNumber: string) => void
  onSendInvite: () => void
  onToggleStatus: () => void
  onDelete: () => void
  deleteConfirm: boolean
  onDeleteConfirmChange: (v: boolean) => void
  inviteLoading: boolean
  inviteMsg: string
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'progress' | 'carriers' | 'info' | 'edit'>('progress')
  const [editingCarrier, setEditingCarrier] = useState<string | null>(null)
  const [carrierStatus, setCarrierStatus] = useState('')
  const [carrierPN, setCarrierPN] = useState('')

  // Edit tab state
  const [editForm, setEditForm] = useState({
    firstName: agent.firstName,
    lastName: agent.lastName,
    phone: agent.phone ?? '',
    state: agent.state ?? '',
    dateOfBirth: agent.dateOfBirth ? agent.dateOfBirth.split('T')[0] : '',
    npn: agent.npn ?? '',
    licenseNumber: agent.licenseNumber ?? '',
    icaDate: agent.icaDate ? agent.icaDate.split('T')[0] : '',
    cft: agent.cft ?? '',
    goal: agent.goal ?? '',
    recruiterId: agent.recruiterId ?? '',
    discordUserId: agent.discordUserId ?? '',
    addressLine1: agent.addressLine1 ?? '',
    addressLine2: agent.addressLine2 ?? '',
    city: agent.city ?? '',
    zip: agent.zip ?? '',
    notes: agent.notes ?? '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editSaved, setEditSaved] = useState(false)
  const [editError, setEditError] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(agent.avatarUrl)

  const uploadAdminAvatar = async (file: File) => {
    setAvatarUploading(true)
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await fetch(`/api/admin/agents/${agent.id}/avatar`, { method: 'POST', body: fd })
    const d = await res.json() as { ok?: boolean; avatarUrl?: string; error?: string }
    if (res.ok && d.avatarUrl) setAvatarPreview(d.avatarUrl)
    setAvatarUploading(false)
  }

  const saveEdit = async () => {
    setEditSaving(true); setEditError(''); setEditSaved(false)
    const res = await fetch(`/api/admin/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        phone: editForm.phone || null,
        state: editForm.state || null,
        dateOfBirth: editForm.dateOfBirth || null,
        npn: editForm.npn || null,
        licenseNumber: editForm.licenseNumber || null,
        icaDate: editForm.icaDate || null,
        cft: editForm.cft || null,
        goal: editForm.goal || null,
        recruiterId: editForm.recruiterId || null,
        discordUserId: editForm.discordUserId || null,
        addressLine1: editForm.addressLine1 || null,
        addressLine2: editForm.addressLine2 || null,
        city: editForm.city || null,
        zip: editForm.zip || null,
        notes: editForm.notes || null,
      }),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      setEditError(d.error ?? 'Save failed')
    } else {
      setEditSaved(true)
      setTimeout(() => setEditSaved(false), 3000)
    }
    setEditSaving(false)
  }

  const riskStatus = getAtRiskStatus(
    agent.phase,
    agent.phaseStartedAt ? new Date(agent.phaseStartedAt) : null,
    agent.phaseItems.filter(i => i.phase === agent.phase && i.completed).length,
    PHASE_ITEMS[agent.phase]?.length ?? 0
  )

  const phasePct = PHASE_ITEMS[agent.phase]?.length
    ? Math.round((agent.phaseItems.filter(i => i.phase === agent.phase && i.completed).length / (PHASE_ITEMS[agent.phase]?.length ?? 1)) * 100)
    : 0

  const sLabel = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
    textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 12,
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: agent.avatarUrl ? 'transparent' : 'rgba(201,169,110,0.1)',
            border: '2px solid rgba(201,169,110,0.2)',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {agent.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agent.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 16, color: '#C9A96E', fontWeight: 600 }}>
                {agent.firstName.charAt(0)}{agent.lastName.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#ffffff', letterSpacing: '-0.01em' }}>
              {agent.firstName} {agent.lastName}
            </div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4 }}>
              {agent.agentCode} · {agent.state ?? 'No state'} · {agent.email}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9BB0C4', fontSize: 14, cursor: 'pointer', width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ✕
        </button>
      </div>

      {/* Phase + status + advance */}
      <div style={{
        background: 'rgba(201,169,110,0.04)',
        border: '1px solid rgba(201,169,110,0.12)',
        borderRadius: 6, padding: '16px 18px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
              background: `${PHASE_COLORS[agent.phase]}20`,
              border: `1px solid ${PHASE_COLORS[agent.phase]}44`,
              color: PHASE_COLORS[agent.phase],
            }}>
              Phase {agent.phase} — {PHASE_LABELS[agent.phase]?.title}
            </span>
            <span style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: STATUS_COLORS[riskStatus].color,
              background: STATUS_COLORS[riskStatus].bg,
            }}>
              {STATUS_COLORS[riskStatus].label}
            </span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: PHASE_COLORS[agent.phase] }}>
            {phasePct}%
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${phasePct}%`, background: PHASE_COLORS[agent.phase], borderRadius: 2, transition: 'width 0.5s' }} />
        </div>
        {agent.phase < 5 && (
          <button
            onClick={onAdvancePhase}
            style={{
              marginTop: 12, width: '100%',
              background: 'transparent',
              border: '1px solid rgba(201,169,110,0.3)',
              color: '#C9A96E', borderRadius: 4,
              padding: '8px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,169,110,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Advance to Phase {agent.phase + 1} →
          </button>
        )}
      </div>

      {/* Invite */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={onSendInvite}
          disabled={inviteLoading}
          style={{
            background: 'transparent',
            border: '1px solid rgba(201,169,110,0.2)',
            color: '#C9A96E', borderRadius: 4,
            padding: '7px 14px', fontSize: 11, fontWeight: 700,
            cursor: inviteLoading ? 'not-allowed' : 'pointer',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          {inviteLoading ? 'Sending...' : 'Send Portal Invite'}
        </button>
        {inviteMsg && (
          <span style={{ fontSize: 12, color: inviteMsg === 'Invite sent!' ? '#4ade80' : '#f87171' }}>
            {inviteMsg}
          </span>
        )}
      </div>

      {/* Status toggle + Delete */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          onClick={onToggleStatus}
          style={{
            flex: 1, background: 'transparent',
            border: `1px solid ${agent.status === 'ACTIVE' ? 'rgba(107,130,153,0.4)' : 'rgba(74,222,128,0.3)'}`,
            color: agent.status === 'ACTIVE' ? '#6B8299' : '#4ade80',
            borderRadius: 4, padding: '7px 0', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = agent.status === 'ACTIVE' ? 'rgba(107,130,153,0.08)' : 'rgba(74,222,128,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {agent.status === 'ACTIVE' ? 'Mark Inactive' : 'Mark Active'}
        </button>
        {!deleteConfirm ? (
          <button
            onClick={() => onDeleteConfirmChange(true)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(248,113,113,0.3)',
              color: '#f87171', borderRadius: 4,
              padding: '7px 14px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Delete
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 4, padding: '4px 10px' }}>
            <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>Confirm delete?</span>
            <button
              onClick={onDelete}
              style={{ background: '#f87171', color: '#ffffff', border: 'none', borderRadius: 3, padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              Yes
            </button>
            <button
              onClick={() => onDeleteConfirmChange(false)}
              style={{ background: 'transparent', color: '#6B8299', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}
            >
              No
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['progress', 'carriers', 'info', 'edit'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none', border: 'none',
              padding: '8px 14px', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: activeTab === tab ? '#C9A96E' : '#6B8299',
              borderBottom: activeTab === tab ? '2px solid #C9A96E' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab === 'progress' ? `Phase ${agent.phase}` : tab}
          </button>
        ))}
      </div>

      {/* Progress tab */}
      {activeTab === 'progress' && (
        <div>
          <div style={sLabel}>Phase {agent.phase} Checklist</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(PHASE_ITEMS[agent.phase] ?? []).map(item => {
              const phaseItem = agent.phaseItems.find(pi => pi.phase === agent.phase && pi.itemKey === item.key)
              const done = phaseItem?.completed ?? false
              return (
                <div key={item.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 4,
                  background: done ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${done ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)'}`,
                }}>
                  <span style={{ fontSize: 12, color: done ? '#4ade80' : '#4B5563', flexShrink: 0 }}>
                    {done ? '✓' : '○'}
                  </span>
                  <span style={{ fontSize: 12, color: done ? '#9BB0C4' : '#6B8299', flex: 1 }}>
                    {item.label}
                  </span>
                  {phaseItem?.completedAt && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: '#4B5563' }}>
                      {new Date(phaseItem.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Carriers tab */}
      {activeTab === 'carriers' && (
        <div>
          <div style={sLabel}>Carrier Appointments</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CARRIERS.map(carrier => {
              const appt = agent.carrierAppointments.find(c => c.carrier === carrier)
              const status = appt?.status ?? 'NOT_STARTED'
              const isEditing = editingCarrier === carrier

              return (
                <div key={carrier} style={{
                  padding: '10px 12px', borderRadius: 4,
                  background: status === 'APPOINTED' ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${status === 'APPOINTED' ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)'}`,
                }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, color: '#ffffff', fontWeight: 500 }}>{carrier}</div>
                      <select
                        value={carrierStatus}
                        onChange={e => setCarrierStatus(e.target.value)}
                        style={{ background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '5px 8px', fontSize: 12 }}
                      >
                        <option value="NOT_STARTED">Not Started</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPOINTED">Appointed</option>
                        <option value="JIT">JIT</option>
                      </select>
                      <input
                        value={carrierPN}
                        onChange={e => setCarrierPN(e.target.value)}
                        placeholder="Producer # (optional)"
                        style={{ background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '5px 8px', fontSize: 12 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { onUpdateCarrier(carrier, carrierStatus, carrierPN); setEditingCarrier(null) }}
                          style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCarrier(null)}
                          style={{ background: 'transparent', color: '#6B8299', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#9BB0C4' }}>{carrier}</div>
                        {appt?.producerNumber && (
                          <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2 }}>#{appt.producerNumber}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: APPOINTMENT_STATUS_COLORS[status] }}>
                          {status.replace('_', ' ')}
                        </span>
                        <button
                          onClick={() => { setEditingCarrier(carrier); setCarrierStatus(status); setCarrierPN(appt?.producerNumber ?? '') }}
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#6B8299', fontSize: 10, cursor: 'pointer', borderRadius: 3, padding: '3px 7px' }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Info tab */}
      {activeTab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['ICA Date', agent.icaDate ? new Date(agent.icaDate).toLocaleDateString() : '—'],
            ['SSN', agent.ssn ?? '—'],
            ['NPN', agent.npn ?? '—'],
            ['License #', agent.licenseNumber ?? '—'],
            ['Exam Date', agent.examDate ? new Date(agent.examDate as unknown as string).toLocaleDateString() : '—'],
            ['Trainer (CFT)', agent.cft ?? '—'],
            ['Goal', agent.goal ?? '—'],
            ['Address', [agent.addressLine1, agent.addressLine2, agent.city && agent.zip ? `${agent.city}, ${agent.state ?? ''} ${agent.zip}`.trim() : (agent.city ?? null)].filter(Boolean).join(', ') || '—'],
            ['Discord', agent.discordUserId ?? 'Not linked'],
            ['Last Login', agent.agentUser?.lastLoginAt ? new Date(agent.agentUser.lastLoginAt).toLocaleString() : 'Never'],
            ['Partners', String(agent._count.businessPartners)],
            ['Policies', String(agent._count.policies)],
            ['Call Logs', String(agent._count.callLogs)],
          ].map(([label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: 10, color: '#6B8299', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
              <span style={{ fontSize: 12, color: '#9BB0C4', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
            </div>
          ))}
          {agent.notes && (
            <div style={{ marginTop: 8, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>{agent.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* Edit tab */}
      {activeTab === 'edit' && (() => {
        const iStyle: React.CSSProperties = {
          background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 4, color: '#9BB0C4', padding: '7px 10px',
          fontSize: 12, width: '100%', boxSizing: 'border-box',
          outline: 'none',
        }
        const lStyle: React.CSSProperties = {
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#6B8299', marginBottom: 4, display: 'block',
        }
        const set = (k: keyof typeof editForm) =>
          (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setEditForm(f => ({ ...f, [k]: e.target.value }))

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Avatar */}
            <div>
              <div style={sLabel}>Profile Photo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                  background: avatarPreview ? 'transparent' : 'rgba(201,169,110,0.1)',
                  border: '2px solid rgba(201,169,110,0.25)',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {avatarPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 18, color: '#C9A96E', fontWeight: 600 }}>
                      {agent.firstName.charAt(0)}{agent.lastName.charAt(0)}
                    </span>
                  )}
                </div>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  cursor: avatarUploading ? 'not-allowed' : 'pointer',
                  background: 'transparent', border: '1px solid rgba(201,169,110,0.3)',
                  color: '#C9A96E', borderRadius: 4, padding: '6px 14px',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  opacity: avatarUploading ? 0.6 : 1,
                }}>
                  <input
                    type="file" accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    disabled={avatarUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadAdminAvatar(f); e.target.value = '' }}
                  />
                  {avatarUploading ? 'Uploading...' : avatarPreview ? 'Change Photo' : 'Upload Photo'}
                </label>
              </div>
            </div>

            {/* Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lStyle}>First Name</label>
                <input value={editForm.firstName} onChange={set('firstName')} style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Last Name</label>
                <input value={editForm.lastName} onChange={set('lastName')} style={iStyle} />
              </div>
            </div>

            {/* Contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lStyle}>Phone</label>
                <input value={editForm.phone} onChange={set('phone')} placeholder="(555) 555-5555" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Licensed State</label>
                <select value={editForm.state} onChange={set('state')} style={{ ...iStyle, appearance: 'auto' }}>
                  <option value="">Select</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* ICA + DOB */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lStyle}>ICA Date</label>
                <input type="date" value={editForm.icaDate} onChange={set('icaDate')} style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Date of Birth</label>
                <input type="date" value={editForm.dateOfBirth} onChange={set('dateOfBirth')} style={iStyle} />
              </div>
            </div>

            {/* Licensing */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lStyle}>NPN</label>
                <input value={editForm.npn} onChange={set('npn')} placeholder="National Producer #" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>License #</label>
                <input value={editForm.licenseNumber} onChange={set('licenseNumber')} placeholder="State license #" style={iStyle} />
              </div>
            </div>

            {/* CFT + Goal + Recruiter */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={lStyle}>Trainer (CFT)</label>
                <input value={editForm.cft} onChange={set('cft')} placeholder="Trainer name" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Goal</label>
                <input value={editForm.goal} onChange={set('goal')} placeholder="MD, EMD…" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Recruiter Code</label>
                <input value={editForm.recruiterId} onChange={set('recruiterId')} placeholder="Agent code" style={iStyle} />
              </div>
            </div>

            {/* Discord */}
            <div>
              <label style={lStyle}>Discord User ID</label>
              <input value={editForm.discordUserId} onChange={set('discordUserId')} placeholder="17–20 digit snowflake" style={iStyle} />
            </div>

            {/* Address */}
            <div>
              <div style={{ ...sLabel, marginBottom: 8 }}>Mailing Address</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={editForm.addressLine1} onChange={set('addressLine1')} placeholder="Street address" style={iStyle} />
                <input value={editForm.addressLine2} onChange={set('addressLine2')} placeholder="Apt / Suite (optional)" style={iStyle} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 70px', gap: 8 }}>
                  <input value={editForm.city} onChange={set('city')} placeholder="City" style={iStyle} />
                  <select value={editForm.state} onChange={set('state')} style={{ ...iStyle, appearance: 'auto' }}>
                    <option value="">State</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={editForm.zip} onChange={set('zip')} placeholder="ZIP" style={iStyle} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={lStyle}>Internal Notes</label>
              <textarea
                value={editForm.notes}
                onChange={set('notes')}
                placeholder="Admin notes…"
                rows={3}
                style={{ ...iStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            {editError && (
              <div style={{ fontSize: 11, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.06)', borderRadius: 4 }}>
                {editError}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                style={{
                  background: editSaving ? 'rgba(201,169,110,0.3)' : '#C9A96E',
                  color: '#142D48', border: 'none', borderRadius: 4,
                  padding: '9px 20px', fontSize: 11, fontWeight: 700,
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
              {editSaved && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved</span>}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Add Agent Modal ──────────────────────────────────────────────────────────

function AddAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', agentCode: '',
    state: '', phone: '', icaDate: '', recruiterId: '',
    cft: '', goal: '', initialPointOfContact: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json() as { ok?: boolean; error?: string; agentUserId?: string }
    if (!res.ok) { setError(data.error ?? 'Failed'); setLoading(false); return }
    await fetch('/api/admin/agents/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentUserId: data.agentUserId }),
    })
    onCreated()
  }

  const inputStyle = {
    width: '100%', background: '#0C1E30',
    border: '1px solid rgba(201,169,110,0.15)',
    borderRadius: 4, color: '#9BB0C4',
    padding: '8px 12px', fontSize: 13,
    boxSizing: 'border-box' as const,
  }
  const fieldLabel = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
    textTransform: 'uppercase' as const, color: '#C9A96E',
    display: 'block', marginBottom: 5,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.15)',
        borderRadius: 8, padding: 32,
        width: 480, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              New Agent
            </div>
            <div style={{ fontSize: 18, fontWeight: 300, color: '#ffffff' }}>Add to AFF Tracker</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#9BB0C4', cursor: 'pointer', fontSize: 14, width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={fieldLabel}>First Name *</label><input required style={inputStyle} value={form.firstName} onChange={set('firstName')} /></div>
            <div><label style={fieldLabel}>Last Name *</label><input required style={inputStyle} value={form.lastName} onChange={set('lastName')} /></div>
            <div><label style={fieldLabel}>Email *</label><input required type="email" style={inputStyle} value={form.email} onChange={set('email')} /></div>
            <div><label style={fieldLabel}>Agent Code *</label><input required style={inputStyle} value={form.agentCode} onChange={set('agentCode')} placeholder="e.g. F2030" /></div>
            <div><label style={fieldLabel}>State</label>
              <select style={{ ...inputStyle, appearance: 'auto' }} value={form.state} onChange={set('state')}>
                <option value="">Select state</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={form.phone} onChange={set('phone')} /></div>
            <div><label style={fieldLabel}>ICA Date</label><input type="date" style={inputStyle} value={form.icaDate} onChange={set('icaDate')} /></div>
            <div><label style={fieldLabel}>Recruiter Code</label><input style={inputStyle} value={form.recruiterId} onChange={set('recruiterId')} placeholder="e.g. B3570" /></div>
            <div><label style={fieldLabel}>Trainer (CFT)</label><input style={inputStyle} value={form.cft} onChange={set('cft')} /></div>
            <div><label style={fieldLabel}>Goal</label>
              <select style={{ ...inputStyle }} value={form.goal} onChange={set('goal')}>
                <option value="">Select goal</option>
                <option>MD</option><option>EMD</option><option>CFT</option>
              </select>
            </div>
          </div>
          <div><label style={fieldLabel}>Initial Point of Contact</label>
            <select style={{ ...inputStyle }} value={form.initialPointOfContact} onChange={set('initialPointOfContact')}>
              <option value="">Select source</option>
              <option>CareerBuilder</option><option>Taproot</option><option>Indeed</option>
              <option>Referral</option><option>Social Media</option><option>Other</option>
            </select>
          </div>

          {error && <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.2)', color: '#C9A96E', borderRadius: 4, padding: '9px 18px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ background: loading ? 'rgba(201,169,110,0.4)' : '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '9px 20px', fontSize: 11, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {loading ? 'Creating...' : 'Create & Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
