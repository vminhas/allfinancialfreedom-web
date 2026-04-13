'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { PHASE_LABELS, PHASE_ITEMS, CARRIERS } from '@/lib/agent-constants'

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
  phase: number
  phaseLabel: { title: string; standard: string; goal: string; description: string; nextStep: string }
  phaseStartedAt: string | null
  status: string
  goal: string | null
  cft: string | null
  discordRoleName: string | null
  icaDate: string | null
  licenseNumber: string | null
  allPhaseProgress: PhaseProgress[]
  phaseItems: PhaseItem[]
  carrierAppointments: CarrierAppointment[]
  milestones: Milestone[]
  counts: { businessPartners: number; policies: number; callLogs: number }
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

export default function AgentDashboard() {
  const router = useRouter()
  const [data, setData] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'checklist' | 'carriers' | 'partners' | 'policies' | 'calls'>('checklist')
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

  const fetchData = async () => {
    const res = await fetch('/api/agents/me')
    if (res.status === 401) { router.push('/agents/login'); return }
    if (!res.ok) { setLoading(false); return }
    setData(await res.json() as AgentData)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

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

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628' }}>
      {/* Top nav */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#0A1628',
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </span>
          <span style={{ marginLeft: 12, fontSize: 12, color: '#4B5563' }}>Agent Portal</span>
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

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 26, fontWeight: 300, color: '#ffffff' }}>
            My Progression
          </div>
          <div style={{ fontSize: 13, color: '#6B8299', marginTop: 4 }}>
            {data.state && `${data.state} · `}
            {data.cft && `Trainer: ${data.cft} · `}
            {data.icaDate && `Started: ${new Date(data.icaDate).toLocaleDateString()}`}
          </div>
        </div>

        {/* Discord role + quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
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

        {/* Phase roadmap */}
        <div style={{ ...card, padding: '24px 28px', marginBottom: 28 }}>
          <div style={sectionLabel}>Your Journey</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((phase, idx) => {
              const prog = data.allPhaseProgress.find(p => p.phase === phase)
              const isCurrent = phase === data.phase
              const isDone = phase < data.phase
              const isFuture = phase > data.phase
              const pct = prog?.pct ?? 0

              return (
                <div key={phase} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 140 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    {/* Node */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: isDone ? '#4ade80' : isCurrent ? PHASE_COLORS[phase] : 'transparent',
                        border: `2px solid ${isDone ? '#4ade80' : isCurrent ? PHASE_COLORS[phase] : 'rgba(255,255,255,0.1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isDone ? 16 : 13, fontWeight: 700,
                        color: isDone ? '#0A1628' : isCurrent ? '#0A1628' : '#4B5563',
                        position: 'relative', zIndex: 1,
                        transition: 'all 0.3s',
                      }}>
                        {isDone ? '✓' : phase}
                      </div>
                    </div>
                    {/* Label */}
                    <div style={{ fontSize: 11, fontWeight: isCurrent ? 700 : 400, color: isFuture ? '#4B5563' : '#9BB0C4', marginBottom: 4 }}>
                      {PHASE_LABELS[phase].title}
                    </div>
                    <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 6 }}>
                      {PHASE_LABELS[phase].standard}
                    </div>
                    {/* Progress bar for current */}
                    {isCurrent && (
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, margin: '0 8px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: PHASE_COLORS[phase], borderRadius: 2, transition: 'width 0.5s' }} />
                      </div>
                    )}
                    {isDone && (
                      <div style={{ fontSize: 10, color: '#4ade80' }}>Complete</div>
                    )}
                  </div>
                  {/* Connector line */}
                  {idx < 4 && (
                    <div style={{
                      height: 2, flex: 'none', width: 24, marginTop: 17,
                      background: isDone ? '#4ade80' : 'rgba(255,255,255,0.06)',
                      transition: 'background 0.3s',
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {(['checklist', 'carriers', 'partners', 'policies', 'calls'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none', border: 'none',
                padding: '8px 16px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: activeTab === tab ? '#C9A96E' : '#6B8299',
                borderBottom: activeTab === tab ? '2px solid #C9A96E' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab === 'checklist' ? `Phase ${data.phase}` : tab}
            </button>
          ))}
        </div>

        {/* Checklist tab */}
        {activeTab === 'checklist' && (
          <div>
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
                {/* Phase description */}
                <div style={{
                  background: 'rgba(201,169,110,0.04)',
                  border: '1px solid rgba(201,169,110,0.1)',
                  borderRadius: 6, padding: '12px 14px',
                  fontSize: 12, color: '#9BB0C4', lineHeight: 1.6,
                }}>
                  {data.phaseLabel.description}
                  <div style={{ marginTop: 8, fontSize: 11, color: '#C9A96E', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ flexShrink: 0 }}>→</span>
                    <span>{data.phaseLabel.nextStep}</span>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginBottom: 24 }}>
                <div style={{
                  height: '100%',
                  width: `${currentPhaseProgress?.pct ?? 0}%`,
                  background: PHASE_COLORS[data.phase],
                  borderRadius: 3,
                  transition: 'width 0.5s',
                }} />
              </div>

              {/* Checklist items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(PHASE_ITEMS[data.phase] ?? []).map(item => {
                  const phaseItem = currentPhaseItems.find(i => i.itemKey === item.key)
                  const done = phaseItem?.completed ?? false
                  const isToggling = togglingKey === item.key

                  return (
                    <button
                      key={item.key}
                      onClick={() => toggleItem(item.key, data.phase, done)}
                      disabled={isToggling}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 6,
                        background: done ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                        cursor: isToggling ? 'not-allowed' : 'pointer',
                        textAlign: 'left', width: '100%',
                        transition: 'all 0.15s',
                        opacity: isToggling ? 0.6 : 1,
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                        background: done ? '#4ade80' : 'transparent',
                        border: `2px solid ${done ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: '#0A1628', fontWeight: 700,
                        transition: 'all 0.2s',
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
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Carriers tab */}
        {activeTab === 'carriers' && (
          <div style={{ ...card, padding: '24px 28px' }}>
            <div style={sectionLabel}>Carrier Appointments</div>
            <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 20 }}>
              Your carrier appointment statuses are managed by your trainer/admin.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {CARRIERS.map(carrier => {
                const appt = data.carrierAppointments.find(c => c.carrier === carrier)
                const status = appt?.status ?? 'NOT_STARTED'
                return (
                  <div key={carrier} style={{
                    padding: '12px 16px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid rgba(255,255,255,0.05)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#9BB0C4' }}>{carrier}</div>
                      {appt?.producerNumber && (
                        <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2 }}>#{appt.producerNumber}</div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: APPT_COLORS[status] }}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Partners tab */}
        {activeTab === 'partners' && (
          <BusinessPartnersTab />
        )}

        {/* Policies tab */}
        {activeTab === 'policies' && (
          <PoliciesTab />
        )}

        {/* Calls tab */}
        {activeTab === 'calls' && (
          <CallLogsTab />
        )}
      </div>
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

  const inputStyle = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }
  const fieldLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C9A96E', display: 'block', marginBottom: 4 }

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

  const inputStyle = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }
  const fieldLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C9A96E', display: 'block', marginBottom: 4 }

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

  const inputStyle = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }
  const fieldLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C9A96E', display: 'block', marginBottom: 4 }

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
