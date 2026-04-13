'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  PHASE_LABELS, PHASE_ITEMS, CARRIERS,
  CARRIER_UNLOCK_PHASE, LICENSING_CHECKLIST, SYSTEM_PROGRESSIONS,
} from '@/lib/agent-constants'

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
  email: string
  phase: number
  phaseLabel: { title: string; standard: string; goal: string; description: string; nextStep: string }
  phaseStartedAt: string | null
  status: string
  goal: string | null
  cft: string | null
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

export default function AgentDashboard() {
  const router = useRouter()
  const [data, setData] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'checklist' | 'licensing' | 'carriers' | 'partners' | 'policies' | 'calls' | 'profile'>('checklist')
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/agents/me')
    if (res.status === 401) { router.push('/agents/login'); return }
    if (!res.ok) { setLoading(false); return }
    setData(await res.json() as AgentData)
    setLoading(false)
  }, [router])

  useEffect(() => { fetchData() }, [fetchData])

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

  const currentPhaseItems = data.phaseItems.filter(i => i.phase === data.phase)
  const currentPhaseProgress = data.allPhaseProgress.find(p => p.phase === data.phase)
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
    { key: 'checklist', label: `Phase ${data.phase}` },
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
        padding: '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </span>
          <span style={{ marginLeft: 12, fontSize: 11, color: '#4B5563' }}>Agent Portal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#6B8299' }}>{data.firstName} {data.lastName} · {data.agentCode}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/agents/login' })}
            style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 12, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '36px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 300, color: '#ffffff' }}>My Progression</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
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
                return (
                  <div
                    key={prog.key}
                    title={prog.description}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '10px 12px', borderRadius: 6, cursor: 'default',
                      minWidth: 76, maxWidth: 84, textAlign: 'center',
                      background: achieved ? 'rgba(201,169,110,0.1)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${achieved ? 'rgba(201,169,110,0.35)' : 'rgba(255,255,255,0.05)'}`,
                      boxShadow: achieved ? '0 0 12px rgba(201,169,110,0.15)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {/* Badge icon */}
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
                  </div>
                )
              })}
            </div>
          </div>
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
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={sectionLabel}>Phase {data.phase} — {data.phaseLabel.title}</div>
                  <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 2 }}>{data.phaseLabel.standard} · Goal: {data.phaseLabel.goal}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: PHASE_COLORS[data.phase] }}>
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
                {data.phaseLabel.description}
                <div style={{ marginTop: 8, fontSize: 11, color: '#C9A96E', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ flexShrink: 0 }}>→</span>
                  <span>{data.phaseLabel.nextStep}</span>
                </div>
              </div>
            </div>

            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginBottom: 24 }}>
              <div style={{
                height: '100%', width: `${currentPhaseProgress?.pct ?? 0}%`,
                background: PHASE_COLORS[data.phase], borderRadius: 3, transition: 'width 0.5s',
              }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(PHASE_ITEMS[data.phase] ?? []).map(item => {
                const phaseItem = currentPhaseItems.find(i => i.itemKey === item.key)
                const done = phaseItem?.completed ?? false
                const isToggling = togglingKey === item.key
                const isExpanded = expandedItem === item.key

                return (
                  <div key={item.key} style={{ borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      {/* Checkbox button */}
                      <button
                        onClick={() => toggleItem(item.key, data.phase, done)}
                        disabled={isToggling}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '11px 16px', flex: 1,
                          background: done ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                          borderRight: item.tab ? `1px solid ${done ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}` : undefined,
                          cursor: isToggling ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                          opacity: isToggling ? 0.6 : 1,
                          borderRadius: isExpanded ? '6px 6px 0 0' : '6px',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          background: done ? '#4ade80' : 'transparent',
                          border: `2px solid ${done ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#0A1628', fontWeight: 700,
                        }}>
                          {done && '✓'}
                        </div>
                        <span style={{ fontSize: 13, color: done ? '#9BB0C4' : '#ffffff', flex: 1 }}>
                          {item.label}
                        </span>
                        {phaseItem?.completedAt && (
                          <span style={{ fontSize: 10, color: '#4B5563', flexShrink: 0 }}>
                            {new Date(phaseItem.completedAt).toLocaleDateString()}
                          </span>
                        )}
                        {/* Description expand toggle */}
                        <button
                          onClick={e => { e.stopPropagation(); setExpandedItem(isExpanded ? null : item.key) }}
                          style={{ background: 'none', border: 'none', color: '#4B5563', fontSize: 11, cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                        {item.tab && (
                          <button
                            onClick={e => { e.stopPropagation(); setActiveTab(item.tab as typeof activeTab) }}
                            style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}
                            title={`Go to ${item.tab} tab`}
                          >
                            →
                          </button>
                        )}
                      </button>
                    </div>
                    {/* Expanded description */}
                    {isExpanded && (
                      <div style={{
                        padding: '10px 16px 12px 46px',
                        background: done ? 'rgba(74,222,128,0.03)' : 'rgba(255,255,255,0.01)',
                        border: `1px solid ${done ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)'}`,
                        borderTop: 'none',
                        borderRadius: '0 0 6px 6px',
                        fontSize: 12, color: '#6B8299', lineHeight: 1.6,
                      }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                )
              })}
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
          />
        )}

      </div>
    </div>
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

