'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { PHASE_LABELS, CARRIERS, getAtRiskStatus, PHASE_ITEMS, PHASE_GROUPS } from '@/lib/agent-constants'
import { PHASE_COLORS } from '@/lib/phase-colors'
import { GROUP_ICONS, ChevronDown } from '@/lib/checklist-icons'
import CallReviewModal, { CallReviewData } from '@/components/CallReviewModal'
import AgentTypeahead from '@/components/AgentTypeahead'
import DatePicker from '@/components/DatePicker'
import { AgentTradingCardModal } from '@/components/AgentTradingCard'
import { CallButton, EmailButton } from '@/components/ContactActions'
import CopyButton from '@/components/CopyButton'

interface Agent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
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
  phone: string | null
  recruiterCode: string | null
  recruiterName: string | null
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
  selectedCarriers: string[]
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
  isTest: boolean
  isLeadership?: boolean
  isReferralPartner?: boolean
  vipArrival?: boolean
  vipArrivalTitle?: string | null
  partnerAgentProfileId?: string | null
  partnerDisplayName?: string | null
  coupleDisplayName?: string | null
  coupleAvatarUrl?: string | null
  recruiter: { firstName: string; lastName: string; agentCode: string } | null
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

const STATUS_COLORS = {
  'on-track': { color: '#4ade80', label: 'On Track', bg: 'rgba(74,222,128,0.12)' },
  'behind':   { color: '#f59e0b', label: 'Behind',   bg: 'rgba(245,158,11,0.12)' },
  'at-risk':  { color: '#f87171', label: 'At Risk',  bg: 'rgba(248,113,113,0.12)' },
}
const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  APPOINTED: '#4ade80', PENDING: '#f59e0b', JIT: '#9B6DFF', NOT_STARTED: '#6B8299',
}

