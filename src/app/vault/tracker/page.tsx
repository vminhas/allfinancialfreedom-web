'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { PHASE_LABELS, CARRIERS, getAtRiskStatus, PHASE_ITEMS, PHASE_GROUPS } from '@/lib/agent-constants'
import { GROUP_ICONS, ChevronDown } from '@/lib/checklist-icons'
import CallReviewModal, { CallReviewData } from '@/components/CallReviewModal'

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
  readyForPromotion: boolean
  carriersAppointed: number
  carriersTotal: number
  milestoneCount: number
  createdAt: string
  callScore30d: number | null
  callReviewCount30d: number
  openCoachingFlags: number
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
  const [statusFilter, setStatusFilter] = useState('active')
  const [atRiskOnly, setAtRiskOnly] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<DetailedAgent | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [stats, setStats] = useState<DashStats | null>(null)

  // Date range state (chart only)
  type Preset = '3m' | '6m' | '12m' | 'ytd' | 'all' | 'custom'
  const [preset, setPreset] = useState<Preset>('12m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [trendData, setTrendData] = useState<TrendPoint[]>([])

  // Table-only filters
  const [newThisMonthOnly, setNewThisMonthOnly] = useState(false)
  const [flaggedCoachingOnly, setFlaggedCoachingOnly] = useState(false)

  // Trainer list for dropdowns
  const [trainers, setTrainers] = useState<string[]>([])
  const [promotionRequests, setPromotionRequests] = useState<{ id: string; agentName: string; agentId: string; createdAt: string; status: string }[]>([])

  // Team-wide call review stats
  const [reviewStats, setReviewStats] = useState<{ teamAvg30d: number | null; teamAvgPrior30d: number | null; delta: number | null; flaggedOpenCount: number; totalReviews: number; reviewedAgents30d: number } | null>(null)

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
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (phaseFilter) params.set('phase', phaseFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (newThisMonthOnly) {
      const today = new Date()
      const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
      const end = today.toISOString().split('T')[0]
      params.set('icaStart', start)
      params.set('icaEnd', end)
    }
    const res = await fetch(`/api/admin/agents?${params}`)
    const data = await res.json() as { agents: Agent[]; total: number }
    setAgents(data.agents ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [page, phaseFilter, statusFilter, newThisMonthOnly])

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/admin/stats')
    if (res.ok) setStats(await res.json() as DashStats)
  }, [])

  const fetchTrainers = useCallback(async () => {
    const res = await fetch('/api/admin/trainers')
    if (res.ok) {
      const data = await res.json() as { trainers: string[] }
      setTrainers(data.trainers)
    }
  }, [])

  const fetchReviewStats = useCallback(async () => {
    const res = await fetch('/api/admin/call-reviews/stats')
    if (res.ok) {
      const data = await res.json() as { teamAvg30d: number | null; teamAvgPrior30d: number | null; delta: number | null; flaggedOpenCount: number; totalReviews: number; reviewedAgents30d: number }
      setReviewStats(data)
    }
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchTrends() }, [fetchTrends])
  useEffect(() => { fetchTrainers() }, [fetchTrainers])
  useEffect(() => { fetchReviewStats() }, [fetchReviewStats])
  useEffect(() => {
    fetch('/api/vault/promotion-requests')
      .then(r => r.ok ? r.json() : { requests: [] })
      .then((d: { requests: typeof promotionRequests }) => setPromotionRequests(d.requests ?? []))
      .catch(() => {})
  }, [])

  const openDrawer = useCallback(async (id: string) => {
    setDrawerLoading(true)
    setSelectedAgent(null)
    const res = await fetch(`/api/admin/agents/${id}`)
    const data = await res.json() as DetailedAgent
    setSelectedAgent(data)
    setDrawerLoading(false)
  }, [])

  // Deep-link support: /vault/tracker?agentId=xxx auto-opens that agent's drawer
  // (used by the birthday tracker, future quick-jump links, etc.)
  const searchParams = useSearchParams()
  useEffect(() => {
    const agentId = searchParams.get('agentId')
    if (agentId) openDrawer(agentId)
  }, [searchParams, openDrawer])

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

  const displayedAgents = (() => {
    let list = agents
    if (atRiskOnly) {
      list = list.filter(a => {
        const s = getAtRiskStatus(a.phase, a.phaseStartedAt ? new Date(a.phaseStartedAt) : null, a.phaseCompleted, a.phaseTotal)
        return s !== 'on-track'
      })
    }
    if (flaggedCoachingOnly) {
      list = list.filter(a => a.openCoachingFlags > 0)
    }
    return list
  })()

  // KPI card filter states
  const activeAgentsFilterOn = statusFilter === 'active'
  const inactiveAgentsFilterOn = statusFilter === 'inactive'
  const newThisMonthFilterOn = newThisMonthOnly

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
              All Financial Freedom
            </div>
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
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
                setNewThisMonthOnly(v => !v)
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
            {/* Avg Call Score (30d) */}
            {reviewStats && (
              <div
                onClick={() => { setFlaggedCoachingOnly(v => !v); setPage(1) }}
                style={{
                  background: flaggedCoachingOnly ? 'rgba(155,109,255,0.08)' : '#142D48',
                  border: `1px solid ${flaggedCoachingOnly ? 'rgba(155,109,255,0.3)' : 'rgba(201,169,110,0.08)'}`,
                  borderRadius: 6, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s',
                }}
                title="Click to show only agents with open coaching flags"
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>Avg Call Score</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: reviewStats.teamAvg30d != null ? (reviewStats.teamAvg30d >= 80 ? '#4ade80' : reviewStats.teamAvg30d >= 60 ? '#f59e0b' : '#f87171') : '#4B5563', lineHeight: 1, marginBottom: 4 }}>
                  {reviewStats.teamAvg30d ?? '—'}
                </div>
                <div style={{ fontSize: 11, color: flaggedCoachingOnly ? '#9B6DFF' : '#4B5563' }}>
                  {flaggedCoachingOnly ? '✕ clear filter' : (
                    reviewStats.delta != null
                      ? `${reviewStats.delta >= 0 ? '+' : ''}${reviewStats.delta} vs prior 30d · ${reviewStats.flaggedOpenCount} flagged`
                      : `${reviewStats.flaggedOpenCount} flagged for coaching`
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Phase pipeline + trend chart side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
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
                <div style={{ flex: 1, minHeight: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
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
                </div>
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

      {/* ── Promotion requests banner ── */}
      {promotionRequests.length > 0 && (
        <div style={{
          marginBottom: 16, padding: '14px 20px', borderRadius: 6,
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#f59e0b',
              background: 'rgba(245,158,11,0.15)', padding: '3px 10px',
              borderRadius: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{promotionRequests.length}</span>
            <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>
              Promotion Request{promotionRequests.length > 1 ? 's' : ''} Pending
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {promotionRequests.map(r => (
              <button
                key={r.id}
                onClick={() => {
                  const agent = agents.find(a => a.id === r.agentId)
                  if (agent) {
                    setSelectedAgent(null)
                    setTimeout(() => {
                      fetch(`/api/admin/agents/${r.agentId}`)
                        .then(res => res.json())
                        .then((d: DetailedAgent) => setSelectedAgent(d))
                    }, 50)
                  }
                }}
                style={{
                  padding: '5px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  color: '#f59e0b', cursor: 'pointer',
                }}
              >
                {r.agentName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Agent table ── */}
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.08)',
        borderRadius: 6, overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(12,30,48,0.8)' }}>
              {['Agent', 'State', 'Phase', 'Progress', 'Days', 'Carriers', 'Call Score', 'Trainer', 'Status', ''].map(h => (
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
                  {[...Array(10)].map((_, j) => (
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
                    <td style={{ padding: '13px 16px' }}>
                      {agent.callScore30d != null ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 4,
                          fontSize: 11, fontWeight: 700,
                          background: `${agent.callScore30d >= 80 ? '#4ade80' : agent.callScore30d >= 60 ? '#f59e0b' : '#f87171'}14`,
                          color: agent.callScore30d >= 80 ? '#4ade80' : agent.callScore30d >= 60 ? '#f59e0b' : '#f87171',
                          border: `1px solid ${agent.callScore30d >= 80 ? '#4ade80' : agent.callScore30d >= 60 ? '#f59e0b' : '#f87171'}40`,
                        }}>
                          {agent.callScore30d}
                          {agent.openCoachingFlags > 0 && <span title={`${agent.openCoachingFlags} open flag(s)`}>⚑</span>}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#4B5563' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#9BB0C4' }}>{agent.cft ?? '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px', borderRadius: 4,
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: STATUS_COLORS[riskStatus].color,
                          background: STATUS_COLORS[riskStatus].bg,
                        }}>
                          {STATUS_COLORS[riskStatus].label}
                        </span>
                        {agent.readyForPromotion && (
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px', borderRadius: 4,
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            color: '#C9A96E', background: 'rgba(201,169,110,0.12)',
                            border: '1px solid rgba(201,169,110,0.35)',
                            animation: 'pulse 2s ease-in-out infinite',
                          }}>
                            Ready to promote
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#C9A96E', fontSize: 18, opacity: 0.6 }}>›</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        </div>
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
            width: 'min(540px, 100vw)', height: '100%', overflow: 'auto',
            background: '#0C1E30',
            borderLeft: '1px solid rgba(201,169,110,0.15)',
            padding: 'clamp(16px, 4vw, 32px)',
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
                trainers={trainers}
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
          onCreated={() => { setShowAddModal(false); fetchAgents(); fetchStats(); fetchTrainers() }}
          trainers={trainers}
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
  trainers,
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
  trainers: string[]
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'progress' | 'carriers' | 'calls' | 'info' | 'edit'>('progress')
  const [drawerChecklistPhase, setDrawerChecklistPhase] = useState<number>(agent.phase)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [localPhaseItems, setLocalPhaseItems] = useState(agent.phaseItems)

  // Keep local view in sync when the agent prop changes (e.g. after re-fetch)
  useEffect(() => {
    setLocalPhaseItems(agent.phaseItems)
  }, [agent.phaseItems])
  useEffect(() => {
    setDrawerChecklistPhase(agent.phase)
  }, [agent.id, agent.phase])

  const toggleAgentItem = async (itemKey: string, phase: number, completed: boolean) => {
    setTogglingKey(itemKey)
    // Optimistic update
    setLocalPhaseItems(prev => {
      const idx = prev.findIndex(p => p.phase === phase && p.itemKey === itemKey)
      const updated = {
        phase,
        itemKey,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
      }
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updated
        return next
      }
      return [...prev, updated]
    })
    try {
      await fetch(`/api/admin/agents/${agent.id}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey, phase, completed }),
      })
    } finally {
      setTogglingKey(null)
    }
  }
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
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {(['progress', 'carriers', 'calls', 'info', 'edit'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none', border: 'none',
              padding: '10px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: activeTab === tab ? '#C9A96E' : '#6B8299',
              borderBottom: activeTab === tab ? '2px solid #C9A96E' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab === 'progress' ? `Phase ${agent.phase}` : tab === 'calls' ? 'Call Reviews' : tab}
          </button>
        ))}
      </div>

      {/* Progress tab */}
      {activeTab === 'progress' && (
        <div>
          {/* Phase sub-tabs — bounce between phases independently of current phase */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map(ph => {
              const items = PHASE_ITEMS[ph] ?? []
              const done = localPhaseItems.filter(p => p.phase === ph && p.completed).length
              const total = items.length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              const isActive = drawerChecklistPhase === ph
              const isCurrent = ph === agent.phase
              const isPast = ph < agent.phase
              return (
                <button
                  key={ph}
                  onClick={() => setDrawerChecklistPhase(ph)}
                  style={{
                    padding: '7px 14px', borderRadius: 4, cursor: 'pointer',
                    fontSize: 11, fontWeight: isActive ? 700 : 500,
                    letterSpacing: '0.08em',
                    border: `1px solid ${isActive ? PHASE_COLORS[ph] : 'rgba(255,255,255,0.08)'}`,
                    background: isActive ? `${PHASE_COLORS[ph]}18` : 'transparent',
                    color: isActive ? PHASE_COLORS[ph] : isPast ? '#4ade80' : isCurrent ? '#9BB0C4' : '#4B5563',
                    display: 'flex', alignItems: 'center', gap: 6,
                    minHeight: 36,
                    transition: 'all 0.15s',
                  }}
                >
                  {isPast && <span style={{ fontSize: 9 }}>✓</span>}
                  Phase {ph}
                  {isCurrent && !isActive && <span style={{ fontSize: 8, color: '#C9A96E', fontWeight: 700 }}>NOW</span>}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>{pct}%</span>
                </button>
              )
            })}
          </div>

          <div style={sLabel}>Phase {drawerChecklistPhase} — {PHASE_LABELS[drawerChecklistPhase]?.title}</div>
          <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 12, lineHeight: 1.5 }}>
            Click any item to toggle it. Agents work on phases asynchronously — you can check items here even if it&apos;s not the agent&apos;s current phase.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              const allItems = PHASE_ITEMS[drawerChecklistPhase] ?? []
              const groups = PHASE_GROUPS[drawerChecklistPhase] ?? []

              const groupedItems: { group: typeof groups[0] | null; items: typeof allItems }[] = []
              const usedKeys = new Set<string>()

              for (const g of groups) {
                const gItems = allItems.filter(i => i.group === g.key)
                if (gItems.length > 0) {
                  groupedItems.push({ group: g, items: gItems })
                  gItems.forEach(i => usedKeys.add(i.key))
                }
              }
              const ungrouped = allItems.filter(i => !usedKeys.has(i.key))
              if (ungrouped.length > 0) {
                groupedItems.push({ group: null, items: ungrouped })
              }

              return groupedItems.map(({ group, items: groupItems }) => {
                const groupCompleted = groupItems.filter(item => {
                  return localPhaseItems.some(pi => pi.phase === drawerChecklistPhase && pi.itemKey === item.key && pi.completed)
                }).length

                const GIcon = group?.icon ? GROUP_ICONS[group.icon] : null

                return (
                  <div key={group?.key ?? 'ungrouped'}>
                    {group && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', marginBottom: 4,
                        background: 'rgba(201,169,110,0.04)',
                        border: '1px solid rgba(201,169,110,0.1)',
                        borderRadius: 4,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {GIcon && <GIcon size={14} color="#C9A96E" />}
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#ffffff' }}>{group.label}</div>
                            {group.description && (
                              <div style={{ fontSize: 9, color: '#6B8299', marginTop: 1 }}>{group.description}</div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            color: groupCompleted === groupItems.length ? '#4ade80' : '#C9A96E',
                          }}>
                            {groupCompleted}/{groupItems.length}
                          </span>
                          <span style={{
                            width: 36, height: 3, borderRadius: 2,
                            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                            display: 'inline-block',
                          }}>
                            <span style={{
                              display: 'block', height: '100%',
                              width: `${groupItems.length > 0 ? Math.round((groupCompleted / groupItems.length) * 100) : 0}%`,
                              background: groupCompleted === groupItems.length ? '#4ade80' : '#C9A96E',
                              borderRadius: 2, transition: 'width 0.3s',
                            }} />
                          </span>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                      {groupItems.map(item => {
                        const phaseItem = localPhaseItems.find(pi => pi.phase === drawerChecklistPhase && pi.itemKey === item.key)
                        const done = phaseItem?.completed ?? false
                        const isToggling = togglingKey === item.key
                        return (
                          <button
                            key={item.key}
                            onClick={() => toggleAgentItem(item.key, drawerChecklistPhase, !done)}
                            disabled={isToggling}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 12px', borderRadius: 4, minHeight: 36,
                              background: done ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                              cursor: isToggling ? 'wait' : 'pointer',
                              opacity: isToggling ? 0.6 : 1,
                              textAlign: 'left', transition: 'all 0.15s',
                            }}
                          >
                            <span style={{
                              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                              background: done ? '#4ade80' : 'transparent',
                              border: `2px solid ${done ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 8, color: '#0A1628', fontWeight: 700,
                            }}>
                              {done && '✓'}
                            </span>
                            <span style={{ fontSize: 11, color: done ? '#9BB0C4' : '#ffffff', flex: 1 }}>
                              {item.label}
                            </span>
                            {item.duration && (
                              <span style={{ fontSize: 9, color: '#4B5563', flexShrink: 0 }}>
                                {item.duration}
                              </span>
                            )}
                            {phaseItem?.completedAt && (
                              <span style={{ fontSize: 9, color: '#4B5563', flexShrink: 0 }}>
                                {new Date(phaseItem.completedAt).toLocaleDateString()}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}
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

      {/* Call Reviews tab */}
      {activeTab === 'calls' && (
        <CallReviewsDrawerTab agentProfileId={agent.id} agentName={`${agent.firstName} ${agent.lastName}`} />
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
                <select value={editForm.cft} onChange={set('cft')} style={{ ...iStyle, appearance: 'auto' }}>
                  <option value="">Select trainer</option>
                  {trainers.map(t => <option key={t} value={t}>{t}</option>)}
                  {editForm.cft && !trainers.includes(editForm.cft) && (
                    <option value={editForm.cft}>{editForm.cft}</option>
                  )}
                </select>
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

function AddAgentModal({ onClose, onCreated, trainers }: { onClose: () => void; onCreated: () => void; trainers: string[] }) {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 12 }}>
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.15)',
        borderRadius: 8, padding: 'clamp(20px, 4vw, 32px)',
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
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
            <div><label style={fieldLabel}>Trainer (CFT)</label>
              <select style={{ ...inputStyle, appearance: 'auto' }} value={form.cft} onChange={set('cft')}>
                <option value="">Select trainer</option>
                {trainers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
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

// ─── Call Reviews Drawer Tab (admin view) ─────────────────────────────────────

interface AdminReview {
  id: string
  overallScore: number
  rubricScores: { opening: number; discovery: number; product: number; objections: number; closing: number; tone: number }
  strengths: string[]
  weaknesses: string[]
  coachingTips: string[]
  nextSteps: string[]
  summary: string
  flaggedForCoaching: boolean
  adminNotes: string | null
  discussedAt: string | null
  reviewedAt: string
  callLog: {
    id: string
    callDate: string
    contactName: string
    subject: string | null
    transcriptText: string | null
  }
}

interface DrawerStats {
  totalReviews: number
  avgOverall: number
  avgRubric: Record<string, number>
  flaggedCount: number
  recentAvg: number | null
}

function CallReviewsDrawerTab({ agentProfileId, agentName }: { agentProfileId: string; agentName: string }) {
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [stats, setStats] = useState<DrawerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<AdminReview | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/agents/${agentProfileId}/call-reviews`)
    if (res.ok) {
      const d = await res.json() as { reviews: AdminReview[]; aggregate: DrawerStats | null }
      setReviews(d.reviews)
      setStats(d.aggregate)
    }
    setLoading(false)
  }, [agentProfileId])

  useEffect(() => { load() }, [load])

  const updateReview = async (reviewId: string, patch: { adminNotes?: string | null; discussedAt?: string | null; flaggedForCoaching?: boolean }) => {
    const res = await fetch(`/api/admin/call-reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const d = await res.json() as { review: AdminReview }
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, ...d.review } : r))
      if (viewing?.id === reviewId) setViewing({ ...viewing, ...d.review })
    }
  }

  if (loading) {
    return <div style={{ color: '#6B8299', fontSize: 13, padding: '20px 0' }}>Loading reviews...</div>
  }

  if (reviews.length === 0) {
    return (
      <div>
        <ExplainerBanner />
        <div style={{
          marginTop: 16, padding: '24px 18px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(201,169,110,0.15)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 13, color: '#9BB0C4', marginBottom: 4 }}>No call reviews yet</div>
          <div style={{ fontSize: 11, color: '#6B8299' }}>
            {agentName.split(' ')[0]} hasn&apos;t submitted any transcripts for AI review. Encourage them to paste Fathom transcripts in the Calls tab of their portal.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <ExplainerBanner />

      {/* Aggregate stats */}
      {stats && (
        <div style={{ marginTop: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
            <MiniStat label="30-day avg" value={stats.recentAvg != null ? `${stats.recentAvg}` : '—'} color={stats.recentAvg != null ? scoreColor(stats.recentAvg) : '#6B8299'} />
            <MiniStat label="All-time avg" value={`${stats.avgOverall}`} color={scoreColor(stats.avgOverall)} />
            <MiniStat label="Reviews" value={`${stats.totalReviews}`} color="#9BB0C4" />
            <MiniStat label="Flagged" value={`${stats.flaggedCount}`} color={stats.flaggedCount > 0 ? '#f87171' : '#4ade80'} />
          </div>

          {/* Rubric averages */}
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10 }}>
            Rubric averages
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              ['opening', 'Opening & Rapport'],
              ['discovery', 'Discovery & Needs'],
              ['product', 'Product Knowledge'],
              ['objections', 'Objection Handling'],
              ['closing', 'Closing & Next Steps'],
              ['tone', 'Tone & Empathy'],
            ] as const).map(([key, label]) => {
              const score = stats.avgRubric[key] ?? 0
              const color = scoreColor(score)
              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 3 }}>{label}</div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{score}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent reviews list */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10 }}>
        Recent Reviews
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reviews.map(r => {
          const color = scoreColor(r.overallScore)
          return (
            <button
              key={r.id}
              onClick={() => setViewing(r)}
              style={{
                textAlign: 'left', width: '100%',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${r.flaggedForCoaching && !r.discussedAt ? 'rgba(248,113,113,0.3)' : 'rgba(201,169,110,0.08)'}`,
                borderRadius: 6, padding: '12px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>{r.callLog.contactName}</div>
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                  {new Date(r.callLog.callDate).toLocaleDateString()}
                  {r.discussedAt && <span style={{ color: '#4ade80', marginLeft: 8 }}>✓ Discussed</span>}
                  {r.flaggedForCoaching && !r.discussedAt && <span style={{ color: '#f87171', marginLeft: 8 }}>⚑ Needs coaching</span>}
                </div>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 700, color,
                padding: '6px 12px', borderRadius: 4,
                background: `${color}12`, border: `1px solid ${color}40`,
                minWidth: 44, textAlign: 'center',
              }}>
                {r.overallScore}
              </div>
            </button>
          )
        })}
      </div>

      {/* Review detail modal */}
      {viewing && (
        <CallReviewModal
          review={{
            id: viewing.id,
            overallScore: viewing.overallScore,
            rubricScores: viewing.rubricScores,
            strengths: viewing.strengths,
            weaknesses: viewing.weaknesses,
            coachingTips: viewing.coachingTips,
            nextSteps: viewing.nextSteps,
            summary: viewing.summary,
            flaggedForCoaching: viewing.flaggedForCoaching,
            adminNotes: viewing.adminNotes,
            discussedAt: viewing.discussedAt,
            reviewedAt: viewing.reviewedAt,
          } as CallReviewData}
          callDate={viewing.callLog.callDate}
          contactName={viewing.callLog.contactName}
          adminMode
          onClose={() => setViewing(null)}
          onAdminUpdate={async (patch) => {
            await updateReview(viewing.id, patch)
          }}
        />
      )}
    </div>
  )
}

function ExplainerBanner() {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(155,109,255,0.06)',
      border: '1px solid rgba(155,109,255,0.2)',
      borderRadius: 6,
      fontSize: 11,
      color: '#9BB0C4',
      lineHeight: 1.55,
    }}>
      <strong style={{ color: '#9B6DFF' }}>What you&apos;re looking at:</strong> Claude reviews each call transcript against the AFF rubric (opening, discovery, product, objections, closing, tone) and scores it 0-100. Reviews flagged for coaching scored below 60 overall or had at least one weak dimension under 50. Use the aggregate to spot patterns and the recent list to coach specific calls.
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: '#0C1E30',
      border: '1px solid rgba(201,169,110,0.1)',
      borderRadius: 5, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function scoreColor(score: number) {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#f59e0b'
  return '#f87171'
}