function ProfileTab({ data, onSaved }: { data: AgentData; onSaved: () => void }) {
  const [form, setForm] = useState({
    phone: data.phone ?? '',
    state: data.state ?? '',
    dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
    npn: data.npn ?? '',
    licenseNumber: data.licenseNumber ?? '',
    discordUserId: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
  ]

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/agents/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      setError(d.error ?? 'Save failed')
    } else {
      setSaved(true)
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
            <label style={fieldLabel}>State</label>
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
    </div>
  )
}

// ─── Business Partners Tab ─────────────────────────────────────────────────────

function BusinessPartnersTab() {
  const [partners, setPartners] = useState<{ id: string; name: string; phone: string | null; occupation: string | null; appointmentDate: string | null; notes: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', occupation: '', notes: '', appointmentDate: '' })

  useEffect(() => {
    fetch('/api/agents/partners').then(r => r.json()).then((d: { partners: typeof partners }) => {
      setPartners(d.partners ?? [])
      setLoading(false)
    })
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/agents/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const p = await res.json() as typeof partners[0]
    setPartners(prev => [...prev, p])
    setForm({ name: '', phone: '', occupation: '', notes: '', appointmentDate: '' })
    setShowForm(false)
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={sectionLabel}>Business Partners ({partners.length})</div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={add} style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
          <div><label style={fieldLabel}>Name *</label><input required style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Occupation</label><input style={inputStyle} value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Appt Date</label><input type="date" style={inputStyle} value={form.appointmentDate} onChange={e => setForm(f => ({ ...f, appointmentDate: e.target.value }))} /></div>
          <div style={{ gridColumn: 'span 2' }}><label style={fieldLabel}>Notes</label><input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
            <button type="submit" style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        partners.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No business partners yet. Add your top prospects.</div> :
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Name', 'Phone', 'Occupation', 'Appt Date'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {partners.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{p.name}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.phone ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.occupation ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{p.appointmentDate ? new Date(p.appointmentDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
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

function CallLogsTab() {
  const [calls, setCalls] = useState<{ id: string; callDate: string; contactName: string; phoneNumber: string | null; subject: string | null; result: string | null; followUpNeeded: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ callDate: '', contactName: '', phoneNumber: '', subject: '', result: '', followUpNeeded: false })

  useEffect(() => {
    fetch('/api/agents/calls').then(r => r.json()).then((d: { calls: typeof calls }) => { setCalls(d.calls ?? []); setLoading(false) })
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/agents/calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const c = await res.json() as typeof calls[0]
    setCalls(prev => [c, ...prev])
    setForm({ callDate: '', contactName: '', phoneNumber: '', subject: '', result: '', followUpNeeded: false })
    setShowForm(false)
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={sectionLabel}>Call Logs ({calls.length})</div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Log Call</button>
      </div>
      {showForm && (
        <form onSubmit={add} style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
          <div><label style={fieldLabel}>Date *</label><input required type="date" style={inputStyle} value={form.callDate} onChange={e => setForm(f => ({ ...f, callDate: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Contact Name *</label><input required style={inputStyle} value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Subject</label><input style={inputStyle} value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} /></div>
          <div><label style={fieldLabel}>Result</label><input style={inputStyle} value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
            <input type="checkbox" id="fu" checked={form.followUpNeeded} onChange={e => setForm(f => ({ ...f, followUpNeeded: e.target.checked }))} style={{ accentColor: '#C9A96E' }} />
            <label htmlFor="fu" style={{ fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>Follow-up needed</label>
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
            <button type="submit" style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        calls.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No calls logged yet.</div> :
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Date', 'Contact', 'Subject', 'Result', 'Follow Up'].map(h => (
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
              </tr>
            ))}
          </tbody>
        </table>
      }
    </div>
  )
}