// Compact relative formatter for the drawer header. Recent logins
// answer the "is this agent active?" question at a glance, so we
// emphasize "today" / "yesterday" / "Nd ago" rather than a raw
// timestamp (which is still surfaced via the title tooltip).
function formatRelativeLogin(iso: string): string {
  const t = new Date(iso).getTime()
  const diffMs = Date.now() - t
  if (diffMs < 0) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TrackerPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [phaseFilter, setPhaseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [atRiskOnly, setAtRiskOnly] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<DetailedAgent | null>(null)
  // Trading-card modal: opened from the drawer's "Trading Card" button.
  const [cardCode, setCardCode] = useState<string | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [livePhaseItems, setLivePhaseItems] = useState<Record<number, typeof PHASE_ITEMS[1]> | null>(null)
  const [livePhaseGroups, setLivePhaseGroups] = useState<Record<number, typeof PHASE_GROUPS[1]> | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [stats, setStats] = useState<DashStats | null>(null)

  // Date range state (chart only)
  type Preset = '3m' | '6m' | '12m' | 'mtd' | 'ytd' | 'all' | 'custom'
  const [preset, setPreset] = useState<Preset>('12m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month'>('month')

  // Table-only filters
  const [newThisMonthOnly, setNewThisMonthOnly] = useState(false)
  const [flaggedCoachingOnly, setFlaggedCoachingOnly] = useState(false)
  const [readyToPromoteOnly, setReadyToPromoteOnly] = useState(false)

  // Sorting
  const [sortCol, setSortCol] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Recruiter filter
  const [recruiterFilter, setRecruiterFilter] = useState('')
  const [recruiterOptions, setRecruiterOptions] = useState<{ agentCode: string; name: string }[]>([])

  // Trainer list for dropdowns
  const [trainers, setTrainers] = useState<string[]>([])
  const [promotionRequests, setPromotionRequests] = useState<{ id: string; agentName: string; agentId: string; createdAt: string; status: string; phaseItemKey: string | null }[]>([])

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
    if (preset === 'mtd') {
      const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0')
      return { start: `${y}-${m}-01`, end }
    }
    if (preset === 'ytd') return { start: `${today.getFullYear()}-01-01`, end }
    const months = preset === '3m' ? 3 : preset === '6m' ? 6 : 12
    const start = new Date(today)
    start.setMonth(start.getMonth() - months)
    return { start: fmt(start), end }
  }

  function autoGranularity(range: { start: string; end: string } | null): 'day' | 'week' | 'month' {
    if (!range?.start) return 'month'
    const days = (new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000
    if (days <= 45) return 'day'
    if (days <= 150) return 'week'
    return 'month'
  }

  const fetchTrends = useCallback(async () => {
    const range = getDateRange()
    const granularity = autoGranularity(range)
    const params = new URLSearchParams()
    if (range?.start) params.set('startDate', range.start)
    if (range?.end)   params.set('endDate', range.end)
    params.set('granularity', granularity)
    const res = await fetch(`/api/admin/trends?${params}`)
    if (res.ok) {
      const d = await res.json() as { months: TrendPoint[]; granularity?: 'day' | 'week' | 'month' }
      setTrendData(d.months)
      setTrendGranularity(d.granularity ?? granularity)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd])

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    // When a search query is active, ignore the active/inactive filter
    // so admins can find someone by name regardless of status. Without
    // this, looking up an inactive agent's phone forced you to flip
    // them to ACTIVE first, which was a real footgun.
    const searchActive = debouncedSearch.trim().length > 0
    if (!readyToPromoteOnly) {
      if (phaseFilter) params.set('phase', phaseFilter)
      if (statusFilter && !searchActive) params.set('status', statusFilter)
      if (newThisMonthOnly) {
        // Rolling 30-day window so the click-to-filter result matches
        // the dashboard stat exactly. Calendar-month boundary made
        // the page read empty on the 1st of every month.
        const today = new Date()
        const start = new Date(today)
        start.setDate(start.getDate() - 30)
        params.set('icaStart', start.toISOString().split('T')[0])
        params.set('icaEnd', today.toISOString().split('T')[0])
      }
    }
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    if (readyToPromoteOnly) params.set('readyToPromote', '1')
    if (recruiterFilter) params.set('recruiter', recruiterFilter)
    const res = await fetch(`/api/admin/agents?${params}`)
    const data = await res.json() as { agents: Agent[]; total: number }
    setAgents(data.agents ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [page, phaseFilter, statusFilter, debouncedSearch, newThisMonthOnly, readyToPromoteOnly, recruiterFilter])

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

  const fetchRecruiters = useCallback(async () => {
    const res = await fetch('/api/admin/agents?recruiters=1')
    if (res.ok) {
      const data = await res.json() as { recruiters: { agentCode: string; name: string }[] }
      setRecruiterOptions(data.recruiters ?? [])
    }
  }, [])

  const fetchReviewStats = useCallback(async () => {
    const res = await fetch('/api/admin/call-reviews/stats')
    if (res.ok) {
      const data = await res.json() as { teamAvg30d: number | null; teamAvgPrior30d: number | null; delta: number | null; flaggedOpenCount: number; totalReviews: number; reviewedAgents30d: number }
      setReviewStats(data)
    }
  }, [])

  useEffect(() => {
    fetch('/api/agents/phase-items')
      .then(r => r.ok ? r.json() : null)
      .then((d: { items: Record<string, { itemKey: string; label: string; description: string; duration?: string; groupKey?: string; adminOnly?: boolean; coordinatorTopic?: string; actionJson?: string }[]>; groups?: Record<string, Array<{ key: string; label: string; icon?: string | null; description?: string | null; showTrainer?: boolean }>>; source: string } | null) => {
        if (d?.source === 'database' && d.items) {
          const mapped: Record<number, typeof PHASE_ITEMS[1]> = {}
          for (const [phase, items] of Object.entries(d.items)) {
            mapped[parseInt(phase)] = items.map(i => ({
              key: i.itemKey, label: i.label, description: i.description,
              duration: i.duration, group: i.groupKey ?? undefined,
              adminOnly: i.adminOnly,
              coordinatorTopic: i.coordinatorTopic as typeof PHASE_ITEMS[1][0]['coordinatorTopic'],
              action: i.actionJson ? JSON.parse(i.actionJson) : undefined,
            }))
          }
          setLivePhaseItems(mapped)
        }
        if (d?.groups && !Array.isArray(d.groups)) {
          const mapped: Record<number, typeof PHASE_GROUPS[1]> = {}
          for (const [phase, groups] of Object.entries(d.groups)) {
            if (!Array.isArray(groups)) continue
            mapped[parseInt(phase)] = groups.map(g => ({
              key: g.key, label: g.label,
              icon: g.icon ?? undefined,
              description: g.description ?? undefined,
              showTrainer: g.showTrainer ?? false,
            }))
          }
          setLivePhaseGroups(mapped)
        }
      }).catch(() => {})
  }, [])
  useEffect(() => { fetchAgents() }, [fetchAgents])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchTrends() }, [fetchTrends])
  useEffect(() => { fetchTrainers() }, [fetchTrainers])
  useEffect(() => { fetchRecruiters() }, [fetchRecruiters])
  useEffect(() => { fetchReviewStats() }, [fetchReviewStats])
  useEffect(() => {
    fetch('/api/vault/promotion-requests')
      .then(r => r.ok ? r.json() : { requests: [] })
      .then((d: { requests: typeof promotionRequests }) => setPromotionRequests(d.requests ?? []))
      .catch(() => {})
  }, [])

  const router = useRouter()
  const searchParams = useSearchParams()

  // Sync the selected agent + active tab into the URL so refresh
  // (and home-screen PWA reopen) restores what the user was looking
  // at. Birthday tracker / quick-jump links already use ?agentId=
  // for deep-linking; we just keep the param in lockstep with state
  // so the URL stays meaningful as the user navigates inside the
  // drawer.
  const updateUrl = useCallback((agentId: string | null, tab: string | null) => {
    const sp = new URLSearchParams(window.location.search)
    if (agentId) sp.set('agentId', agentId); else sp.delete('agentId')
    if (tab) sp.set('tab', tab); else sp.delete('tab')
    const qs = sp.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [])

  const openDrawer = useCallback(async (id: string) => {
    setDrawerLoading(true)
    setSelectedAgent(null)
    updateUrl(id, searchParams.get('tab'))
    const res = await fetch(`/api/admin/agents/${id}`)
    const data = await res.json() as DetailedAgent
    setSelectedAgent(data)
    setDrawerLoading(false)
  }, [updateUrl, searchParams])

  const closeDrawer = useCallback(() => {
    setSelectedAgent(null)
    setInviteMsg('')
    setDeleteConfirm(false)
    updateUrl(null, null)
  }, [updateUrl])

  // Deep-link support: /vault/tracker?agentId=xxx auto-opens that agent's drawer
  // (used by the birthday tracker, future quick-jump links, etc.)
  // Also runs on mount so refreshing the page (or reopening the PWA
  // from the home screen) restores whatever was open.
  useEffect(() => {
    const agentId = searchParams.get('agentId')
    if (agentId && (!selectedAgent || selectedAgent.id !== agentId)) {
      openDrawer(agentId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Lock body scroll while the drawer is open so iOS Safari + PWA
  // don't bleed scroll through the overlay. Without this, swiping
  // inside the drawer can scroll the underlying page, and the
  // initial open can force-scroll the body to the top -- both of
  // which we hit before this fix.
  useEffect(() => {
    if (!drawerLoading && !selectedAgent) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [drawerLoading, selectedAgent])

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
    if (!selectedAgent || selectedAgent.phase >= 6) return
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

  const agentUserIdOf = (a: typeof selectedAgent) =>
    a?.agentUser ? (a as unknown as { agentUserId?: string }).agentUserId ?? '' : ''

  const sendInvite = async () => {
    if (!selectedAgent) return
    setInviteLoading(true)
    setInviteMsg('')
    const res = await fetch('/api/admin/agents/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentUserId: agentUserIdOf(selectedAgent) }),
    })
    const data = await res.json() as { emailSent?: boolean; emailError?: string; error?: string }
    setInviteMsg(data.emailSent ? 'Invite sent!' : (data.emailError ?? data.error ?? 'Failed'))
    setInviteLoading(false)
  }

  const sendInviteSms = async () => {
    if (!selectedAgent) return
    setInviteLoading(true)
    setInviteMsg('')
    const res = await fetch('/api/admin/agents/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentUserId: agentUserIdOf(selectedAgent), channel: 'sms' }),
    })
    const data = await res.json() as { smsSent?: boolean; smsError?: string; error?: string }
    setInviteMsg(data.smsSent ? 'Text sent!' : (data.smsError ?? data.error ?? 'Failed'))
    setInviteLoading(false)
  }

  // Debounce search — wait 400ms after typing stops before fetching
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(1)
  }

  const displayedAgents = (() => {
    let list = agents
    if (readyToPromoteOnly) list = list.filter(a => a.readyForPromotion)
    if (atRiskOnly) {
      list = list.filter(a => {
        const s = getAtRiskStatus(a.phase, a.phaseStartedAt ? new Date(a.phaseStartedAt) : null, a.phaseCompleted, a.phaseTotal)
        return s !== 'on-track'
      })
    }
    if (flaggedCoachingOnly) list = list.filter(a => a.openCoachingFlags > 0)

    if (sortCol) {
      list = [...list].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        let va: number | string = 0
        let vb: number | string = 0
        switch (sortCol) {
          case 'name':      va = `${a.lastName} ${a.firstName}`; vb = `${b.lastName} ${b.firstName}`; break
          case 'state':     va = a.state ?? ''; vb = b.state ?? ''; break
          case 'phase':     va = a.phase; vb = b.phase; break
          case 'progress':  va = a.phaseTotal > 0 ? a.phaseCompleted / a.phaseTotal : 0; vb = b.phaseTotal > 0 ? b.phaseCompleted / b.phaseTotal : 0; break
          case 'days':      va = a.phaseStartedAt ? Date.now() - new Date(a.phaseStartedAt).getTime() : -1; vb = b.phaseStartedAt ? Date.now() - new Date(b.phaseStartedAt).getTime() : -1; break
          case 'carriers':  va = a.carriersAppointed; vb = b.carriersAppointed; break
          case 'callScore': va = a.callScore30d ?? -1; vb = b.callScore30d ?? -1; break
          case 'trainer':   va = a.cft ?? ''; vb = b.cft ?? ''; break
          case 'recruiter': va = a.recruiterName ?? ''; vb = b.recruiterName ?? ''; break
          case 'onboarded': va = a.icaDate ?? a.createdAt; vb = b.icaDate ?? b.createdAt; break
          case 'status': {
            const order = { 'on-track': 0, 'behind': 1, 'at-risk': 2 }
            const sa = getAtRiskStatus(a.phase, a.phaseStartedAt ? new Date(a.phaseStartedAt) : null, a.phaseCompleted, a.phaseTotal)
            const sb = getAtRiskStatus(b.phase, b.phaseStartedAt ? new Date(b.phaseStartedAt) : null, b.phaseCompleted, b.phaseTotal)
            va = order[sa]; vb = order[sb]; break
          }
        }
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
        if (!va && vb) return 1
        if (va && !vb) return -1
        return String(va).localeCompare(String(vb)) * dir
      })
    } else {
      // Default: promotion-ready first, then by most recently created
      list = [...list].sort((a, b) => (b.readyForPromotion ? 1 : 0) - (a.readyForPromotion ? 1 : 0))
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
            {/* Ready to Promote */}
            <div
              onClick={() => {
                const next = !readyToPromoteOnly
                setReadyToPromoteOnly(next)
                if (next) { setNewThisMonthOnly(false); setAtRiskOnly(false); setFlaggedCoachingOnly(false) }
                setPage(1)
              }}
              style={{
                background: readyToPromoteOnly ? 'rgba(201,169,110,0.1)' : '#142D48',
                border: `1px solid ${readyToPromoteOnly ? 'rgba(201,169,110,0.3)' : 'rgba(201,169,110,0.08)'}`,
                borderRadius: 6, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>Ready to Promote</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#C9A96E', lineHeight: 1, marginBottom: 4 }}>{(stats as DashStats & { readyToPromoteCount?: number }).readyToPromoteCount ?? 0}</div>
              <div style={{ fontSize: 11, color: readyToPromoteOnly ? '#C9A96E' : '#4B5563' }}>
                {readyToPromoteOnly ? '✕ clear filter' : 'click to filter'}
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
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>New (30 Days)</div>
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
                    New Agents / {trendGranularity === 'day' ? 'Day' : trendGranularity === 'week' ? 'Week' : 'Month'}
                  </div>
                  {trendData.length > 0 && (
                    <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                      {trendData.reduce((s, d) => s + d.newAgents, 0)} agents in period
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {(['3m', '6m', '12m', 'mtd', 'ytd', 'all'] as Preset[]).map(p => (
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
                      {p === 'all' ? 'All' : p === 'mtd' ? 'MTD' : p.toUpperCase()}
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
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ width: 160 }}>
                    <DatePicker value={customStart} onChange={setCustomStart} placeholder="Start" />
                  </div>
                  <span style={{ color: '#4B5563', fontSize: 12 }}>→</span>
                  <div style={{ width: 160 }}>
                    <DatePicker value={customEnd} onChange={setCustomEnd} placeholder="End" />
                  </div>
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
          {[1,2,3,4,5,6].map(n => (
            <option key={n} value={n}>Phase {n} — {PHASE_LABELS[n].title}</option>
          ))}
        </select>
        <select style={selectStyle} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="referral_partner">Referral Partner</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: atRiskOnly ? '#f87171' : '#9BB0C4', cursor: 'pointer', padding: '7px 12px', background: atRiskOnly ? 'rgba(248,113,113,0.08)' : 'transparent', border: `1px solid ${atRiskOnly ? 'rgba(248,113,113,0.3)' : 'rgba(201,169,110,0.15)'}`, borderRadius: 4 }}>
          <input type="checkbox" checked={atRiskOnly} onChange={e => setAtRiskOnly(e.target.checked)} style={{ accentColor: '#f87171' }} />
          At-Risk Only
        </label>
        {recruiterOptions.length > 0 && (
          <RecruiterTypeahead
            options={recruiterOptions}
            value={recruiterFilter}
            onChange={v => { setRecruiterFilter(v); setPage(1) }}
          />
        )}
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
          marginBottom: 16, borderRadius: 6,
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.2)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#f59e0b',
              background: 'rgba(245,158,11,0.15)', padding: '3px 10px',
              borderRadius: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{promotionRequests.length}</span>
            <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>
              Promotion Request{promotionRequests.length > 1 ? 's' : ''} Pending
            </span>
          </div>
          {promotionRequests.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 20px', borderTop: '1px solid rgba(245,158,11,0.1)',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div>
                <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>{r.agentName}</span>
                <span style={{ fontSize: 11, color: '#6B8299', marginLeft: 8 }}>
                  {r.phaseItemKey === 'emd_signoff'
                    ? 'EMD Sign-Off'
                    : r.phaseItemKey === 'associate_promotion'
                      ? 'Senior Associate Promotion'
                      : 'Promotion Request'}
                  {' · requested '}{new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/vault/promotion-requests', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ requestId: r.id, action: 'approve' }),
                    })
                    if (res.ok) {
                      setPromotionRequests(prev => prev.filter(p => p.id !== r.id))
                      fetchAgents()
                    }
                  }}
                  style={{
                    padding: '6px 18px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: '#4ade80', border: 'none', color: '#0A1628', cursor: 'pointer',
                  }}
                >Approve</button>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/vault/promotion-requests', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ requestId: r.id, action: 'reject' }),
                    })
                    if (res.ok) {
                      setPromotionRequests(prev => prev.filter(p => p.id !== r.id))
                    }
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
                    color: '#f87171', cursor: 'pointer',
                  }}
                >Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Agent table ── */}
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.08)',
        borderRadius: 6, overflow: 'hidden',
      }}>
        {/* Search bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(201,169,110,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, agent code, or email..."
            style={{
              flex: 1, background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
              borderRadius: 4, color: '#d1d9e2', padding: '10px 14px', fontSize: 13,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', color: '#6B8299', fontSize: 14, cursor: 'pointer', padding: '4px 8px' }}
            >✕</button>
          )}
          <span style={{ fontSize: 10, color: '#4B5563', flexShrink: 0 }}>{displayedAgents.length} agent{displayedAgents.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 1240, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(12,30,48,0.8)' }}>
              {([
                { label: 'Agent', col: 'name' },
                { label: 'State', col: 'state' },
                { label: 'Phase', col: 'phase' },
                { label: 'Progress', col: 'progress' },
                { label: 'Days', col: 'days' },
                { label: 'Carriers', col: 'carriers' },
                { label: 'Call Score', col: 'callScore' },
                { label: 'Trainer', col: 'trainer' },
                { label: 'Recruiter', col: 'recruiter' },
                { label: 'Onboarded', col: 'onboarded' },
                { label: 'Status', col: 'status' },
                { label: '', col: '' },
              ] as { label: string; col: string }[]).map(({ label, col }) => (
                <th
                  key={label || '__arrow'}
                  onClick={col ? () => handleSort(col) : undefined}
                  style={{
                    padding: '11px 16px', textAlign: 'left',
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: sortCol === col && col ? '#ffffff' : '#C9A96E',
                    borderBottom: '1px solid rgba(201,169,110,0.1)',
                    cursor: col ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {label}
                    {col && label && (
                      <span style={{ fontSize: 7, opacity: sortCol === col ? 1 : 0.3 }}>
                        {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  {[...Array(12)].map((_, j) => (
                    <td key={j} style={{ padding: '14px 16px' }}>
                      <div style={{ height: 11, background: 'rgba(255,255,255,0.04)', borderRadius: 4, width: `${40 + Math.random() * 40}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayedAgents.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: '60px 16px', textAlign: 'center', color: '#6B8299', fontSize: 13 }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AgentAvatar
                          avatarUrl={agent.avatarUrl}
                          firstName={agent.firstName}
                          lastName={agent.lastName}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>
                              {agent.firstName} {agent.lastName}
                            </span>
                            {agent.phone && (
                              <a
                                href={`sms:${agent.phone.replace(/\D/g, '')}`}
                                onClick={e => e.stopPropagation()}
                                title={`Text ${agent.firstName}: ${agent.phone}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 20, height: 20, borderRadius: 4,
                                  background: 'rgba(74,222,128,0.08)',
                                  border: '1px solid rgba(74,222,128,0.2)',
                                  color: '#4ade80', fontSize: 10,
                                  textDecoration: 'none', flexShrink: 0,
                                  transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,222,128,0.2)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,222,128,0.08)')}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              </a>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <div style={{ fontSize: 10, color: '#6B8299', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                              {agent.agentCode}
                              {agent.email && <>{' · '}<span>{agent.email}</span></>}
                            </div>
                            {agent.email && <CopyButton value={agent.email} size={12} />}
                          </div>
                        </div>
                      </div>
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
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#9BB0C4', whiteSpace: 'nowrap' }}>
                      {agent.recruiterName ?? (agent.recruiterCode ? agent.recruiterCode : '—')}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#9BB0C4', whiteSpace: 'nowrap' }}>
                      {agent.icaDate
                        ? new Date(agent.icaDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
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
          onClick={e => { if (e.target === e.currentTarget) closeDrawer() }}
        >
          <div style={{
            width: 'min(540px, 100vw)', height: '100%', overflow: 'auto',
            background: '#0C1E30',
            borderLeft: '1px solid rgba(201,169,110,0.15)',
            // iOS PWA puts position:fixed elements under the notch/
            // status bar. Bumping padding-top by env(safe-area-inset-top)
            // pushes the drawer header (close button, agent name,
            // Trading Card / View Portal pills) below the status bar.
            // Same for the bottom -- home-indicator iPhones reserve
            // ~34px there that the drawer was overlapping.
            padding: 'clamp(16px, 4vw, 32px)',
            paddingTop: 'calc(clamp(16px, 4vw, 32px) + env(safe-area-inset-top))',
            paddingBottom: 'calc(clamp(16px, 4vw, 32px) + env(safe-area-inset-bottom))',
          }}>
            {drawerLoading ? (
              <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
            ) : selectedAgent ? (
              <AgentDrawer
                agent={selectedAgent}
                onAdvancePhase={advancePhase}
                onUpdateCarrier={updateCarrier}
                onSendInvite={sendInvite}
                onTextInvite={sendInviteSms}
                onToggleStatus={toggleStatus}
                onDelete={deleteAgent}
                deleteConfirm={deleteConfirm}
                onDeleteConfirmChange={setDeleteConfirm}
                inviteLoading={inviteLoading}
                inviteMsg={inviteMsg}
                trainers={trainers}
                onClose={closeDrawer}
                onOpenCard={setCardCode}
                initialTab={(searchParams.get('tab') as TabKey) ?? undefined}
                onTabChange={tab => updateUrl(selectedAgent?.id ?? null, tab)}
                livePhaseItems={livePhaseItems}
                livePhaseGroups={livePhaseGroups}
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

      {/* ── Trading card modal ── */}
      {cardCode && (
        <AgentTradingCardModal
          agentCode={cardCode}
          onClose={() => setCardCode(null)}
        />
      )}
    </div>
  )
}

