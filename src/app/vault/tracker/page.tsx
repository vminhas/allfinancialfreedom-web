'use client'

import { useState, useEffect, useCallback } from 'react'
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
  ssn: string | null
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

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (phaseFilter) params.set('phase', phaseFilter)
    if (statusFilter) params.set('status', statusFilter)
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
            {[
              { label: 'Active Agents', value: stats.activeAgents, sub: `${stats.inactiveAgents} inactive`, color: '#4ade80' },
              { label: 'At Risk', value: stats.atRiskCount, sub: `${stats.behindCount} behind`, color: '#f87171' },
              { label: 'New This Month', value: stats.newThisMonth, sub: 'ICA dates', color: '#C9A96E' },
              { label: 'Active Logins (30d)', value: stats.activeLoginsLast30d, sub: 'portal activity', color: '#9B6DFF' },
              { label: 'Total Pipeline', value: stats.totalAgents, sub: 'all time', color: '#9BB0C4' },
            ].map(kpi => (
              <div key={kpi.label} style={{
                background: '#142D48',
                border: '1px solid rgba(201,169,110,0.08)',
                borderRadius: 6, padding: '16px 20px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: kpi.color, lineHeight: 1, marginBottom: 4 }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: 11, color: '#4B5563' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Phase pipeline */}
          <div style={{
            background: '#142D48',
            border: '1px solid rgba(201,169,110,0.08)',
            borderRadius: 6, padding: '18px 24px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 16 }}>
              Agent Pipeline by Phase
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              {stats.phaseDistribution.map(({ phase, count, activeCount }) => {
                const pct = stats.totalAgents > 0 ? (count / stats.totalAgents) * 100 : 0
                return (
                  <div key={phase} style={{ flex: 1, minWidth: 0 }}>
                    {/* Bar */}
                    <div style={{ height: 48, background: 'rgba(255,255,255,0.03)', borderRadius: 4, overflow: 'hidden', marginBottom: 8, position: 'relative' }}>
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: `${Math.max(pct * 2, 4)}%`,
                        background: PHASE_COLORS[phase],
                        opacity: 0.7,
                        transition: 'height 0.6s cubic-bezier(0.34,1.56,0.64,1)',
                      }} />
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 700, color: count > 0 ? '#ffffff' : '#4B5563',
                      }}>
                        {count}
                      </div>
                    </div>
                    {/* Label */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: PHASE_COLORS[phase], marginBottom: 2 }}>
                        P{phase}
                      </div>
                      <div style={{ fontSize: 9, color: '#4B5563' }}>{PHASE_LABELS[phase].title}</div>
                      {activeCount < count && (
                        <div style={{ fontSize: 9, color: '#4B5563', marginTop: 2 }}>{activeCount} active</div>
                      )}
                    </div>
                  </div>
                )
              })}
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9BB0C4', cursor: 'pointer', padding: '7px 12px', background: atRiskOnly ? 'rgba(248,113,113,0.08)' : 'transparent', border: `1px solid ${atRiskOnly ? 'rgba(248,113,113,0.3)' : 'rgba(201,169,110,0.15)'}`, borderRadius: 4 }}>
          <input
            type="checkbox"
            checked={atRiskOnly}
            onChange={e => setAtRiskOnly(e.target.checked)}
            style={{ accentColor: '#f87171' }}
          />
          At-Risk Only
        </label>
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
                inviteLoading={inviteLoading}
                inviteMsg={inviteMsg}
                onClose={() => { setSelectedAgent(null); setInviteMsg('') }}
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
  inviteLoading,
  inviteMsg,
  onClose,
}: {
  agent: DetailedAgent
  onAdvancePhase: () => void
  onUpdateCarrier: (carrier: string, status: string, producerNumber: string) => void
  onSendInvite: () => void
  inviteLoading: boolean
  inviteMsg: string
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'progress' | 'carriers' | 'info'>('progress')
  const [editingCarrier, setEditingCarrier] = useState<string | null>(null)
  const [carrierStatus, setCarrierStatus] = useState('')
  const [carrierPN, setCarrierPN] = useState('')

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
        <div>
          <div style={{ fontSize: 22, fontWeight: 500, color: '#ffffff', letterSpacing: '-0.01em' }}>
            {agent.firstName} {agent.lastName}
          </div>
          <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4 }}>
            {agent.agentCode} · {agent.state ?? 'No state'} · {agent.email}
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['progress', 'carriers', 'info'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none', border: 'none',
              padding: '8px 16px', cursor: 'pointer',
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
            <div><label style={fieldLabel}>State</label><input style={inputStyle} value={form.state} onChange={set('state')} placeholder="TX" maxLength={2} /></div>
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
