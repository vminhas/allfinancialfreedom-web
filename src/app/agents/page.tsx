'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  PHASE_LABELS, PHASE_ITEMS, PHASE_GROUPS, CARRIERS,
  CARRIER_UNLOCK_PHASE, LICENSING_CHECKLIST, SYSTEM_PROGRESSIONS,
} from '@/lib/agent-constants'
import { GROUP_ICONS, Mail, ChevronDown, ArrowRight, ExternalLink, UserCheck } from '@/lib/checklist-icons'
import CallReviewModal, { CallReviewData } from '@/components/CallReviewModal'
import LicensingRequestModal, { type LicensingRequestTopic } from '@/components/LicensingRequestModal'
import LicensingCoordinatorPanel from '@/components/LicensingCoordinatorPanel'
import FTALogModal from '@/components/FTALogModal'
import InlinePartnerLog from '@/components/InlinePartnerLog'
import { useIsMobile } from '@/lib/useIsMobile'

interface PhaseProgress { phase: number; total: number; completed: number; pct: number }
interface PhaseItem { phase: number; itemKey: string; completed: boolean; completedAt: string | null }
interface CarrierAppointment { carrier: string; status: string; producerNumber: string | null }
interface Milestone { milestone: string; completedAt: string }

interface AgentData {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  state: string | null
  phone: string | null
  dateOfBirth: string | null
  avatarUrl: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  zip: string | null
  country: string | null
  ssnMasked: string | null
  ssnOnFile: boolean
  email: string
  phase: number
  phaseLabel: { title: string; standard: string; goal: string; description: string; nextStep: string }
  phaseStartedAt: string | null
  status: string
  goal: string | null
  cft: string | null
  discordUserId: string | null
  discordRoleName: string | null
  icaDate: string | null
  licenseNumber: string | null
  npn: string | null
  allPhaseProgress: PhaseProgress[]
  phaseItems: PhaseItem[]
  carrierAppointments: CarrierAppointment[]
  milestones: Milestone[]
  counts: { businessPartners: number; policies: number; callLogs: number }
}

// Compute which System Progressions are achieved
function computeProgressions(data: AgentData): Record<string, boolean> {
  const has = (key: string, phase: number) =>
    data.phaseItems.some(i => i.itemKey === key && i.phase === phase && i.completed)
  const hasMilestone = (m: string) => data.milestones.some(mi => mi.milestone === m)
  const hasAppointed = data.carrierAppointments.some(c => c.status === 'APPOINTED')

  return {
    code_number: true,
    client: has('client_1', 2) || data.counts.policies > 0,
    pass_license: has('pass_license_test', 1),
    business_partner_plan: has('business_marketing_plan', 1),
    licensed_appointed: has('net_license', 2) && hasAppointed,
    '10_field_trainings': has('fta_10', 2),
    associate_promotion: has('associate_promotion', 2),
    net_license: has('net_license', 2),
    cft_in_progress: has('cft_classes', 3),
    certified_field_trainer: has('cft_coordinator_signoff', 3),
    elite_trainer: data.phase >= 4,
    marketing_director: has('45k_points', 4),
    '50k_watch': hasMilestone('50k_watch'),
    '100k_ring': hasMilestone('100k_ring'),
    emd: has('150k_net_6mo', 5),
  }
}

const PHASE_COLORS: Record<number, string> = {
  1: '#6B8299', 2: '#9B6DFF', 3: '#C9A96E', 4: '#3b82f6', 5: '#4ade80',
}
const APPT_COLORS: Record<string, string> = {
  APPOINTED: '#4ade80', PENDING: '#f59e0b', JIT: '#9B6DFF', NOT_STARTED: '#4B5563',
}
const card = {
  background: '#132238',
  border: '1px solid rgba(201,169,110,0.1)',
  borderRadius: 6,
}
const sectionLabel = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
  textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14,
}
const inputStyle = {
  background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
  borderRadius: 4, color: '#9BB0C4', padding: '7px 10px',
  fontSize: 12, width: '100%', boxSizing: 'border-box' as const,
}
const fieldLabel = {
  fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em',
  textTransform: 'uppercase' as const, color: '#C9A96E',
  display: 'block', marginBottom: 4,
}

function AgentDashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const discordParam = searchParams.get('discord')
  const discordUsername = searchParams.get('username')

  const [data, setData] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'checklist' | 'licensing' | 'carriers' | 'partners' | 'policies' | 'calls' | 'profile'>(
    discordParam ? 'profile' : 'checklist'
  )
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [setupResources, setSetupResources] = useState<Record<string, string>>({})
  const [ftaModalKey, setFtaModalKey] = useState<string | null>(null)

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const expandAll = (phase: number) => {
    const keys = (PHASE_ITEMS[phase] ?? []).map(i => i.key)
    setExpandedItems(new Set(keys))
    setCollapsedGroups(new Set())
  }
  const collapseAll = () => {
    setExpandedItems(new Set())
    const groups = PHASE_GROUPS[activeChecklistPhase] ?? []
    setCollapsedGroups(new Set(groups.map(g => g.key)))
  }
  const [selectedProgression, setSelectedProgression] = useState<string | null>(null)
  const [checklistPhase, setChecklistPhase] = useState<number | null>(null)

  // Coordinator requests — keyed by phaseItemKey
  interface CoordinatorRequest {
    id: string
    phaseItemKey: string | null
    topic: string
    message: string
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
    resolutionNote: string | null
    createdAt: string
    resolvedAt: string | null
  }
  const [coordinatorRequests, setCoordinatorRequests] = useState<CoordinatorRequest[]>([])
  const [requestModalItemKey, setRequestModalItemKey] = useState<string | null>(null)

  const fetchCoordinatorRequests = useCallback(async () => {
    const res = await fetch('/api/agents/coordinator-requests')
    if (res.ok) {
      const d = await res.json() as { requests: CoordinatorRequest[] }
      setCoordinatorRequests(d.requests ?? [])
    }
  }, [])

  useEffect(() => { fetchCoordinatorRequests() }, [fetchCoordinatorRequests])

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/agents/me')
    if (res.status === 401) { router.push('/agents/login'); return }
    if (res.status === 403) {
      const body = await res.json() as { error?: string }
      if (body.error === 'AccountInactive') {
        router.push('/agents/login?reason=inactive')
        return
      }
    }
    if (!res.ok) { setLoading(false); return }
    setData(await res.json() as AgentData)
    setLoading(false)
  }, [router])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    fetch('/api/agents/setup-resources')
      .then(r => r.ok ? r.json() : { resources: {} })
      .then((d: { resources: Record<string, string> }) => setSetupResources(d.resources ?? {}))
      .catch(() => {})
  }, [])

  const toggleItem = async (itemKey: string, phase: number, current: boolean) => {
    if (!data) return
    setTogglingKey(itemKey)
    await fetch('/api/agents/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemKey, phase, completed: !current }),
    })
    await fetchData()
    setTogglingKey(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6B8299', fontSize: 13 }}>Loading your portal...</div>
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#f87171', fontSize: 13 }}>Profile not found. Contact your trainer.</div>
      </div>
    )
  }

  const activeChecklistPhase = checklistPhase ?? data.phase
  const currentPhaseItems = data.phaseItems.filter(i => i.phase === activeChecklistPhase)
  const currentPhaseProgress = data.allPhaseProgress.find(p => p.phase === activeChecklistPhase)
  const daysInPhase = data.phaseStartedAt
    ? Math.floor((Date.now() - new Date(data.phaseStartedAt).getTime()) / 86400000)
    : null
  const appointedCount = data.carrierAppointments.filter(c => c.status === 'APPOINTED').length
  const progressions = computeProgressions(data)
  const achievedCount = Object.values(progressions).filter(Boolean).length

  // Licensing progress
  const licensingCompleted = LICENSING_CHECKLIST.filter(item => {
    if (item.derived === 'carriers') return data.carrierAppointments.every(c => c.status === 'APPOINTED')
    const phaseItem = data.phaseItems.find(pi => pi.phase === 1 && pi.itemKey === item.phaseItemKey)
    return phaseItem?.completed ?? false
  }).length

  const TABS = [
    { key: 'checklist', label: 'Checklist' },
    { key: 'licensing', label: 'Licensing' },
    { key: 'carriers', label: 'Carriers' },
    { key: 'partners', label: 'Partners' },
    { key: 'policies', label: 'Policies' },
    { key: 'calls', label: 'Calls' },
    { key: 'profile', label: 'Profile' },
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628' }}>
      {/* Top nav */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: '14px clamp(16px, 4vw, 32px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </span>
          <span style={{ marginLeft: 12, fontSize: 11, color: '#4B5563' }}>Agent Portal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: data.avatarUrl ? 'transparent' : 'rgba(201,169,110,0.15)',
              border: '1px solid rgba(201,169,110,0.3)',
              overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {data.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 11, color: '#C9A96E', fontWeight: 700 }}>
                  {data.firstName.charAt(0)}{data.lastName.charAt(0)}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#6B8299' }}>{data.firstName} {data.lastName} · {data.agentCode}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/agents/login' })}
            style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 12, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Branded masthead strip */}
      <div style={{
        height: 'clamp(120px, 18vw, 180px)',
        backgroundImage: "linear-gradient(180deg, rgba(10,22,40,0.35) 0%, rgba(10,22,40,0.7) 60%, #0A1628 100%), url('/brand/banner-lines.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        marginTop: -1,
      }} />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 clamp(16px, 4vw, 24px) clamp(20px, 5vw, 36px)', marginTop: 'clamp(-60px, -8vw, -40px)', position: 'relative' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 300, color: '#ffffff', textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>My Progression</div>
          <div style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
            {data.state && `${data.state} · `}
            {data.cft && `Trainer: ${data.cft} · `}
            {data.icaDate && `Started: ${new Date(data.icaDate).toLocaleDateString()}`}
            {!data.phone && (
              <button
                onClick={() => setActiveTab('profile')}
                style={{ marginLeft: 12, background: 'none', border: 'none', color: '#f59e0b', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Complete your profile →
              </button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Discord Role', value: data.discordRoleName ?? `Phase ${data.phase}`, color: PHASE_COLORS[data.phase] },
            { label: 'Days in Phase', value: daysInPhase != null ? `${daysInPhase}d` : '—', color: '#9BB0C4' },
            { label: 'Phase Complete', value: `${currentPhaseProgress?.pct ?? 0}%`, color: '#C9A96E' },
            { label: 'Carriers Appointed', value: `${appointedCount}/${CARRIERS.length}`, color: '#4ade80' },
          ].map(stat => (
            <div key={stat.label} style={{ ...card, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* ── SYSTEM PROGRESSIONS — always visible achievement strip ── */}
        <div style={{ ...card, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={sectionLabel}>System Progressions</div>
            <span style={{ fontSize: 11, color: '#6B8299' }}>{achievedCount} of {SYSTEM_PROGRESSIONS.length} achieved</span>
          </div>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'flex', gap: 8, minWidth: 'max-content' }}>
              {SYSTEM_PROGRESSIONS.map(prog => {
                const achieved = progressions[prog.key] ?? false
                const isSelected = selectedProgression === prog.key
                return (
                  <button
                    key={prog.key}
                    onClick={() => setSelectedProgression(isSelected ? null : prog.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                      minWidth: 76, maxWidth: 84, textAlign: 'center',
                      background: isSelected
                        ? (achieved ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.06)')
                        : achieved ? 'rgba(201,169,110,0.1)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? (achieved ? '#C9A96E' : 'rgba(255,255,255,0.2)') : achieved ? 'rgba(201,169,110,0.35)' : 'rgba(255,255,255,0.05)'}`,
                      boxShadow: achieved ? '0 0 12px rgba(201,169,110,0.15)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', marginBottom: 6,
                      background: achieved ? '#C9A96E' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                      color: achieved ? '#142D48' : '#4B5563',
                      boxShadow: achieved ? '0 0 8px rgba(201,169,110,0.4)' : 'none',
                    }}>
                      {achieved ? '✓' : '·'}
                    </div>
                    <div style={{
                      fontSize: 9, fontWeight: 600, lineHeight: 1.3,
                      color: achieved ? '#C9A96E' : '#4B5563',
                      letterSpacing: '0.02em',
                    }}>
                      {prog.label}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected progression detail */}
          {selectedProgression && (() => {
            const prog = SYSTEM_PROGRESSIONS.find(p => p.key === selectedProgression)!
            const achieved = progressions[selectedProgression] ?? false
            return (
              <div style={{
                marginTop: 12, padding: '14px 16px', borderRadius: 6,
                background: achieved ? 'rgba(201,169,110,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${achieved ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.07)'}`,
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: achieved ? '#C9A96E' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: achieved ? '#142D48' : '#4B5563',
                }}>
                  {achieved ? '✓' : '·'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: achieved ? '#C9A96E' : '#9BB0C4', marginBottom: 4 }}>
                    {prog.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.6 }}>
                    {prog.description}
                  </div>
                  {!achieved && (
                    <div style={{ marginTop: 6, fontSize: 10, color: '#4B5563', fontStyle: 'italic' }}>
                      Not yet achieved
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedProgression(null)}
                  style={{ background: 'none', border: 'none', color: '#4B5563', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            )
          })()}
        </div>

        {/* ── Phase roadmap ── */}
        <div style={{ ...card, padding: '20px 24px', marginBottom: 24 }}>
          <div style={sectionLabel}>Your Journey</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((phase, idx) => {
              const prog = data.allPhaseProgress.find(p => p.phase === phase)
              const isCurrent = phase === data.phase
              const isDone = phase < data.phase
              const isFuture = phase > data.phase
              const pct = prog?.pct ?? 0
              return (
                <div key={phase} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 140 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: isDone ? '#4ade80' : isCurrent ? PHASE_COLORS[phase] : 'transparent',
                        border: `2px solid ${isDone ? '#4ade80' : isCurrent ? PHASE_COLORS[phase] : 'rgba(255,255,255,0.1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isDone ? 14 : 12, fontWeight: 700,
                        color: isDone ? '#0A1628' : isCurrent ? '#0A1628' : '#4B5563',
                      }}>
                        {isDone ? '✓' : phase}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: isCurrent ? 700 : 400, color: isFuture ? '#4B5563' : '#9BB0C4', marginBottom: 3 }}>
                      {PHASE_LABELS[phase].title}
                    </div>
                    <div style={{ fontSize: 9, color: '#4B5563', marginBottom: 5 }}>{PHASE_LABELS[phase].standard}</div>
                    {isCurrent && (
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, margin: '0 8px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: PHASE_COLORS[phase], borderRadius: 2, transition: 'width 0.5s' }} />
                      </div>
                    )}
                    {isDone && <div style={{ fontSize: 9, color: '#4ade80' }}>Complete</div>}
                  </div>
                  {idx < 4 && (
                    <div style={{ height: 2, width: 24, marginTop: 16, flexShrink: 0, background: isDone ? '#4ade80' : 'rgba(255,255,255,0.06)' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                background: 'none', border: 'none', whiteSpace: 'nowrap',
                padding: '8px 14px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: activeTab === tab.key ? '#C9A96E' : '#6B8299',
                borderBottom: activeTab === tab.key ? '2px solid #C9A96E' : '2px solid transparent',
                marginBottom: -1,
                ...(tab.key === 'licensing' && { position: 'relative' }),
              }}
            >
              {tab.label}
              {tab.key === 'licensing' && licensingCompleted < LICENSING_CHECKLIST.length && (
                <span style={{
                  marginLeft: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, borderRadius: '50%', fontSize: 8, fontWeight: 700,
                  background: '#f59e0b', color: '#0A1628',
                }}>
                  {LICENSING_CHECKLIST.length - licensingCompleted}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── PHASE CHECKLIST TAB ── */}
        {activeTab === 'checklist' && (
          <div style={{ ...card, padding: '24px 28px' }}>

            {/* Phase sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map(ph => {
                const prog = data.allPhaseProgress.find(p => p.phase === ph)
                const isActive = activeChecklistPhase === ph
                const isCurrent = ph === data.phase
                const isDone = ph < data.phase
                return (
                  <button
                    key={ph}
                    onClick={() => setChecklistPhase(ph)}
                    style={{
                      padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                      fontWeight: isActive ? 700 : 400, letterSpacing: '0.08em',
                      border: `1px solid ${isActive ? PHASE_COLORS[ph] : 'rgba(255,255,255,0.08)'}`,
                      background: isActive ? `${PHASE_COLORS[ph]}18` : 'transparent',
                      color: isActive ? PHASE_COLORS[ph] : isDone ? '#4ade80' : isCurrent ? '#9BB0C4' : '#4B5563',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {isDone && <span style={{ fontSize: 9 }}>✓</span>}
                    Phase {ph}
                    {isCurrent && !isActive && <span style={{ fontSize: 8, color: '#C9A96E', fontWeight: 700 }}>NOW</span>}
                    {prog && <span style={{ fontSize: 9, opacity: 0.7 }}>{prog.pct}%</span>}
                  </button>
                )
              })}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={sectionLabel}>Phase {activeChecklistPhase} — {PHASE_LABELS[activeChecklistPhase].title}</div>
                  <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 2 }}>{PHASE_LABELS[activeChecklistPhase].standard} · Goal: {PHASE_LABELS[activeChecklistPhase].goal}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: PHASE_COLORS[activeChecklistPhase] }}>
                    {currentPhaseProgress?.pct ?? 0}%
                  </div>
                  <div style={{ fontSize: 10, color: '#6B8299' }}>
                    {currentPhaseProgress?.completed ?? 0} of {currentPhaseProgress?.total ?? 0}
                  </div>
                </div>
              </div>
              <div style={{
                background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.1)',
                borderRadius: 6, padding: '12px 14px', fontSize: 12, color: '#9BB0C4', lineHeight: 1.6,
              }}>
                {PHASE_LABELS[activeChecklistPhase].description}
                <div style={{ marginTop: 8, fontSize: 11, color: '#C9A96E', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ flexShrink: 0 }}>→</span>
                  <span>{PHASE_LABELS[activeChecklistPhase].nextStep}</span>
                </div>
              </div>
            </div>

            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginBottom: 24 }}>
              <div style={{
                height: '100%', width: `${currentPhaseProgress?.pct ?? 0}%`,
                background: PHASE_COLORS[activeChecklistPhase], borderRadius: 3, transition: 'width 0.5s',
              }} />
            </div>

            {/* Expand all / Collapse all */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => expandAll(activeChecklistPhase)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#6B8299',
                }}
              >
                Expand all
              </button>
              <span style={{ color: '#4B5563', fontSize: 10 }}>|</span>
              <button
                onClick={collapseAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#6B8299',
                }}
              >
                Collapse all
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Render items grouped by group key */}
              {(() => {
                const allItems = PHASE_ITEMS[activeChecklistPhase] ?? []
                const groups = PHASE_GROUPS[activeChecklistPhase] ?? []

                // Build ordered groups: items with matching group key, plus ungrouped items
                const groupedItems: { group: typeof groups[0] | null; items: typeof allItems }[] = []
                const usedKeys = new Set<string>()

                for (const g of groups) {
                  const gItems = allItems.filter(i => i.group === g.key)
                  if (gItems.length > 0) {
                    groupedItems.push({ group: g, items: gItems })
                    gItems.forEach(i => usedKeys.add(i.key))
                  }
                }
                // Any items without a group go at the end
                const ungrouped = allItems.filter(i => !usedKeys.has(i.key))
                if (ungrouped.length > 0) {
                  groupedItems.push({ group: null, items: ungrouped })
                }

                return groupedItems.map(({ group, items: groupItems }) => {
                  const groupCompleted = groupItems.filter(item => {
                    if (item.key === 'connect_discord') return !!data.discordUserId
                    return currentPhaseItems.some(i => i.itemKey === item.key && i.completed)
                  }).length

                  const isGroupCollapsed = group ? collapsedGroups.has(group.key) : false
                  const GroupIcon = group?.icon ? GROUP_ICONS[group.icon] : null

                  return (
                    <div key={group?.key ?? 'ungrouped'}>
                      {/* Group header */}
                      {group && (
                        <div
                          onClick={() => {
                            setCollapsedGroups(prev => {
                              const next = new Set(prev)
                              if (next.has(group.key)) next.delete(group.key)
                              else next.add(group.key)
                              return next
                            })
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', marginBottom: isGroupCollapsed ? 0 : 6, cursor: 'pointer',
                            background: 'rgba(201,169,110,0.04)',
                            border: '1px solid rgba(201,169,110,0.1)',
                            borderRadius: 6,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {GroupIcon && <GroupIcon size={16} color="#C9A96E" />}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>
                                {group.label}
                              </div>
                              {group.description && !isGroupCollapsed && (
                                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>{group.description}</div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: groupCompleted === groupItems.length ? '#4ade80' : '#C9A96E',
                            }}>
                              {groupCompleted}/{groupItems.length}
                            </span>
                            <span style={{
                              width: 40, height: 4, borderRadius: 2,
                              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                              display: 'inline-block',
                            }}>
                              <span style={{
                                display: 'block', height: '100%',
                                width: `${groupItems.length > 0 ? Math.round((groupCompleted / groupItems.length) * 100) : 0}%`,
                                background: groupCompleted === groupItems.length ? '#4ade80' : '#C9A96E',
                                borderRadius: 2,
                                transition: 'width 0.3s',
                              }} />
                            </span>
                            <ChevronDown size={14} color="#6B8299" style={{ transition: 'transform 0.2s', transform: isGroupCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                          </div>
                        </div>
                      )}

                      {/* Trainer display at group level */}
                      {group?.showTrainer && data.cft && !isGroupCollapsed && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 14px', marginBottom: 4,
                          background: 'rgba(201,169,110,0.04)',
                          borderRadius: 4,
                        }}>
                          <UserCheck size={13} color="#C9A96E" />
                          <span style={{ fontSize: 11, color: '#C9A96E' }}>Your trainer: {data.cft}</span>
                        </div>
                      )}

                      {/* Consolidated coordinator panel for licensing group */}
                      {group?.key === 'licensing' && !isGroupCollapsed && (
                        <LicensingCoordinatorPanel
                          items={groupItems.filter(i => i.coordinatorTopic)}
                          phaseItems={currentPhaseItems}
                          requests={coordinatorRequests}
                          onRequestHelp={(itemKey) => setRequestModalItemKey(itemKey)}
                        />
                      )}

                      {/* Items in this group — hidden when collapsed */}
                      {!isGroupCollapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {groupItems.filter(item => !(group?.key === 'licensing' && item.coordinatorTopic)).map(item => {
                const phaseItem = currentPhaseItems.find(i => i.itemKey === item.key)
                // Auto-complete connect_discord when Discord is linked
                const done = item.key === 'connect_discord'
                  ? !!data.discordUserId
                  : (phaseItem?.completed ?? false)
                const isToggling = togglingKey === item.key
                const isExpanded = expandedItems.has(item.key)

                return (
                  <div key={item.key} style={{ borderRadius: 6, overflow: 'hidden' }}>
                    {/* Card row — clicking ANYWHERE on the card expands/collapses.
                        The checkbox is a separate click target that stops propagation. */}
                    <div
                      onClick={() => toggleExpanded(item.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 16px',
                        background: done ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        borderRadius: isExpanded ? '6px 6px 0 0' : '6px',
                      }}
                    >
                      {/* Checkbox — click stops propagation so it only toggles completion */}
                      <button
                        onClick={e => { e.stopPropagation(); toggleItem(item.key, activeChecklistPhase, done) }}
                        disabled={isToggling}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: isToggling ? 'not-allowed' : 'pointer',
                          opacity: isToggling ? 0.6 : 1, flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 20, height: 20, borderRadius: 4,
                          background: done ? '#4ade80' : 'transparent',
                          border: `2px solid ${done ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#0A1628', fontWeight: 700,
                          transition: 'all 0.15s',
                        }}>
                          {done && '✓'}
                        </div>
                      </button>
                      <span style={{ fontSize: 13, color: done ? '#9BB0C4' : '#ffffff', flex: 1 }}>
                        {item.label}
                      </span>
                      {item.duration && (
                        <span style={{ fontSize: 9, color: '#6B8299', flexShrink: 0, padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
                          {item.duration}
                        </span>
                      )}
                      {item.coordinatorTopic && (
                        <span style={{ flexShrink: 0, display: 'flex' }} title="Licensing coordinator can help"><Mail size={13} color="#C9A96E" /></span>
                      )}
                      {phaseItem?.completedAt && (
                        <span style={{ fontSize: 10, color: '#4B5563', flexShrink: 0 }}>
                          {new Date(phaseItem.completedAt).toLocaleDateString()}
                        </span>
                      )}
                      <ChevronDown size={13} color="#4B5563" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                      {item.action?.type === 'navigate-tab' && item.action.tab && (
                        <button
                          onClick={e => { e.stopPropagation(); setActiveTab(item.action!.tab as typeof activeTab) }}
                          style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 10, cursor: 'pointer', padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                          title={item.action.label ?? `Go to ${item.action.tab}`}
                        >
                          {item.action.label ?? item.action.tab} <ArrowRight size={11} />
                        </button>
                      )}
                      {item.action?.type === 'resource-link' && (() => {
                        const url = setupResources[item.action!.resourceKey!]
                        if (!url) return null
                        return (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ color: '#C9A96E', fontSize: 10, textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            {item.action!.label ?? 'Open'} <ExternalLink size={11} />
                          </a>
                        )
                      })()}
                      {item.action?.type === 'inline-form' && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (item.action!.modal === 'fta-log' || item.action!.modal === 'fta-schedule') {
                              setFtaModalKey(item.key)
                            }
                          }}
                          style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 10, cursor: 'pointer', padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          {item.action.label ?? 'Open'} <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                    {/* Expanded description */}
                    {isExpanded && (() => {
                      return (
                        <div style={{
                          padding: '12px 16px 14px 46px',
                          background: done ? 'rgba(74,222,128,0.03)' : 'rgba(255,255,255,0.01)',
                          border: `1px solid ${done ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)'}`,
                          borderTop: 'none',
                          borderRadius: '0 0 6px 6px',
                        }}>
                          <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>
                            {item.description}
                          </div>


                          {/* Discord connect — inline action for connect_discord item */}
                          {item.key === 'connect_discord' && (
                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(155,109,255,0.2)' }}>
                              {data.discordUserId ? (
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '12px 14px',
                                  background: 'rgba(74,222,128,0.06)',
                                  border: '1px solid rgba(74,222,128,0.25)',
                                  borderRadius: 6,
                                }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'rgba(74,222,128,0.15)',
                                    border: '1px solid rgba(74,222,128,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, color: '#4ade80',
                                  }}>
                                    ✓
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#4ade80' }}>Discord connected</div>
                                    <div style={{ fontSize: 10, color: '#6B8299', marginTop: 1 }}>
                                      {data.discordRoleName && <span>Role: {data.discordRoleName} · </span>}
                                      ID: {data.discordUserId}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <a
                                  href="/api/agents/discord-connect"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 10,
                                    padding: '14px 20px',
                                    background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                                    color: '#ffffff',
                                    border: 'none', borderRadius: 8,
                                    fontSize: 13, fontWeight: 700,
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 16px rgba(88,101,242,0.35)',
                                    transition: 'all 0.15s',
                                    minHeight: 48,
                                  }}
                                >
                                  <svg width="20" height="16" viewBox="0 0 71 55" fill="white">
                                    <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 41 41 0 00-1.8 3.7 54 54 0 00-16.2 0A37 37 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5a.2.2 0 00-.1 0C1.5 17.7-.9 30 .3 42.1a.2.2 0 000 .2 58.7 58.7 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.7 38.7 0 01-5.5-2.6.2.2 0 01 0-.4 31 31 0 001.1-.9.2.2 0 01.2 0c11.6 5.3 24.1 5.3 35.5 0a.2.2 0 01.2 0 29 29 0 001.1.9.2.2 0 010 .3 36.3 36.3 0 01-5.5 2.6.2.2 0 00-.1.4 47 47 0 003.6 5.8.2.2 0 00.2.1 58.5 58.5 0 0017.7-9 .2.2 0 000-.1c1.4-14.5-2.4-27.1-10-38.3a.2.2 0 00-.1 0zM23.7 34.6c-3.3 0-6-3-6-6.8s2.7-6.8 6-6.8 6.1 3.1 6 6.8c0 3.7-2.6 6.8-6 6.8zm22.2 0c-3.3 0-6-3-6-6.8s2.6-6.8 6-6.8 6 3.1 6 6.8c0 3.7-2.6 6.8-6 6.8z"/>
                                  </svg>
                                  Connect Discord
                                </a>
                              )}
                            </div>
                          )}

                          {/* Inline partner log for recruit items */}
                          {item.action?.type === 'inline-form' && item.action.modal === 'partner-log' && (
                            <InlinePartnerLog phaseItemKey={item.key} onSaved={fetchData} />
                          )}

                        </div>
                      )
                    })()}
                  </div>
                )
              })}
                      </div>}{/* close items in group */}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* ── LICENSING CHECKLIST TAB ── */}
        {activeTab === 'licensing' && (
          <LicensingTab
            phaseItems={data.phaseItems}
            carrierAppointments={data.carrierAppointments}
            onToggle={toggleItem}
            togglingKey={togglingKey}
          />
        )}

        {/* ── CARRIERS TAB ── */}
        {activeTab === 'carriers' && (
          <CarriersTab
            agentPhase={data.phase}
            carrierAppointments={data.carrierAppointments}
          />
        )}

        {/* ── PARTNERS / POLICIES / CALLS / PROFILE TABS ── */}
        {activeTab === 'partners' && <BusinessPartnersTab />}
        {activeTab === 'policies' && <PoliciesTab />}
        {activeTab === 'calls' && <CallLogsTab />}
        {activeTab === 'profile' && (
          <ProfileTab
            data={data}
            onSaved={fetchData}
            discordParam={discordParam}
            discordUsername={discordUsername}
          />
        )}

      </div>

      {/* Licensing coordinator request modal */}
      {requestModalItemKey && (() => {
        const item = PHASE_ITEMS[activeChecklistPhase]?.find(i => i.key === requestModalItemKey)
          ?? Object.values(PHASE_ITEMS).flat().find(i => i.key === requestModalItemKey)
        if (!item || !item.coordinatorTopic) return null
        const itemRequests = coordinatorRequests.filter(r => r.phaseItemKey === item.key)
        return (
          <LicensingRequestModal
            phaseItemKey={item.key}
            phaseItemLabel={item.label}
            defaultTopic={item.coordinatorTopic as LicensingRequestTopic}
            existingRequests={itemRequests.map(r => ({
              ...r,
              topic: r.topic as LicensingRequestTopic,
            }))}
            onClose={() => setRequestModalItemKey(null)}
            onSubmitted={newReq => {
              setCoordinatorRequests(prev => [
                {
                  id: newReq.id,
                  phaseItemKey: newReq.phaseItemKey ?? null,
                  topic: newReq.topic as string,
                  message: newReq.message,
                  status: newReq.status,
                  resolutionNote: newReq.resolutionNote,
                  createdAt: newReq.createdAt,
                  resolvedAt: newReq.resolvedAt,
                },
                ...prev,
              ])
            }}
          />
        )
      })()}

      {/* FTA Log Modal */}
      {ftaModalKey && (() => {
        const item = Object.values(PHASE_ITEMS).flat().find(i => i.key === ftaModalKey)
        if (!item) return null
        return (
          <FTALogModal
            ftaKey={item.key}
            ftaLabel={item.label}
            trainerName={data.cft}
            defaultName={item.key === 'fta_1' ? '' : undefined}
            onClose={() => setFtaModalKey(null)}
            onSaved={fetchData}
          />
        )
      })()}
    </div>
  )
}

export default function AgentDashboard() {
  return (
    <Suspense fallback={null}>
      <AgentDashboardInner />
    </Suspense>
  )
}

// ─── Licensing Checklist Tab ───────────────────────────────────────────────────

function LicensingTab({
  phaseItems,
  carrierAppointments,
  onToggle,
  togglingKey,
}: {
  phaseItems: PhaseItem[]
  carrierAppointments: CarrierAppointment[]
  onToggle: (key: string, phase: number, current: boolean) => void
  togglingKey: string | null
}) {
  const allAppointed = carrierAppointments.length > 0 &&
    carrierAppointments.every(c => c.status === 'APPOINTED')

  const completed = LICENSING_CHECKLIST.filter(item => {
    if (item.derived === 'carriers') return allAppointed
    const pi = phaseItems.find(pi => pi.phase === 1 && pi.itemKey === item.phaseItemKey)
    return pi?.completed ?? false
  }).length

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={sectionLabel}>Licensing Checklist</div>
        <span style={{ fontSize: 11, color: completed === LICENSING_CHECKLIST.length ? '#4ade80' : '#f59e0b', fontWeight: 700 }}>
          {completed} / {LICENSING_CHECKLIST.length}
        </span>
      </div>

      <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 20, lineHeight: 1.6 }}>
        Complete these steps once to get fully licensed and appointed. Some items overlap with your Phase 1 checklist — checking them here updates both.
      </p>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 24 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${Math.round((completed / LICENSING_CHECKLIST.length) * 100)}%`,
          background: completed === LICENSING_CHECKLIST.length ? '#4ade80' : '#C9A96E',
          transition: 'width 0.5s',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LICENSING_CHECKLIST.map(item => {
          let isDone = false
          let phaseItemKey: string | undefined
          let phase = 1

          if (item.derived === 'carriers') {
            isDone = allAppointed
          } else {
            phaseItemKey = item.phaseItemKey
            const pi = phaseItems.find(pi => pi.phase === 1 && pi.itemKey === item.phaseItemKey)
            isDone = pi?.completed ?? false
          }

          const isToggling = togglingKey === item.phaseItemKey
          const isReadOnly = item.derived === 'carriers'

          return (
            <div
              key={item.key}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px', borderRadius: 6,
                background: isDone ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isDone ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                cursor: isReadOnly ? 'default' : 'pointer',
                opacity: isToggling ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
              onClick={() => {
                if (!isReadOnly && phaseItemKey) {
                  onToggle(phaseItemKey, phase, isDone)
                }
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                background: isDone ? '#4ade80' : 'transparent',
                border: `2px solid ${isDone ? '#4ade80' : isReadOnly ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: '#0A1628', fontWeight: 700,
              }}>
                {isDone && '✓'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: isDone ? '#9BB0C4' : '#ffffff', marginBottom: 4, fontWeight: 500 }}>
                  {item.label}
                  {isReadOnly && (
                    <span style={{ marginLeft: 8, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4B5563', fontWeight: 700 }}>
                      Admin managed
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
                  {item.description}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Carriers Tab (with phase lock) ───────────────────────────────────────────

function CarriersTab({
  agentPhase,
  carrierAppointments,
}: {
  agentPhase: number
  carrierAppointments: CarrierAppointment[]
}) {
  const appointedCount = carrierAppointments.filter(c => c.status === 'APPOINTED').length

  // Group carriers by unlock phase
  const phaseGroups: Record<number, typeof CARRIERS[number][]> = {}
  for (const carrier of CARRIERS) {
    const unlockPhase = CARRIER_UNLOCK_PHASE[carrier] ?? 2
    if (!phaseGroups[unlockPhase]) phaseGroups[unlockPhase] = []
    phaseGroups[unlockPhase].push(carrier)
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={sectionLabel}>Carrier Appointments</div>
        <span style={{ fontSize: 11, color: '#6B8299' }}>{appointedCount} / {CARRIERS.length} appointed</span>
      </div>
      <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 24, lineHeight: 1.5 }}>
        Carrier appointment statuses are managed by your admin. Carriers unlock as you advance through phases.
      </p>

      {[2, 3, 4, 5].map(unlockPhase => {
        const carriers = phaseGroups[unlockPhase] ?? []
        const isLocked = agentPhase < unlockPhase
        const phaseLabel = PHASE_LABELS[unlockPhase]?.title ?? `Phase ${unlockPhase}`

        return (
          <div key={unlockPhase} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
                color: isLocked ? '#4B5563' : '#C9A96E',
              }}>
                Phase {unlockPhase} — {phaseLabel}
              </div>
              {isLocked && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#4B5563', background: 'rgba(255,255,255,0.04)', borderRadius: 4,
                  padding: '2px 7px', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  Unlocks at Phase {unlockPhase}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {carriers.map(carrier => {
                const appt = carrierAppointments.find(c => c.carrier === carrier)
                const status = appt?.status ?? 'NOT_STARTED'

                if (isLocked) {
                  return (
                    <div key={carrier} style={{
                      padding: '12px 16px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.01)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      opacity: 0.5,
                    }}>
                      <div style={{ fontSize: 12, color: '#4B5563' }}>{carrier}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, color: '#4B5563' }}>🔒</span>
                        <span style={{ fontSize: 10, color: '#4B5563', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          Phase {unlockPhase}
                        </span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={carrier} style={{
                    padding: '12px 16px', borderRadius: 4,
                    background: status === 'APPOINTED' ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${status === 'APPOINTED' ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#9BB0C4' }}>{carrier}</div>
                      {appt?.producerNumber && (
                        <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2 }}>#{appt.producerNumber}</div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      textTransform: 'uppercase', color: APPT_COLORS[status],
                    }}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ data, onSaved, discordParam, discordUsername }: { data: AgentData; onSaved: () => void; discordParam: string | null; discordUsername: string | null }) {
  const [form, setForm] = useState({
    phone: data.phone ?? '',
    state: data.state ?? '',
    dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
    npn: data.npn ?? '',
    licenseNumber: data.licenseNumber ?? '',
    ssn: '',
    addressLine1: data.addressLine1 ?? '',
    addressLine2: data.addressLine2 ?? '',
    city: data.city ?? '',
    zip: data.zip ?? '',
    country: data.country ?? 'US',
  })
  const [ssnFocused, setSsnFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState(data.avatarUrl ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true)
    setAvatarError('')
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await fetch('/api/agents/avatar', { method: 'POST', body: fd })
    const d = await res.json() as { ok?: boolean; avatarUrl?: string; error?: string }
    if (!res.ok) {
      setAvatarError(d.error ?? 'Upload failed')
    } else {
      setAvatarUrl(d.avatarUrl ?? null)
      onSaved()
    }
    setAvatarUploading(false)
  }

  // Discord OAuth result is passed in as props (read by parent via useSearchParams)

  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
  ]

  // Format SSN input as XXX-XX-XXXX while typing
  const handleSsnChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 9)
    let formatted = digits
    if (digits.length > 5) formatted = `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}`
    else if (digits.length > 3) formatted = `${digits.slice(0,3)}-${digits.slice(3)}`
    setForm(f => ({ ...f, ssn: formatted }))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)

    // Only send SSN if the user actually typed something new
    const payload: Record<string, string> = {
      phone: form.phone,
      state: form.state,
      dateOfBirth: form.dateOfBirth,
      npn: form.npn,
      licenseNumber: form.licenseNumber,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      zip: form.zip,
      country: form.country,
    }
    if (form.ssn.replace(/\D/g, '').length > 0) {
      payload.ssn = form.ssn
    }

    const res = await fetch('/api/agents/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      setError(d.error ?? 'Save failed')
    } else {
      setSaved(true)
      setForm(f => ({ ...f, ssn: '' }))  // clear SSN input after save
      onSaved()
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={sectionLabel}>My Profile</div>
      <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 24, lineHeight: 1.5 }}>
        Update your personal information below. Your email address and agent code are managed by your admin.
      </p>

      {/* Profile Picture */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>Profile Photo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Avatar display */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: avatarUrl ? 'transparent' : 'rgba(201,169,110,0.1)',
            border: '2px solid rgba(201,169,110,0.25)',
            overflow: 'hidden', flexShrink: 0, position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 28, color: '#C9A96E', fontWeight: 300 }}>
                {data.firstName.charAt(0)}{data.lastName.charAt(0)}
              </span>
            )}
          </div>
          {/* Upload controls */}
          <div style={{ flex: 1 }}>
            <label style={{
              display: 'inline-block', cursor: avatarUploading ? 'not-allowed' : 'pointer',
              background: 'transparent', border: '1px solid rgba(201,169,110,0.3)',
              color: '#C9A96E', borderRadius: 4, padding: '8px 16px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              opacity: avatarUploading ? 0.6 : 1, transition: 'background 0.15s',
            }}
              onMouseEnter={e => { if (!avatarUploading) (e.currentTarget.style.background = 'rgba(201,169,110,0.08)') }}
              onMouseLeave={e => { (e.currentTarget.style.background = 'transparent') }}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                disabled={avatarUploading}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadAvatar(file)
                  e.target.value = ''
                }}
              />
              {avatarUploading ? 'Uploading...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}
            </label>
            <p style={{ fontSize: 11, color: '#4B5563', marginTop: 8, lineHeight: 1.5 }}>
              JPG, PNG or WebP · Max 5 MB · Square crop recommended.<br />
              This photo will be used for your Discord profile and team announcements.
            </p>
            {avatarError && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{avatarError}</div>
            )}
          </div>
        </div>
      </div>

      {/* Read-only fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Email</div>
          <div style={{ fontSize: 13, color: '#6B8299' }}>{data.email}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agent Code</div>
          <div style={{ fontSize: 13, color: '#6B8299' }}>{data.agentCode}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Name</div>
          <div style={{ fontSize: 13, color: '#6B8299' }}>{data.firstName} {data.lastName}</div>
        </div>
        {data.cft && (
          <div>
            <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trainer</div>
            <div style={{ fontSize: 13, color: '#6B8299' }}>{data.cft}</div>
          </div>
        )}
      </div>

      {/* Editable form */}
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={fieldLabel}>Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="(555) 555-5555"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel}>Licensed State</label>
            <select
              value={form.state}
              onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
              style={{ ...inputStyle, appearance: 'auto' }}
            >
              <option value="">Select state</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabel}>Date of Birth <span style={{ color: '#4B5563', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel}>NPN <span style={{ color: '#4B5563', fontWeight: 400 }}>(after licensed)</span></label>
            <input
              value={form.npn}
              onChange={e => setForm(f => ({ ...f, npn: e.target.value }))}
              placeholder="National Producer Number"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel}>License Number <span style={{ color: '#4B5563', fontWeight: 400 }}>(after licensed)</span></label>
            <input
              value={form.licenseNumber}
              onChange={e => setForm(f => ({ ...f, licenseNumber: e.target.value }))}
              placeholder="State license #"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Mailing Address */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Mailing Address
            <span style={{ marginLeft: 8, fontSize: 9, color: '#4B5563', fontWeight: 400, letterSpacing: '0.06em' }}>used for gifts & correspondence</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={fieldLabel}>Street Address</label>
              <input
                value={form.addressLine1}
                onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))}
                placeholder="123 Main St"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabel}>Apt / Suite / Unit <span style={{ color: '#4B5563', fontWeight: 400 }}>(optional)</span></label>
              <input
                value={form.addressLine2}
                onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))}
                placeholder="Apt 4B"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
              <div>
                <label style={fieldLabel}>City</label>
                <input
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="Chicago"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabel}>State</label>
                <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} style={inputStyle}>
                  <option value="">Select</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>ZIP</label>
                <input
                  value={form.zip}
                  onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                  placeholder="60601"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SSN section — full width with privacy notice */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20, marginTop: 4 }}>
          <label style={fieldLabel}>
            Social Security Number
            {data.ssnOnFile && !ssnFocused && form.ssn === '' && (
              <span style={{ color: '#4ade80', fontWeight: 400, marginLeft: 8 }}>✓ On file</span>
            )}
          </label>

          {/* Privacy notice */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: 'rgba(201,169,110,0.05)',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 6, padding: '10px 14px', marginBottom: 10,
          }}>
            <span style={{ color: '#C9A96E', fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>⚑</span>
            <p style={{ margin: 0, fontSize: 11, color: '#9BB0C4', lineHeight: 1.6 }}>
              Your SSN is collected solely for employment verification, carrier appointment processing, and E&O insurance purposes as required by All Financial Freedom.
              It is encrypted and stored securely — only authorized AFF staff can access it, and it is never shared with third parties outside of these licensing requirements.
            </p>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type={ssnFocused || form.ssn ? 'text' : 'password'}
              value={ssnFocused || form.ssn ? form.ssn : (data.ssnMasked ?? '')}
              onChange={e => handleSsnChange(e.target.value)}
              onFocus={() => setSsnFocused(true)}
              onBlur={() => { if (!form.ssn) setSsnFocused(false) }}
              placeholder={data.ssnOnFile ? 'Enter new SSN to update' : 'XXX-XX-XXXX'}
              autoComplete="off"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }}
            />
            {data.ssnOnFile && !ssnFocused && form.ssn === '' && (
              <div style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, color: '#4B5563', letterSpacing: '0.05em',
              }}>MASKED</div>
            )}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 10, color: '#4B5563', lineHeight: 1.5 }}>
            After saving, your SSN will be masked. Only the last 4 digits will be visible to you.
          </p>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? 'rgba(201,169,110,0.3)' : '#C9A96E',
              color: '#142D48', border: 'none', borderRadius: 4,
              padding: '9px 20px', fontSize: 11, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved</span>}
        </div>
      </form>

      {/* ── Discord section ─────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 28, paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.02.012.04.032.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          <div style={sectionLabel}>Discord</div>
          {data.discordUserId && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#4ade80', background: 'rgba(74,222,128,0.1)', borderRadius: 4,
              padding: '2px 7px', border: '1px solid rgba(74,222,128,0.2)',
            }}>Connected</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 16, lineHeight: 1.6 }}>
          Link your Discord account so the AFF bot automatically assigns your phase role in the server.
        </p>

        {/* OAuth result banner */}
        {discordParam === 'connected' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 16, padding: '10px 14px', borderRadius: 6,
            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
          }}>
            <span style={{ color: '#4ade80', fontSize: 16 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
                Discord connected{discordUsername ? ` as ${discordUsername}` : ''}!
              </div>
              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                Your phase role has been assigned in the AFF server.
              </div>
            </div>
          </div>
        )}
        {discordParam === 'error' && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 12,
            color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          }}>
            Something went wrong connecting Discord. Please try again.
          </div>
        )}

        {/* Connect / Reconnect button */}
        <a
          href="/api/agents/discord-connect"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#5865F2', color: '#ffffff',
            borderRadius: 4, padding: '10px 20px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            textDecoration: 'none', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.02.012.04.032.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          {data.discordUserId ? 'Reconnect Discord' : 'Connect Discord'}
        </a>

        {/* Current role + username */}
        {(data.discordRoleName || data.discordUserId) && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {data.discordRoleName && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                color: '#5865F2', background: 'rgba(88,101,242,0.12)',
                borderRadius: 4, padding: '3px 9px', border: '1px solid rgba(88,101,242,0.2)',
              }}>
                {data.discordRoleName}
              </span>
            )}
            {data.discordUserId && (
              <span style={{ fontSize: 10, color: '#4B5563', fontFamily: 'monospace' }}>
                ID: {data.discordUserId}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Business Partners Tab ─────────────────────────────────────────────────────

interface Partner {
  id: string; name: string; email: string | null; phone: string | null
  occupation: string | null; appointmentDate: string | null; notes: string | null
}

interface Referral {
  id: string; firstName: string; lastName: string; email: string
  phone: string | null; state: string | null; notes: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string
}

const REFERRAL_STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b', APPROVED: '#4ade80', REJECTED: '#f87171',
}

function BusinessPartnersTab() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', occupation: '', notes: '', appointmentDate: '' })
  const [showReferForm, setShowReferForm] = useState(false)
  const [referForm, setReferForm] = useState({ firstName: '', lastName: '', email: '', phone: '', state: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [referError, setReferError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/agents/partners').then(r => r.json()),
      fetch('/api/agents/referrals').then(r => r.json()),
    ]).then(([pd, rd]: [{ partners: Partner[] }, { referrals: Referral[] }]) => {
      setPartners(pd.partners ?? [])
      setReferrals(rd.referrals ?? [])
      setLoading(false)
    })
  }, [])

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', occupation: '', notes: '', appointmentDate: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (p: Partner) => {
    setForm({
      name: p.name, email: p.email ?? '', phone: p.phone ?? '',
      occupation: p.occupation ?? '', notes: p.notes ?? '',
      appointmentDate: p.appointmentDate ? p.appointmentDate.slice(0, 10) : '',
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        const res = await fetch('/api/agents/partners', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...form }),
        })
        const updated = await res.json() as Partner
        setPartners(prev => prev.map(p => p.id === editingId ? updated : p))
      } else {
        const res = await fetch('/api/agents/partners', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const p = await res.json() as Partner
        setPartners(prev => [...prev, p])
      }
      resetForm()
    } finally { setSaving(false) }
  }

  const handleRefer = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setReferError(null)
    try {
      const res = await fetch('/api/agents/referrals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(referForm),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setReferError(d.error ?? 'Failed to submit')
        return
      }
      const r = await res.json() as Referral
      setReferrals(prev => [r, ...prev])
      setReferForm({ firstName: '', lastName: '', email: '', phone: '', state: '', notes: '' })
      setShowReferForm(false)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Refer a New Agent */}
      <div style={{ ...card, padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={sectionLabel}>Refer a New Agent</div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>Submit someone to join your team. The coordinator will review and send them an invite.</div>
          </div>
          <button onClick={() => setShowReferForm(!showReferForm)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            + Refer
          </button>
        </div>

        {showReferForm && (
          <form onSubmit={handleRefer} style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16, background: 'rgba(201,169,110,0.03)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.12)' }}>
            <div><label style={fieldLabel}>First Name *</label><input required style={inputStyle} value={referForm.firstName} onChange={e => setReferForm(f => ({ ...f, firstName: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Last Name *</label><input required style={inputStyle} value={referForm.lastName} onChange={e => setReferForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Email *</label><input required type="email" style={inputStyle} value={referForm.email} onChange={e => setReferForm(f => ({ ...f, email: e.target.value }))} placeholder="recruit@email.com" /></div>
            <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={referForm.phone} onChange={e => setReferForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label style={fieldLabel}>State</label><input style={inputStyle} value={referForm.state} onChange={e => setReferForm(f => ({ ...f, state: e.target.value }))} placeholder="e.g., CA" /></div>
            <div><label style={fieldLabel}>Notes</label><input style={inputStyle} value={referForm.notes} onChange={e => setReferForm(f => ({ ...f, notes: e.target.value }))} placeholder="How do you know them?" /></div>
            {referError && <div style={{ gridColumn: 'span 2', fontSize: 11, color: '#f87171' }}>{referError}</div>}
            <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Submitting...' : 'Submit for Approval'}
              </button>
              <button type="button" onClick={() => setShowReferForm(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        )}

        {referrals.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Name', 'Email', 'State', 'Status', 'Submitted'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {referrals.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{r.firstName} {r.lastName}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{r.email}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{r.state ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: REFERRAL_STATUS_COLORS[r.status] ?? '#6B8299' }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#4B5563' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Business Partners / Contacts */}
      <div style={{ ...card, padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={sectionLabel}>Contacts & Prospects ({partners.length})</div>
          <button onClick={() => { resetForm(); setShowForm(!showForm) }} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            + Add
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
            <div><label style={fieldLabel}>Name *</label><input required style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Email</label><input type="email" style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@email.com" /></div>
            <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Occupation</label><input style={inputStyle} value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Appt Date</label><input type="date" style={inputStyle} value={form.appointmentDate} onChange={e => setForm(f => ({ ...f, appointmentDate: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Notes</label><input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
              <button type="button" onClick={resetForm} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        )}

        {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
          partners.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No contacts yet. Add your top prospects.</div> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Name', 'Email', 'Phone', 'Occupation', 'Appt Date', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {partners.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{p.name}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.email ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.phone ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.occupation ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.appointmentDate ? new Date(p.appointmentDate).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button onClick={() => startEdit(p)} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}

// ─── Policies Tab ──────────────────────────────────────────────────────────────

function PoliciesTab() {
  const [policies, setPolicies] = useState<{ id: string; clientName: string; carrier: string; product: string; targetPremium: number | null; dateSubmitted: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ clientName: '', carrier: '', product: '', targetPremium: '', dateSubmitted: '' })

  useEffect(() => {
    fetch('/api/agents/policies').then(r => r.json()).then((d: typeof policies) => { setPolicies(d ?? []); setLoading(false) })
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/agents/policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, targetPremium: form.targetPremium ? parseFloat(form.targetPremium) : undefined }) })
    const p = await res.json() as typeof policies[0]
    setPolicies(prev => [p, ...prev])
    setForm({ clientName: '', carrier: '', product: '', targetPremium: '', dateSubmitted: '' })
    setShowForm(false)
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={sectionLabel}>Policy Tracker ({policies.length})</div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
      </div>
      {showForm && (
        <form onSubmit={add} style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
          <div><label style={fieldLabel}>Client Name *</label><input required style={inputStyle} value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Carrier *</label><input required style={inputStyle} value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Product *</label><input required style={inputStyle} value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Target Premium</label><input type="number" style={inputStyle} value={form.targetPremium} onChange={e => setForm(f => ({ ...f, targetPremium: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Date Submitted</label><input type="date" style={inputStyle} value={form.dateSubmitted} onChange={e => setForm(f => ({ ...f, dateSubmitted: e.target.value }))} /></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
            <button type="submit" style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        policies.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No policies yet.</div> :
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Client', 'Carrier', 'Product', 'Premium', 'Date'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {policies.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{p.clientName}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.carrier}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.product}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#C9A96E' }}>{p.targetPremium ? `$${p.targetPremium.toLocaleString()}` : '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.dateSubmitted ? new Date(p.dateSubmitted).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    </div>
  )
}

// ─── Call Logs Tab ─────────────────────────────────────────────────────────────

interface CallLogRow {
  id: string
  callDate: string
  contactName: string
  phoneNumber: string | null
  subject: string | null
  result: string | null
  followUpNeeded: boolean
  review: {
    id: string
    overallScore: number
    flaggedForCoaching: boolean
    reviewedAt: string
  } | null
}

function CallLogsTab() {
  const isMobile = useIsMobile()
  const [calls, setCalls] = useState<CallLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    callDate: new Date().toISOString().split('T')[0],
    contactName: '',
    phoneNumber: '',
    subject: '',
    result: '',
    followUpNeeded: false,
    transcriptText: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [analyzingCallIds, setAnalyzingCallIds] = useState<Set<string>>(new Set())
  const [viewingReview, setViewingReview] = useState<{ call: CallLogRow; review: CallReviewData } | null>(null)

  const fetchCalls = useCallback(() => {
    fetch('/api/agents/calls')
      .then(r => r.json())
      .then((d: { calls: CallLogRow[] }) => {
        setCalls(d.calls ?? [])
        setLoading(false)
      })
  }, [])

  useEffect(() => { fetchCalls() }, [fetchCalls])

  // Poll for review completion on any analyzing calls
  useEffect(() => {
    if (analyzingCallIds.size === 0) return
    const timer = setInterval(async () => {
      for (const callId of analyzingCallIds) {
        const res = await fetch(`/api/agents/calls/${callId}/review`)
        if (res.ok) {
          const data = await res.json() as { review: CallReviewData | null }
          if (data.review) {
            setAnalyzingCallIds(prev => {
              const next = new Set(prev)
              next.delete(callId)
              return next
            })
            setCalls(prev => prev.map(c => c.id === callId ? {
              ...c,
              review: {
                id: data.review!.id,
                overallScore: data.review!.overallScore,
                flaggedForCoaching: data.review!.flaggedForCoaching,
                reviewedAt: data.review!.reviewedAt,
              },
            } : c))
          }
        }
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [analyzingCallIds])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/agents/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to save call')
        setSubmitting(false)
        return
      }
      const data = await res.json() as { call: CallLogRow; hasTranscript: boolean }
      const newCall: CallLogRow = { ...data.call, review: null }
      setCalls(prev => [newCall, ...prev])
      setForm({
        callDate: new Date().toISOString().split('T')[0],
        contactName: '', phoneNumber: '', subject: '', result: '',
        followUpNeeded: false, transcriptText: '',
      })
      setShowForm(false)
      setSubmitting(false)

      // If transcript submitted, trigger analysis
      if (data.hasTranscript) {
        setAnalyzingCallIds(prev => new Set(prev).add(newCall.id))
        fetch(`/api/agents/calls/${newCall.id}/review`, { method: 'POST' })
          .then(r => r.json())
          .then((d: { review?: CallReviewData; error?: string }) => {
            if (d.review) {
              setAnalyzingCallIds(prev => {
                const next = new Set(prev)
                next.delete(newCall.id)
                return next
              })
              setCalls(prev => prev.map(c => c.id === newCall.id ? {
                ...c,
                review: {
                  id: d.review!.id,
                  overallScore: d.review!.overallScore,
                  flaggedForCoaching: d.review!.flaggedForCoaching,
                  reviewedAt: d.review!.reviewedAt,
                },
              } : c))
            } else if (d.error) {
              setAnalyzingCallIds(prev => {
                const next = new Set(prev)
                next.delete(newCall.id)
                return next
              })
              setError(d.error)
            }
          })
      }
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  const openReview = async (call: CallLogRow) => {
    if (!call.review) return
    const res = await fetch(`/api/agents/calls/${call.id}/review`)
    if (!res.ok) return
    const data = await res.json() as { review: CallReviewData | null }
    if (data.review) setViewingReview({ call, review: data.review })
  }

  const formRow: React.CSSProperties = isMobile
    ? { display: 'flex', flexDirection: 'column', gap: 12 }
    : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

  return (
    <>
      <div style={{ ...card, padding: isMobile ? '18px 16px' : '24px 28px' }}>
        {/* ── Hero explainer card ── */}
        <div style={{
          marginBottom: 20,
          padding: '16px 18px',
          borderRadius: 6,
          background: 'linear-gradient(135deg, rgba(201,169,110,0.08), rgba(201,169,110,0.02))',
          border: '1px solid rgba(201,169,110,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(201,169,110,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(201,169,110,0.35)',
              flexShrink: 0,
            }}>
              <span style={{ color: '#C9A96E', fontSize: 13 }}>◆</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>AI Call Coaching</div>
          </div>
          <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.55 }}>
            After each call, paste your Fathom transcript here. Claude reviews it against the AFF methodology and gives you concrete coaching tips in about 10 seconds. Your scores stay private — they&apos;re for your growth, not a leaderboard. Trainers can see them to coach you, but nothing affects phase promotion.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
          <div style={sectionLabel}>Call Logs ({calls.length})</div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4,
              padding: '10px 16px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer', minHeight: 40,
            }}
          >
            {showForm ? 'Cancel' : '+ Log Call'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={add}
            style={{
              marginBottom: 20,
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: 16, background: 'rgba(255,255,255,0.02)',
              borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
            }}
          >
            <div style={formRow}>
              <div>
                <label style={fieldLabel}>Date *</label>
                <input
                  required type="date" style={inputStyle}
                  value={form.callDate}
                  onChange={e => setForm(f => ({ ...f, callDate: e.target.value }))}
                />
              </div>
              <div>
                <label style={fieldLabel}>Contact Name *</label>
                <input
                  required style={inputStyle}
                  value={form.contactName}
                  onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                />
              </div>
            </div>
            <div style={formRow}>
              <div>
                <label style={fieldLabel}>Phone</label>
                <input
                  style={inputStyle} inputMode="tel"
                  value={form.phoneNumber}
                  onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))}
                />
              </div>
              <div>
                <label style={fieldLabel}>Subject</label>
                <input
                  style={inputStyle}
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Result</label>
              <input
                style={inputStyle}
                placeholder="e.g. scheduled follow-up, client signed, not interested"
                value={form.result}
                onChange={e => setForm(f => ({ ...f, result: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
              <input
                type="checkbox" id="fu"
                checked={form.followUpNeeded}
                onChange={e => setForm(f => ({ ...f, followUpNeeded: e.target.checked }))}
                style={{ accentColor: '#C9A96E', width: 16, height: 16 }}
              />
              <label htmlFor="fu" style={{ fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>
                Follow-up needed
              </label>
            </div>

            {/* Transcript section */}
            <div style={{ borderTop: '1px dashed rgba(201,169,110,0.15)', paddingTop: 14, marginTop: 4 }}>
              <label style={{ ...fieldLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#C9A96E' }}>◆</span> Paste Fathom Transcript (optional)
              </label>
              <textarea
                value={form.transcriptText}
                onChange={e => setForm(f => ({ ...f, transcriptText: e.target.value }))}
                placeholder="Paste your Fathom transcript here to get AI coaching feedback. Needs at least 100 words. From Fathom: open the call, click Share, choose Copy Transcript."
                rows={isMobile ? 6 : 7}
                style={{
                  ...inputStyle,
                  minHeight: 140, fontFamily: 'inherit',
                  resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
              {form.transcriptText.trim().length > 0 && (
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4 }}>
                  {form.transcriptText.trim().split(/\s+/).length} words — Claude will review this after you save.
                </div>
              )}
            </div>

            {error && (
              <div style={{ fontSize: 11, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column-reverse' : 'row', paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={submitting}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#9BB0C4', borderRadius: 4,
                  padding: '12px 18px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: submitting ? 'wait' : 'pointer',
                  minHeight: 44, flex: isMobile ? undefined : 'none',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: submitting ? 'rgba(201,169,110,0.5)' : '#C9A96E',
                  color: '#142D48', border: 'none', borderRadius: 4,
                  padding: '12px 20px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: submitting ? 'wait' : 'pointer',
                  minHeight: 44, flex: 1,
                }}
              >
                {submitting ? 'Saving...' : (form.transcriptText.trim() ? 'Save & Analyze' : 'Save Call')}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
        ) : calls.length === 0 ? (
          <div style={{
            position: 'relative',
            padding: 'clamp(32px, 6vw, 56px) clamp(20px, 4vw, 32px)',
            borderRadius: 8,
            overflow: 'hidden',
            backgroundImage: "linear-gradient(135deg, rgba(10,22,40,0.85) 0%, rgba(19,34,56,0.7) 100%), url('/brand/phone-marble.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '1px solid rgba(201,169,110,0.15)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
              Ready when you are
            </div>
            <div style={{ fontSize: 'clamp(16px, 3vw, 18px)', color: '#ffffff', fontWeight: 500, marginBottom: 6, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
              Your coaching history starts here
            </div>
            <div style={{ fontSize: 12, color: '#9BB0C4', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
              Paste a Fathom transcript into <strong style={{ color: '#C9A96E' }}>+ Log Call</strong> and Claude will give you concrete coaching tips in about 10 seconds — tailored to what actually happened on your call.
            </div>
          </div>
        ) : isMobile ? (
          // Mobile: stacked cards
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {calls.map(c => <CallRowMobile key={c.id} call={c} analyzing={analyzingCallIds.has(c.id)} onViewReview={() => openReview(c)} />)}
          </div>
        ) : (
          // Desktop: table
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Date', 'Contact', 'Subject', 'Result', 'Follow Up', 'AI Review'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {calls.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(c.callDate).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{c.contactName}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{c.subject ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{c.result ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: c.followUpNeeded ? '#f59e0b' : '#4B5563' }}>{c.followUpNeeded ? 'Yes' : 'No'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <ReviewCell call={c} analyzing={analyzingCallIds.has(c.id)} onClick={() => openReview(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingReview && (
        <CallReviewModal
          review={viewingReview.review}
          callDate={viewingReview.call.callDate}
          contactName={viewingReview.call.contactName}
          onClose={() => setViewingReview(null)}
        />
      )}
    </>
  )
}

function ReviewCell({ call, analyzing, onClick }: { call: CallLogRow; analyzing: boolean; onClick: () => void }) {
  if (analyzing) {
    return <span style={{ fontSize: 11, color: '#C9A96E', fontStyle: 'italic' }}>Analyzing...</span>
  }
  if (!call.review) {
    return <span style={{ fontSize: 11, color: '#4B5563' }}>—</span>
  }
  const color = call.review.overallScore >= 80 ? '#4ade80' : call.review.overallScore >= 60 ? '#f59e0b' : '#f87171'
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${color}40`,
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 11, fontWeight: 700,
        color,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        minHeight: 28,
      }}
    >
      {call.review.overallScore}
      {call.review.flaggedForCoaching && <span>⚑</span>}
      <span style={{ opacity: 0.7, fontSize: 9 }}>VIEW</span>
    </button>
  )
}

function CallRowMobile({ call, analyzing, onViewReview }: { call: CallLogRow; analyzing: boolean; onViewReview: () => void }) {
  const scoreColor = call.review
    ? call.review.overallScore >= 80 ? '#4ade80' : call.review.overallScore >= 60 ? '#f59e0b' : '#f87171'
    : '#4B5563'
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(201,169,110,0.08)',
      borderRadius: 6,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', marginBottom: 2 }}>{call.contactName}</div>
          <div style={{ fontSize: 10, color: '#6B8299' }}>
            {new Date(call.callDate).toLocaleDateString()} {call.subject ? `· ${call.subject}` : ''}
          </div>
          {call.result && (
            <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 6 }}>{call.result}</div>
          )}
        </div>
        {analyzing ? (
          <div style={{ fontSize: 10, color: '#C9A96E', fontStyle: 'italic', flexShrink: 0 }}>Analyzing...</div>
        ) : call.review ? (
          <button
            onClick={onViewReview}
            style={{
              background: `${scoreColor}12`,
              border: `1px solid ${scoreColor}50`,
              borderRadius: 4,
              padding: '8px 10px',
              fontSize: 12, fontWeight: 700,
              color: scoreColor,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              minHeight: 40, minWidth: 56,
              flexShrink: 0,
            }}
          >
            {call.review.overallScore}
            {call.review.flaggedForCoaching && <span style={{ fontSize: 10 }}>⚑</span>}
          </button>
        ) : null}
      </div>
      {call.followUpNeeded && (
        <div style={{
          marginTop: 8, display: 'inline-block',
          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: '#f59e0b',
          padding: '3px 8px', borderRadius: 3,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
        }}>
          Follow-up needed
        </div>
      )}
    </div>
  )
}