// Tiny avatar used in the agent list rows. Falls back to initials in
// a gold-tinted circle when the agent hasn't uploaded a headshot yet.
function AgentAvatar({ avatarUrl, firstName, lastName, size = 32 }: { avatarUrl: string | null; firstName: string; lastName: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'rgba(201,169,110,0.12)',
      border: '1px solid rgba(201,169,110,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.32), fontWeight: 700, color: '#C9A96E',
      letterSpacing: '0.04em',
    }}>
      {!avatarUrl && `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()}
    </div>
  )
}

// ─── Agent Drawer ──────────────────────────────────────────────────────────────

const TABS = ['progress', 'carriers', 'calls', 'info', 'edit'] as const
type TabKey = typeof TABS[number]

function AgentDrawer({
  agent,
  onAdvancePhase,
  onUpdateCarrier,
  onSendInvite,
  onTextInvite,
  onToggleStatus,
  onDelete,
  deleteConfirm,
  onDeleteConfirmChange,
  inviteLoading,
  inviteMsg,
  trainers,
  onClose,
  onOpenCard,
  initialTab,
  onTabChange,
  livePhaseItems,
  livePhaseGroups,
}: {
  agent: DetailedAgent
  onAdvancePhase: () => void
  onUpdateCarrier: (carrier: string, status: string, producerNumber: string) => void
  onSendInvite: () => void
  onTextInvite: () => void
  onToggleStatus: () => void
  onDelete: () => void
  deleteConfirm: boolean
  onDeleteConfirmChange: (v: boolean) => void
  inviteLoading: boolean
  inviteMsg: string
  trainers: string[]
  onOpenCard: (code: string) => void
  onClose: () => void
  initialTab?: TabKey
  onTabChange?: (tab: TabKey) => void
  livePhaseItems?: Record<number, typeof PHASE_ITEMS[1]> | null
  livePhaseGroups?: Record<number, typeof PHASE_GROUPS[1]> | null
}) {
  const [activeTab, setActiveTabRaw] = useState<TabKey>(initialTab && (TABS as readonly string[]).includes(initialTab) ? initialTab : 'progress')
  const setActiveTab = (tab: TabKey) => {
    setActiveTabRaw(tab)
    onTabChange?.(tab)
  }
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
    const snapshot = localPhaseItems
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
      const res = await fetch(`/api/admin/agents/${agent.id}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey, phase, completed }),
      })
      if (!res.ok) setLocalPhaseItems(snapshot)
    } catch {
      setLocalPhaseItems(snapshot)
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
    // Detail endpoint nests email under agentUser; list endpoint
    // flattens it to top-level. Fall through both so the form
    // populates regardless of which entry point loaded the agent.
    email: agent.email ?? agent.agentUser?.email ?? '',
    phone: (agent.phone ?? '').replace(/\.0+$/, ''),
    state: agent.state ?? '',
    phase: agent.phase ?? 1,
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
    isTest: agent.isTest ?? false,
    isLeadership: agent.isLeadership ?? false,
    isReferralPartner: agent.isReferralPartner ?? false,
    vipArrival: agent.vipArrival ?? false,
    vipArrivalTitle: agent.vipArrivalTitle ?? '',
    partnerAgentProfileId: agent.partnerAgentProfileId ?? '',
    partnerDisplayName: agent.partnerDisplayName ?? '',
    coupleDisplayName: agent.coupleDisplayName ?? '',
    coupleAvatarUrl: agent.coupleAvatarUrl ?? '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editSaved, setEditSaved] = useState(false)
  const [editError, setEditError] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(agent.avatarUrl)

  const compressImage = (file: File, maxSize = 1024): Promise<File> => {
    return new Promise((resolve) => {
      if (file.size <= maxSize * 1024) { resolve(file); return }
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const scale = Math.min(1, Math.sqrt((maxSize * 1024) / file.size))
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          resolve(new File([blob!], file.name, { type: 'image/jpeg' }))
        }, 'image/jpeg', 0.85)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  const uploadAdminAvatar = async (file: File) => {
    setAvatarUploading(true)
    try {
      const compressed = await compressImage(file, 2048)
      const fd = new FormData()
      fd.append('avatar', compressed)
      const res = await fetch(`/api/admin/agents/${agent.id}/avatar`, { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        const errMsg = text.startsWith('{') ? (JSON.parse(text) as { error?: string }).error : `Upload failed (${res.status})`
        alert(errMsg ?? 'Upload failed. Try a smaller image.')
        setAvatarUploading(false)
        return
      }
      const d = await res.json() as { ok?: boolean; avatarUrl?: string }
      if (d.avatarUrl) setAvatarPreview(d.avatarUrl)
    } catch {
      alert('Upload failed. Please try again.')
    }
    setAvatarUploading(false)
  }

  const saveEdit = async () => {
    setEditSaving(true); setEditError(''); setEditSaved(false)
    try {
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
          vipArrivalTitle: editForm.vipArrivalTitle || null,
        }),
      })
      if (!res.ok) {
        // Server crashed or returned a non-JSON error page — fall back to
        // raw text so the form doesn't hang on a parse error. Without
        // this, an HTML 500 from Vercel makes res.json() throw and the
        // outer catch loses the actual cause.
        const text = await res.text().catch(() => '')
        let parsed: { error?: string } | null = null
        try { parsed = JSON.parse(text) as { error?: string } } catch { /* not JSON */ }
        setEditError(parsed?.error ?? text.slice(0, 200) ?? `Save failed (${res.status})`)
      } else {
        setEditSaved(true)
        setTimeout(() => setEditSaved(false), 3000)
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setEditSaving(false)
    }
  }

  const riskStatus = getAtRiskStatus(
    agent.phase,
    agent.phaseStartedAt ? new Date(agent.phaseStartedAt) : null,
    agent.phaseItems.filter(i => i.phase === agent.phase && i.completed).length,
    (livePhaseItems ?? PHASE_ITEMS)[agent.phase]?.length ?? 0
  )

  const phasePct = (livePhaseItems ?? PHASE_ITEMS)[agent.phase]?.length
    ? Math.round((agent.phaseItems.filter(i => i.phase === agent.phase && i.completed).length / ((livePhaseItems ?? PHASE_ITEMS)[agent.phase]?.length ?? 1)) * 100)
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
              {agent.agentCode} &middot; {agent.state ?? 'No state'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {(agent.email ?? agent.agentUser?.email) && (() => {
                const email = agent.email ?? agent.agentUser?.email ?? ''
                return (
                  <a
                    href={`mailto:${email}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', textDecoration: 'none' }}
                  >
                    <span style={{ color: '#60a5fa' }}>{email}</span>
                    <CopyButton value={email} size={11} />
                  </a>
                )
              })()}
              {agent.phone && (() => {
                const raw = agent.phone.replace(/\D/g, '')
                const display = raw.length === 10
                  ? `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`
                  : raw.length === 11
                    ? `+${raw[0]} (${raw.slice(1, 4)}) ${raw.slice(4, 7)}-${raw.slice(7)}`
                    : agent.phone
                return (
                  <a
                    href={`tel:${raw}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', textDecoration: 'none' }}
                  >
                    <span style={{ color: '#4ade80' }}>{display}</span>
                    <CopyButton value={agent.phone} size={11} />
                  </a>
                )
              })()}
            </div>
            {/* Recruiter + join date row. Both are editable in the
                Edit tab; surfacing them in the header gives admins
                instant context (who's accountable for this agent +
                how long they've been with us) without an extra click. */}
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span>
                <span style={{ color: '#4B5563' }}>Recruited by</span>{' '}
                {agent.recruiter
                  ? <span style={{ color: '#9BB0C4' }}>{agent.recruiter.firstName} {agent.recruiter.lastName} <span style={{ color: '#4B5563' }}>({agent.recruiter.agentCode})</span></span>
                  : agent.recruiterId
                    ? <span style={{ color: '#9BB0C4' }}>{agent.recruiterId}</span>
                    : <span style={{ color: '#4B5563', fontStyle: 'italic' }}>not set</span>}
              </span>
              <span>
                <span style={{ color: '#4B5563' }}>Joined</span>{' '}
                {agent.icaDate
                  ? <span style={{ color: '#9BB0C4' }}>{new Date(agent.icaDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  : <span style={{ color: '#4B5563', fontStyle: 'italic' }}>not set</span>}
              </span>
              <span title={agent.agentUser?.lastLoginAt ? new Date(agent.agentUser.lastLoginAt).toLocaleString() : 'Has never signed in to the portal'}>
                <span style={{ color: '#4B5563' }}>Last login</span>{' '}
                {agent.agentUser?.lastLoginAt
                  ? <span style={{ color: '#9BB0C4' }}>{formatRelativeLogin(agent.agentUser.lastLoginAt)}</span>
                  : <span style={{ color: '#4B5563', fontStyle: 'italic' }}>never</span>}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={async () => {
              const res = await fetch('/api/admin/agents/preview-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentProfileId: agent.id }),
              })
              if (res.ok) {
                const { token } = await res.json() as { token: string }
                window.open(`/agents?preview=${token}`, '_blank')
              }
            }}
            title="View this agent's portal (read-only, 5-min link)"
            style={{
              background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)',
              color: '#9B6DFF', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer', borderRadius: 4,
              padding: '6px 10px', whiteSpace: 'nowrap',
            }}
          >
            View Portal
          </button>
          <button
            onClick={() => onOpenCard(agent.agentCode)}
            title="Open the agent's trading card with stats + downloadable PNG"
            style={{
              background: 'rgba(201,169,110,0.10)', border: '1px solid rgba(201,169,110,0.35)',
              color: '#C9A96E', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer', borderRadius: 4,
              padding: '6px 10px', whiteSpace: 'nowrap',
            }}
          >
            Trading Card
          </button>
          <button
            onClick={async () => {
              const name = `${agent.firstName} ${agent.lastName}`
              const ok = confirm(`Send a password reset link to ${name} at ${agent.agentUser?.email}?\n\nThe agent will receive an email with a button that lets them choose a new password. The link is valid for 72 hours and their current password stays active until they use it.`)
              if (!ok) return
              const res = await fetch('/api/admin/agents/send-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentProfileId: agent.id }),
              })
              const d = await res.json().catch(() => ({})) as { emailSent?: boolean; emailError?: string; error?: string }
              if (!res.ok) {
                alert(`Couldn't send the reset link: ${d.error ?? `HTTP ${res.status}`}`)
                return
              }
              if (d.emailSent) {
                alert(`Reset link sent to ${agent.agentUser?.email}.`)
              } else {
                alert(`Token generated but email failed to send${d.emailError ? `: ${d.emailError}` : '.'}\nYou can resend in a moment.`)
              }
            }}
            title="Email this agent a link to choose a new password. Their current password stays active until they use the link."
            style={{
              background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.35)',
              color: '#60A5FA', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer', borderRadius: 4,
              padding: '6px 10px', whiteSpace: 'nowrap',
            }}
          >
            Reset Password
          </button>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9BB0C4', fontSize: 14, cursor: 'pointer', width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Internal notes — admin-only conversation log. Pinned to the top
          so the LC / admin sees recent context the moment they open the
          drawer (e.g. "called him 4/27, said his wife wants to see the
          IUL illustration before signing"). */}
      <InternalNotesSection agentProfileId={agent.id} />

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
        {/* Re-announce the agent's current-phase promotion as a Discord
            card. Useful for backfilling promotions that landed as plain
            text under the old code path (anything pre-card-family).
            Hidden for Phase 1 since there's no promotion to celebrate
            from there. */}
        {agent.phase > 1 && <PromotionReannounceButton agentId={agent.id} phase={agent.phase} />}
        {/* Re-fire the public NEW BUSINESS PARTNER card for this agent.
            Useful when Tevah created the agent before the auto-announce
            wiring shipped, or when the recruiter got set manually after
            creation. Visible for every agent; the endpoint returns a
            clear error if there's no recruiter to credit. */}
        <JoinReannounceButton agentId={agent.id} agentName={`${agent.firstName} ${agent.lastName}`} />
        {/* Red carpet. Self-hides unless this profile's VIP Arrival
            toggle (in the edit drawer) is on. */}
        <VipArrivalButton agentId={agent.id} vipArrival={agent.vipArrival ?? false} />
      </div>

      {/* Invite — email or SMS text (same 72h link, sent via GHL) */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <button
          onClick={onTextInvite}
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
          {inviteLoading ? 'Sending...' : 'Text Invite Link'}
        </button>
        {inviteMsg && (
          <span style={{ fontSize: 12, color: (inviteMsg === 'Invite sent!' || inviteMsg === 'Text sent!') ? '#4ade80' : '#f87171' }}>
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
            {[1, 2, 3, 4, 5, 6].map(ph => {
              const items = (livePhaseItems ?? PHASE_ITEMS)[ph] ?? []
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
              const allItems = (livePhaseItems ?? PHASE_ITEMS)[drawerChecklistPhase] ?? []
              const groups = (livePhaseGroups ?? PHASE_GROUPS)[drawerChecklistPhase] ?? []

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
          {/* Surface the agent's curated picks so the LC knows which carriers
              the agent actually wants to work with vs the full library. */}
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              Agent&apos;s selected carriers ({agent.selectedCarriers.length})
            </div>
            <div style={{ fontSize: 11, color: agent.selectedCarriers.length === 0 ? '#6B8299' : '#9BB0C4' }}>
              {agent.selectedCarriers.length === 0
                ? 'Agent hasn’t curated their list yet. They see only their active appointments.'
                : agent.selectedCarriers.join(', ')}
            </div>
          </div>
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
            {/* QA / test account flag. Surfaced at the top because it
                materially changes whether this profile shows up in any
                roster-facing view (admin matrix, agent leaderboard).
                Persists with the rest of the edit form on Save. */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 4,
              background: editForm.isTest ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
              border: editForm.isTest ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={editForm.isTest}
                onChange={e => setEditForm(f => ({ ...f, isTest: e.target.checked }))}
                style={{ flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: editForm.isTest ? '#f59e0b' : '#9BB0C4', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Test Account
                </div>
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                  Hides this agent from the admin progression matrix and the
                  agent-facing leaderboard. Login + features still work
                  normally for QA.
                </div>
              </div>
            </label>

            {/* Leadership flag. Vick / Melinee carry AgentProfiles
                so they can be assigned policies, BPs, etc., but
                they're operating as staff — checking this hides
                them from the production leaderboard and rolls their
                recruits into the synthetic 'Vick & Melinee' row on
                the recruits leaderboard. */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 4,
              background: editForm.isLeadership ? 'rgba(201,169,110,0.08)' : 'rgba(255,255,255,0.02)',
              border: editForm.isLeadership ? '1px solid rgba(201,169,110,0.3)' : '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={editForm.isLeadership}
                onChange={e => setEditForm(f => ({ ...f, isLeadership: e.target.checked }))}
                style={{ flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: editForm.isLeadership ? '#C9A96E' : '#9BB0C4', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  AFF Leadership
                </div>
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                  Marks this profile as a leadership user (Vick, Melinee, founders). Hides from production leaderboard. Recruits roll up to the &lsquo;Vick &amp; Melinee&rsquo; bundle on the recruits leaderboard.
                </div>
              </div>
            </label>

            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 4,
              background: editForm.isReferralPartner ? 'rgba(100,149,237,0.08)' : 'rgba(255,255,255,0.02)',
              border: editForm.isReferralPartner ? '1px solid rgba(100,149,237,0.3)' : '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={editForm.isReferralPartner}
                onChange={e => setEditForm(f => ({ ...f, isReferralPartner: e.target.checked }))}
                style={{ flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: editForm.isReferralPartner ? '#6495ED' : '#9BB0C4', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Referral Partner
                </div>
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                  Referral-only partner. Still receives welcome email and can be split on new business, but won&apos;t receive task reminders.
                </div>
              </div>
            </label>

            {/* One-off red carpet. When on: the "Announce VIP Arrival"
                button appears on this profile (posts a bespoke gold card
                to #announcements, no brand/metrics, nudges Vick + Melinee
                to greet them) and a one-time welcome modal pops the first
                time they sign into the portal. Flip off to retire both. */}
            <div style={{
              padding: '10px 12px', borderRadius: 4,
              background: editForm.vipArrival ? 'rgba(216,184,96,0.10)' : 'rgba(255,255,255,0.02)',
              border: editForm.vipArrival ? '1px solid rgba(216,184,96,0.45)' : '1px solid rgba(255,255,255,0.05)',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editForm.vipArrival}
                  onChange={e => setEditForm(f => ({ ...f, vipArrival: e.target.checked }))}
                  style={{ flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: editForm.vipArrival ? '#D8B860' : '#9BB0C4', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    ✦ VIP Arrival
                  </div>
                  <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                    Rolls out the red carpet for a distinguished guest. Adds an &ldquo;Announce VIP Arrival&rdquo; button below and a one-time welcome when they first sign into the portal. Turn off to retire both.
                  </div>
                </div>
              </label>
              {editForm.vipArrival && (
                <input
                  value={editForm.vipArrivalTitle}
                  onChange={e => setEditForm(f => ({ ...f, vipArrivalTitle: e.target.value }))}
                  placeholder="Title line, e.g. Co-Founder, GFI"
                  style={{
                    marginTop: 10, width: '100%', boxSizing: 'border-box',
                    background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(216,184,96,0.35)',
                    color: '#F4ECDA', borderRadius: 4, padding: '8px 10px', fontSize: 12,
                  }}
                />
              )}
            </div>

            {/* Power-couple pairing. Two flavors:
                  - Both partners on platform (the typical 'Joey &
                    Jen' producing duo): pick the partner from the
                    AgentTypeahead. We auto-sync the reciprocal
                    pointer on save so both rows reference each
                    other.
                  - Partner is admin-only / off-platform (Vick +
                    admin Melinee): leave the partner field blank
                    and just fill in the Partner Display Name +
                    Couple Display Name.
                Couple Display Name is what shows on the leaderboard
                ('Joey & Jen', 'The Garcia's'). Couple photo is
                optional — a joint headshot used by the leaderboard
                renderer instead of the solo avatar. */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: '12px 14px', borderRadius: 4,
              background: 'rgba(201,169,110,0.04)',
              border: '1px solid rgba(201,169,110,0.18)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#C9A96E', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Power Couple
              </div>
              <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.55 }}>
                Pair this agent with their producing partner. Combined stats show as one row on the leaderboard.
              </div>
              <div>
                <div style={sLabel}>Partner (on-platform agent, optional)</div>
                <AgentTypeahead
                  valueField="id"
                  value={editForm.partnerAgentProfileId}
                  onChange={v => setEditForm(f => ({ ...f, partnerAgentProfileId: v }))}
                  placeholder="Pick partner agent, or leave blank for off-platform partner"
                  includeFormer
                />
              </div>
              <div>
                <div style={sLabel}>Partner display name (if off-platform)</div>
                <input
                  type="text"
                  value={editForm.partnerDisplayName}
                  onChange={e => setEditForm(f => ({ ...f, partnerDisplayName: e.target.value }))}
                  placeholder="e.g. Melinee Minhas"
                  style={iStyle}
                />
              </div>
              <div>
                <div style={sLabel}>Couple display name (shown on leaderboard)</div>
                <input
                  type="text"
                  value={editForm.coupleDisplayName}
                  onChange={e => setEditForm(f => ({ ...f, coupleDisplayName: e.target.value }))}
                  placeholder="e.g. Joey & Jen, The Garcia's, Vick & Melinee"
                  style={iStyle}
                />
              </div>
              <div>
                <div style={sLabel}>Couple photo URL (optional)</div>
                <input
                  type="text"
                  value={editForm.coupleAvatarUrl}
                  onChange={e => setEditForm(f => ({ ...f, coupleAvatarUrl: e.target.value }))}
                  placeholder="https://… (joint headshot)"
                  style={iStyle}
                />
              </div>
            </div>

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

            {/* Phase — direct picker so admins can jump straight to a
                phase (e.g. setting Vick to 6) instead of clicking
                Advance N times. PHASE_LABELS keys this; the API
                allowlist already accepts 'phase'. */}
            <div>
              <label style={lStyle}>Phase</label>
              <select
                value={editForm.phase}
                onChange={e => setEditForm(f => ({ ...f, phase: parseInt(e.target.value, 10) }))}
                style={{ ...iStyle, appearance: 'auto' }}
              >
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>
                    Phase {n}{PHASE_LABELS[n]?.title ? ` — ${PHASE_LABELS[n].title}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div>
              <label style={lStyle}>Email</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                <input type="email" value={editForm.email} onChange={set('email')} style={iStyle} />
                <EmailButton email={editForm.email} />
              </div>
            </div>

            {/* Contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lStyle}>Phone</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                  <input value={editForm.phone} onChange={set('phone')} placeholder="e.g. (555) 555-5555" style={iStyle} />
                  <CallButton phone={editForm.phone} />
                </div>
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
                <DatePicker value={editForm.icaDate} onChange={v => setEditForm(f => ({ ...f, icaDate: v }))} />
              </div>
              <div>
                <label style={lStyle}>Date of Birth</label>
                <DatePicker value={editForm.dateOfBirth} onChange={v => setEditForm(f => ({ ...f, dateOfBirth: v }))} max={new Date().toISOString().slice(0, 10)} initialView="years" />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <label style={{ ...lStyle, marginBottom: 0 }}>Trainer (CFT)</label>
                  {editForm.recruiterId && (
                    <button
                      type="button"
                      title="Auto-fill trainer from recruiter chain"
                      onClick={() => {
                        fetch(`/api/admin/agents/resolve-trainer?recruiterCode=${encodeURIComponent(editForm.recruiterId)}`)
                          .then(r => r.ok ? r.json() as Promise<{ trainerName: string | null }> : null)
                          .then(d => {
                            if (d?.trainerName) setEditForm(f => ({ ...f, cft: d.trainerName! }))
                          })
                          .catch(() => {})
                      }}
                      style={{
                        background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)',
                        color: '#C9A96E', borderRadius: 4, padding: '1px 7px', fontSize: 9,
                        fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Auto-fill
                    </button>
                  )}
                </div>
                <AgentTypeahead
                  value={editForm.cft}
                  valueField="displayName"
                  placeholder="Search trainers..."
                  minPhase={3}
                  onChange={name => setEditForm(f => ({ ...f, cft: name }))}
                />
              </div>
              <div>
                <label style={lStyle}>Goal</label>
                <input value={editForm.goal} onChange={set('goal')} placeholder="MD, EMD…" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Recruiter</label>
                <AgentTypeahead
                  value={editForm.recruiterId}
                  valueField="agentCode"
                  placeholder="Search by name..."
                  onChange={code => setEditForm(f => ({ ...f, recruiterId: code }))}
                />
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

// ─── Internal Notes Section ───────────────────────────────────────────────────
// Pinned at the top of the agent drawer. Loads ADMIN_ONLY licensing
// notes (the LICENSING-scoped notes still appear on /vault/licensing
// where the LC works, so we don't double-list them here). Lets admins
// add a quick note to track conversations they've had with the agent.

interface InternalNote {
  id: string
  body: string
  scope: 'LICENSING' | 'ADMIN_ONLY'
  createdAt: string
  updatedAt?: string
  author: { id: string; name: string; role: string } | null
}

function InternalNotesSection({ agentProfileId }: { agentProfileId: string }) {
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch(`/api/vault/licensing-agents/${agentProfileId}/notes`)
      .then(r => r.ok ? r.json() : { notes: [] })
      .then((d: { notes: InternalNote[] }) => setNotes(d.notes ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [agentProfileId])

  useEffect(() => { refresh() }, [refresh])

  const adminNotes = notes.filter(n => n.scope === 'ADMIN_ONLY')
  const newest = adminNotes[0]

  const submit = async () => {
    const body = draft.trim()
    if (!body) return
    setSaving(true)
    try {
      const res = await fetch(`/api/vault/licensing-agents/${agentProfileId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, scope: 'ADMIN_ONLY' }),
      })
      if (res.ok) {
        setDraft('')
        refresh()
      }
    } finally { setSaving(false) }
  }

  const startEdit = (n: InternalNote) => {
    setEditingId(n.id)
    setEditBody(n.body)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditBody('')
  }

  const saveEdit = async (noteId: string) => {
    const body = editBody.trim()
    if (!body) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/vault/licensing-agents/${agentProfileId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, body }),
      })
      if (res.ok) {
        setEditingId(null)
        setEditBody('')
        refresh()
      }
    } finally { setSavingEdit(false) }
  }

  return (
    <div style={{
      marginBottom: 20,
      background: 'rgba(155,109,255,0.05)',
      border: '1px solid rgba(155,109,255,0.22)',
      borderRadius: 6,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9B6DFF' }}>
          Internal Notes &middot; admin only
        </div>
        {adminNotes.length > 1 && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', color: '#9B6DFF', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            {expanded ? `Hide history (${adminNotes.length})` : `History (${adminNotes.length})`}
          </button>
        )}
      </div>

      {/* New-note composer */}
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Log a conversation, set a reminder for next time, capture context for the team..."
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: '#0A1628', border: '1px solid rgba(155,109,255,0.25)',
          color: '#d1d9e2', borderRadius: 4, padding: '8px 10px',
          fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 56,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button
          onClick={submit}
          disabled={saving || draft.trim().length === 0}
          style={{
            background: '#9B6DFF', color: '#fff', border: 'none', borderRadius: 4,
            padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: saving || draft.trim().length === 0 ? 'not-allowed' : 'pointer',
            opacity: saving || draft.trim().length === 0 ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Add note'}
        </button>
      </div>

      {/* Latest note (always shown) + scrollable history when expanded.
          Capped at ~360px (≈4–5 notes, depending on length) so the
          drawer stays a manageable height even after dozens of notes
          accumulate; admins scroll within the section instead of the
          whole drawer growing unbounded. */}
      {!loading && adminNotes.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid rgba(155,109,255,0.15)',
          maxHeight: expanded ? 360 : undefined,
          overflowY: expanded ? 'auto' : 'visible',
          // Custom-tuned scrollbar so it reads as part of the purple
          // notes card rather than browser default.
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(155,109,255,0.4) transparent',
        }}>
          {(expanded ? adminNotes : (newest ? [newest] : [])).map(n => (
            <div key={n.id} style={{ marginBottom: 8, fontSize: 11, color: '#d1d9e2', lineHeight: 1.55 }}>
              <div style={{ color: '#9BB0C4', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 2 }}>
                {n.author?.name ?? 'Admin'} &middot; {new Date(n.createdAt).toLocaleString()}
                {n.updatedAt && new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 1000 && (
                  <span style={{ fontWeight: 400, fontStyle: 'italic', marginLeft: 6 }} title={`Edited ${new Date(n.updatedAt).toLocaleString()}`}>&middot; edited</span>
                )}
              </div>
              {editingId === n.id ? (
                <div>
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: '#0A1628', border: '1px solid rgba(155,109,255,0.35)',
                      color: '#d1d9e2', borderRadius: 4, padding: '8px 10px',
                      fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 56,
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                    <button
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      style={{
                        background: 'none', border: '1px solid rgba(107,130,153,0.4)', color: '#6B8299',
                        borderRadius: 4, padding: '4px 10px', fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(n.id)}
                      disabled={savingEdit || editBody.trim().length === 0}
                      style={{
                        background: '#9B6DFF', color: '#fff', border: 'none', borderRadius: 4,
                        padding: '4px 12px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        cursor: savingEdit || editBody.trim().length === 0 ? 'not-allowed' : 'pointer',
                        opacity: savingEdit || editBody.trim().length === 0 ? 0.6 : 1,
                      }}
                    >
                      {savingEdit ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{n.body}</div>
                  <button
                    onClick={() => startEdit(n)}
                    title="Edit this note"
                    style={{
                      flexShrink: 0, background: 'none', border: '1px solid rgba(155,109,255,0.35)',
                      color: '#9B6DFF', borderRadius: 4, padding: '2px 8px', fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
          {!expanded && adminNotes.length > 1 && (
            <div style={{ fontSize: 10, color: '#6B8299', fontStyle: 'italic' }}>
              {adminNotes.length - 1} earlier note{adminNotes.length - 1 === 1 ? '' : 's'} hidden &middot; tap History above to expand.
            </div>
          )}
        </div>
      )}
      {!loading && adminNotes.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#6B8299', fontStyle: 'italic' }}>
          No internal notes yet. Drop the first one to start building context.
        </div>
      )}
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
  // Tracking-only mode: creates the agent as INACTIVE for historical
  // downline visibility without seeding onboarding, sending an invite,
  // or pinging Discord. For ex-agents who left before the portal
  // existed and need to appear in someone's tree.
  const [trackingOnly, setTrackingOnly] = useState(false)
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
      body: JSON.stringify({ ...form, trackingOnly }),
    })
    const data = await res.json() as { ok?: boolean; error?: string; agentUserId?: string }
    if (!res.ok) { setError(data.error ?? 'Failed'); setLoading(false); return }
    // Skip the invite send for tracking-only profiles. They have a
    // synthetic email and no inviteToken; calling invite would either
    // 404 or send to nowhere.
    if (!trackingOnly) {
      await fetch('/api/admin/agents/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentUserId: data.agentUserId }),
      })
    }
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
          {/* Tracking-only toggle: when checked, the new profile is
              created as INACTIVE for historical / downline visibility
              only — no onboarding seeded, no invite email, no Discord
              ping. Used for ex-agents who left before the portal
              existed (or whose original record was lost) and need to
              appear in someone's tree. */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px',
            background: trackingOnly ? 'rgba(201,169,110,0.10)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${trackingOnly ? 'rgba(201,169,110,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 5,
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}>
            <input
              type="checkbox"
              checked={trackingOnly}
              onChange={e => setTrackingOnly(e.target.checked)}
              style={{ accentColor: '#C9A96E', marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: trackingOnly ? '#E0C485' : '#d1d9e2' }}>
                Tracking only (no onboarding, no invite)
              </div>
              <div style={{ fontSize: 10, color: '#6B8299', marginTop: 3, lineHeight: 1.5 }}>
                For ex-agents who left before the portal existed. Adds them as <strong>INACTIVE</strong> in the org tree, skips onboarding seeding, and sends no email or Discord ping.
              </div>
            </div>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={fieldLabel}>First Name *</label><input required style={inputStyle} value={form.firstName} onChange={set('firstName')} /></div>
            <div><label style={fieldLabel}>Last Name *</label><input required style={inputStyle} value={form.lastName} onChange={set('lastName')} /></div>
            <div>
              <label style={fieldLabel}>Email {trackingOnly ? '' : '*'}</label>
              <input
                required={!trackingOnly}
                type="email"
                style={inputStyle}
                value={form.email}
                onChange={set('email')}
                placeholder={trackingOnly ? 'Leave blank to auto-generate' : ''}
              />
            </div>
            <div><label style={fieldLabel}>Agent Code *</label><input required style={inputStyle} value={form.agentCode} onChange={set('agentCode')} placeholder="e.g. F2030" /></div>
            <div><label style={fieldLabel}>State</label>
              <select style={{ ...inputStyle, appearance: 'auto' }} value={form.state} onChange={set('state')}>
                <option value="">Select state</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={form.phone} onChange={set('phone')} /></div>
            <div><label style={fieldLabel}>ICA Date</label><DatePicker value={form.icaDate} onChange={v => setForm(f => ({ ...f, icaDate: v }))} /></div>
            <div>
              <label style={fieldLabel}>Recruiter</label>
              <AgentTypeahead
                value={form.recruiterId}
                valueField="agentCode"
                placeholder="Search by name (or leave empty for Vick & Melinee)"
                includeFormer={trackingOnly}
                onChange={code => {
                  setForm(f => ({ ...f, recruiterId: code }))
                  // Auto-fill trainer from the recruiter chain, but only if
                  // the trainer field is still empty (don't override a
                  // deliberately-set trainer).
                  if (code) {
                    fetch(`/api/admin/agents/resolve-trainer?recruiterCode=${encodeURIComponent(code)}`)
                      .then(r => r.ok ? r.json() as Promise<{ trainerName: string | null }> : null)
                      .then(d => {
                        if (d?.trainerName) setForm(f => ({ ...f, cft: f.cft || d.trainerName! }))
                      })
                      .catch(() => {})
                  }
                }}
                helperText={
                  form.recruiterId.trim()
                    ? <>Will be assigned under recruiter <strong style={{ color: '#C9A96E' }}>{form.recruiterId.trim().toUpperCase()}</strong>.</>
                    : <span style={{ color: '#C9A96E' }}>⚜ Will be assigned under <strong>Vick &amp; Melinee (Leadership)</strong>. This is the default for direct CEO/COO recruits.</span>
                }
              />
            </div>
            <div>
              <label style={fieldLabel}>Trainer (CFT)</label>
              <AgentTypeahead
                value={form.cft}
                valueField="displayName"
                placeholder="Search trainers..."
                minPhase={3}
                onChange={name => setForm(f => ({ ...f, cft: name }))}
                helperText={<>Phase 3+ agents only (CFT, MD, EMD). Auto-filled from recruiter chain.</>}
              />
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
  scoreBoosters?: Partial<Record<'opening' | 'discovery' | 'product' | 'objections' | 'closing' | 'tone', string>> | null
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
    outcome?: string | null
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
            scoreBoosters: viewing.scoreBoosters,
            flaggedForCoaching: viewing.flaggedForCoaching,
            adminNotes: viewing.adminNotes,
            discussedAt: viewing.discussedAt,
            reviewedAt: viewing.reviewedAt,
          } as CallReviewData}
          callDate={viewing.callLog.callDate}
          contactName={viewing.callLog.contactName}
          outcome={viewing.callLog.outcome}
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

function PromotionReannounceButton({ agentId, phase }: { agentId: string; phase: number }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const click = async () => {
    setState("sending")
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/announce-promotion`, { method: "POST" })
      setState(res.ok ? "sent" : "error")
      setTimeout(() => setState("idle"), 4000)
    } catch {
      setState("error")
    }
  }
  return (
    <button
      onClick={click}
      disabled={state === "sending"}
      title={`Post the PROMOTION card for Phase ${phase} to the Discord announcements channel`}
      style={{
        marginTop: 8, width: "100%",
        background: state === "sent" ? "rgba(74,222,128,0.10)" : state === "error" ? "rgba(248,113,113,0.10)" : "transparent",
        border: `1px solid ${state === "sent" ? "rgba(74,222,128,0.4)" : state === "error" ? "rgba(248,113,113,0.4)" : "rgba(155,109,255,0.3)"}`,
        color: state === "sent" ? "#4ADE80" : state === "error" ? "#f87171" : "#9B6DFF",
        borderRadius: 4, padding: "7px", fontSize: 10, fontWeight: 700,
        cursor: state === "sending" ? "wait" : "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
      }}
    >
      {state === "sending" ? "Posting..."
        : state === "sent" ? "✓ Card posted"
        : state === "error" ? "Failed, retry"
        : "Re-announce promotion to Discord"}
    </button>
  )
}

function JoinReannounceButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  // Fires POST /api/admin/agents/[id]/announce-join. The endpoint
  // returns 409 with a clear message when the agent has no recruiter
  // on file (no protagonist for the card); we surface that to the
  // admin instead of just showing a generic "failed" state.
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "no_recruiter">("idle")
  const click = async () => {
    setState("sending")
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/announce-join`, { method: "POST" })
      if (res.ok) {
        setState("sent")
      } else {
        const body = await res.json().catch(() => ({})) as { reason?: string }
        setState(body.reason === "no_recruiter" ? "no_recruiter" : "error")
      }
      setTimeout(() => setState("idle"), 5000)
    } catch {
      setState("error")
    }
  }
  const accent = state === "sent" ? "#4ADE80"
    : state === "error" ? "#f87171"
    : state === "no_recruiter" ? "#f59e0b"
    : "#C9A96E"
  return (
    <button
      onClick={click}
      disabled={state === "sending"}
      title={`Posts the public NEW BUSINESS PARTNER celebration card for ${agentName} to the #announcements Discord channel. The card credits their recruiter (their supervisor) as the protagonist and @-mentions them, so the whole team sees who shared the opportunity.`}
      style={{
        marginTop: 8, width: "100%",
        background: state === "sent" ? "rgba(74,222,128,0.10)"
          : state === "error" ? "rgba(248,113,113,0.10)"
          : state === "no_recruiter" ? "rgba(245,158,11,0.10)"
          : "transparent",
        border: `1px solid ${accent}40`,
        color: accent,
        borderRadius: 4, padding: "7px", fontSize: 10, fontWeight: 700,
        cursor: state === "sending" ? "wait" : "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
      }}
    >
      {state === "sending" ? "Posting..."
        : state === "sent" ? "✓ Card posted"
        : state === "error" ? "Failed, retry"
        : state === "no_recruiter" ? "Set recruiter first"
        : "Announce New Business Partner"}
    </button>
  )
}

// Red-carpet button. Renders only when the profile's own VIP Arrival
// toggle is on (set in the edit drawer), so it's invisible noise for
// every other agent. Two-click confirm because it fires an @everyone
// card. Untoggling VIP Arrival on the profile retires this button and
// the portal welcome together, no redeploy.
function VipArrivalButton({ agentId, vipArrival }: { agentId: string; vipArrival: boolean }) {
  const [armed, setArmed] = useState(false)
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")

  if (!vipArrival) return null

  const click = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return }
    setArmed(false)
    setState("sending")
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/announce-vip`, { method: "POST" })
      setState(res.ok ? "sent" : "error")
      setTimeout(() => setState("idle"), 5000)
    } catch {
      setState("error")
    }
  }

  const label = state === "sending" ? "Rolling out the carpet..."
    : state === "sent" ? "✓ Red carpet live"
    : state === "error" ? "Failed, retry"
    : armed ? "Tap again to confirm"
    : "✦ Announce VIP Arrival"

  return (
    <button
      onClick={click}
      disabled={state === "sending"}
      title="Posts the bespoke gold welcome card to #announcements (no brand, no metrics), seeds reactions, and privately nudges Vick + Melinee to greet him personally."
      style={{
        marginTop: 8, width: "100%",
        background: state === "sent" ? "rgba(201,168,76,0.16)"
          : state === "error" ? "rgba(248,113,113,0.10)"
          : armed ? "rgba(201,168,76,0.20)"
          : "rgba(201,168,76,0.06)",
        border: `1px solid ${state === "error" ? "rgba(248,113,113,0.4)" : "rgba(201,168,76,0.55)"}`,
        color: state === "error" ? "#f87171" : "#D8B860",
        borderRadius: 4, padding: "7px", fontSize: 10, fontWeight: 800,
        cursor: state === "sending" ? "wait" : "pointer",
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  )
}

function RecruiterTypeahead({ options, value, onChange }: {
  options: { agentCode: string; name: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.agentCode === value)
  const filtered = query.trim()
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()) || o.agentCode.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 180 }}>
      {value && selected ? (
        <div
          onClick={() => { setOpen(true); setQuery('') }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
            background: 'rgba(201,169,110,0.08)',
            border: '1px solid rgba(201,169,110,0.25)',
            fontSize: 12, color: '#C9A96E',
          }}
        >
          <span style={{ fontWeight: 600 }}>{selected.name}</span>
          <button
            onClick={e => { e.stopPropagation(); onChange(''); setQuery('') }}
            style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 13, cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      ) : (
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Filter by recruiter..."
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 4,
            background: '#142D48', border: '1px solid rgba(201,169,110,0.15)',
            color: '#d1d9e2', fontSize: 12, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, zIndex: 50,
          background: '#142D48', border: '1px solid rgba(201,169,110,0.2)',
          borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {value && (
            <button
              onClick={() => { onChange(''); setQuery(''); setOpen(false) }}
              style={{
                width: '100%', padding: '8px 12px', textAlign: 'left',
                background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                color: '#6B8299', fontSize: 11, cursor: 'pointer',
              }}
            >
              Show all recruiters
            </button>
          )}
          {filtered.map(o => (
            <button
              key={o.agentCode}
              onClick={() => { onChange(o.agentCode); setQuery(''); setOpen(false) }}
              style={{
                width: '100%', padding: '8px 12px', textAlign: 'left',
                background: o.agentCode === value ? 'rgba(201,169,110,0.1)' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
                color: o.agentCode === value ? '#C9A96E' : '#d1d9e2',
                fontSize: 12, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span>{o.name}</span>
              <span style={{ fontSize: 9, color: '#4B5563' }}>{o.agentCode}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
