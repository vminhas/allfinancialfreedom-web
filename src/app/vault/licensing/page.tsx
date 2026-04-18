'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { TOPIC_LABELS, type LicensingRequestTopic } from '@/components/LicensingRequestModal'
import { useIsMobile } from '@/lib/useIsMobile'
import { CARRIERS } from '@/lib/agent-constants'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

interface AdminUserRef {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'LICENSING_COORDINATOR'
}

interface Request {
  id: string
  phaseItemKey: string | null
  topic: LicensingRequestTopic
  message: string
  status: Status
  resolutionNote: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  agentProfile: {
    id: string
    firstName: string
    lastName: string
    agentCode: string
    phone: string | null
    phase: number
    licenseNumber: string | null
    npn: string | null
    examDate?: string | null
    state?: string | null
    agentUser: { email: string }
  }
  assignedTo: AdminUserRef | null
}

interface LicensingAgent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  state: string | null
  phase: number
  phone: string | null
  email: string
  examDate: string | null
  licenseNumber: string | null
  licenseLines: string | null
  npn: string | null
  dateSubmittedToGfi: string | null
  carriersAppointed: number
  carriersTotal: number
  openRequestCount: number
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LicensingWorkspacePage() {
  const { data: session } = useSession()
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const viewerRole = (session?.user as { role?: string } | undefined)?.role ?? null
  const isLC = viewerRole === 'licensing_coordinator'

  const [tab, setTab] = useState<'inbox' | 'agents' | 'referrals' | 'profile'>('inbox')
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [agentsRefreshNonce, setAgentsRefreshNonce] = useState(0)

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 24,
        padding: '28px 0 20px',
        borderBottom: '1px solid rgba(201,169,110,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
              {isLC ? 'Your workspace' : 'Licensing Oversight'}
            </div>
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Licensing Inbox
            </h1>
            <p style={{ color: '#6B8299', fontSize: 13, margin: 0, lineHeight: 1.55 }}>
              {isLC
                ? 'This is where requests from agents come in. Assign them to yourself to start working, then mark them resolved when you\u2019re done.'
                : 'Oversight of all licensing coordinator requests. You can see every inbox, reassign, and jump into any request.'}
            </p>
          </div>
          <button
            onClick={() => setShowAddAgentModal(true)}
            style={{
              background: '#C9A96E', color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: '12px 22px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer', minHeight: 44,
              boxShadow: '0 0 20px rgba(201,169,110,0.2)',
              flexShrink: 0,
            }}
          >
            + Add Agent
          </button>
        </div>
      </div>

      {showAddAgentModal && (
        <LicensingAddAgentModal
          onClose={() => setShowAddAgentModal(false)}
          onCreated={() => {
            setShowAddAgentModal(false)
            setAgentsRefreshNonce(n => n + 1)
          }}
        />
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 24,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {(['inbox', 'agents', 'referrals', 'profile'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', whiteSpace: 'nowrap',
              padding: '12px 18px', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: tab === t ? '#C9A96E' : '#6B8299',
              borderBottom: tab === t ? '2px solid #C9A96E' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t === 'inbox' ? 'Inbox' : t === 'agents' ? 'Agents' : t === 'referrals' ? 'Referrals' : 'Profile'}
          </button>
        ))}
      </div>

      {tab === 'inbox' && <InboxTab viewerId={viewerId} isLC={isLC} />}
      {tab === 'agents' && <AgentsTab refreshNonce={agentsRefreshNonce} />}
      {tab === 'referrals' && <ReferralsTab />}
      {tab === 'profile' && <ProfileTab />}
    </div>
  )
}

// ─── Inbox tab ────────────────────────────────────────────────────────────────

function InboxTab({ viewerId, isLC }: { viewerId: string | null; isLC: boolean }) {
  const isMobile = useIsMobile()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'mine'>(
    isLC ? 'mine' : 'open'
  )
  const [selected, setSelected] = useState<Request | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter === 'open') params.set('status', 'OPEN')
    else if (filter === 'in_progress') params.set('status', 'IN_PROGRESS')
    else if (filter === 'resolved') params.set('status', 'RESOLVED')
    else if (filter === 'mine') params.set('assignedTo', 'me')
    const res = await fetch(`/api/vault/coordinator-requests?${params}`)
    if (res.ok) {
      const d = await res.json() as { requests: Request[] }
      setRequests(d.requests ?? [])
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selected) setResolutionNote(selected.resolutionNote ?? '')
  }, [selected])

  const patch = async (body: Record<string, unknown>) => {
    if (!selected) return
    setSaving(true)
    const res = await fetch(`/api/vault/coordinator-requests/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const d = await res.json() as { request: Request }
      setSelected(d.request)
      setRequests(prev => prev.map(r => r.id === d.request.id ? d.request : r))
    }
    setSaving(false)
  }

  const assignToMe = () => patch({ assignedToId: viewerId, status: 'IN_PROGRESS' })
  const markResolved = () => patch({ status: 'RESOLVED', resolutionNote: resolutionNote || null })
  const markInProgress = () => patch({ status: 'IN_PROGRESS' })
  const reopen = () => patch({ status: 'OPEN' })

  const filterChips: [typeof filter, string, number | null][] = [
    ['all', 'All', null],
    ['open', 'Open', requests.filter(r => r.status === 'OPEN').length],
    ['in_progress', 'In progress', null],
    ['resolved', 'Resolved', null],
    ['mine', 'My requests', null],
  ]

  return (
    <>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {filterChips.map(([key, lbl]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '8px 14px', borderRadius: 999,
              background: filter === key ? 'rgba(201,169,110,0.14)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filter === key ? '#C9A96E' : 'rgba(201,169,110,0.1)'}`,
              color: filter === key ? '#C9A96E' : '#9BB0C4',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer', minHeight: 36,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#6B8299', fontSize: 13, padding: '30px 0' }}>Loading requests...</div>
      ) : requests.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(201,169,110,0.15)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 14, color: '#9BB0C4', marginBottom: 4 }}>Inbox is empty</div>
          <div style={{ fontSize: 12, color: '#6B8299' }}>
            Nothing matches this filter. Try another filter above.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile || !selected ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.2fr)',
          gap: 16,
          alignItems: 'start',
        }}>
          {/* Request list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requests.map(r => (
              <RequestRow
                key={r.id}
                request={r}
                selected={selected?.id === r.id}
                onClick={() => setSelected(r)}
              />
            ))}
          </div>

          {/* Detail panel */}
          {selected && (
            <RequestDetail
              request={selected}
              isLC={isLC}
              resolutionNote={resolutionNote}
              setResolutionNote={setResolutionNote}
              saving={saving}
              viewerId={viewerId}
              onClose={() => setSelected(null)}
              onAssignToMe={assignToMe}
              onMarkInProgress={markInProgress}
              onMarkResolved={markResolved}
              onReopen={reopen}
            />
          )}
        </div>
      )}
    </>
  )
}

function RequestRow({ request, selected, onClick }: { request: Request; selected: boolean; onClick: () => void }) {
  const isOpen = request.status === 'OPEN' || request.status === 'IN_PROGRESS'
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', width: '100%', cursor: 'pointer',
        background: selected ? 'rgba(201,169,110,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? 'rgba(201,169,110,0.35)' : isOpen ? 'rgba(245,158,11,0.2)' : 'rgba(201,169,110,0.08)'}`,
        borderRadius: 6, padding: '14px 16px',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>
            {request.agentProfile.firstName} {request.agentProfile.lastName}
            <span style={{ fontSize: 10, color: '#6B8299', marginLeft: 6 }}>· {request.agentProfile.agentCode} · P{request.agentProfile.phase}</span>
          </div>
          <div style={{ fontSize: 11, color: '#C9A96E', marginTop: 2, fontWeight: 500 }}>
            {TOPIC_LABELS[request.topic]}
          </div>
        </div>
        <StatusPill status={request.status} />
      </div>
      <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.45, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {request.message}
      </div>
      <div style={{ fontSize: 10, color: '#6B8299' }}>
        {timeAgo(request.createdAt)}
        {request.assignedTo && (
          <span style={{ marginLeft: 8, color: '#9B6DFF' }}>
            · assigned to {request.assignedTo.name}
          </span>
        )}
      </div>
    </button>
  )
}

function RequestDetail({
  request, isLC, resolutionNote, setResolutionNote, saving, viewerId,
  onClose, onAssignToMe, onMarkInProgress, onMarkResolved, onReopen,
}: {
  request: Request
  isLC: boolean
  resolutionNote: string
  setResolutionNote: (v: string) => void
  saving: boolean
  viewerId: string | null
  onClose: () => void
  onAssignToMe: () => void
  onMarkInProgress: () => void
  onMarkResolved: () => void
  onReopen: () => void
}) {
  const assignedToMe = request.assignedTo?.id === viewerId
  const canAssign = request.status === 'OPEN' || !request.assignedTo
  const canResolve = request.status === 'IN_PROGRESS' || request.status === 'OPEN'
  const canReopen = request.status === 'RESOLVED' || request.status === 'CLOSED'

  return (
    <div style={{
      background: '#142D48',
      border: '1px solid rgba(201,169,110,0.15)',
      borderRadius: 8,
      padding: 'clamp(16px, 3vw, 24px)',
      position: 'sticky', top: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
            Request detail
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff' }}>
            {request.agentProfile.firstName} {request.agentProfile.lastName}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#9BB0C4', fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>

      {/* Agent contact */}
      <div style={{
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,110,0.08)',
        borderRadius: 6, marginBottom: 14,
        fontSize: 11, color: '#9BB0C4', lineHeight: 1.8,
      }}>
        <div><strong style={{ color: '#C9A96E' }}>Phone:</strong> {request.agentProfile.phone ?? '—'}</div>
        <div><strong style={{ color: '#C9A96E' }}>Email:</strong> {request.agentProfile.agentUser.email}</div>
        <div><strong style={{ color: '#C9A96E' }}>Code:</strong> {request.agentProfile.agentCode} · Phase {request.agentProfile.phase}</div>
        <div><strong style={{ color: '#C9A96E' }}>NPN:</strong> {request.agentProfile.npn ?? '—'} · <strong style={{ color: '#C9A96E' }}>License:</strong> {request.agentProfile.licenseNumber ?? '—'}</div>
      </div>

      {/* Topic + message */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          {TOPIC_LABELS[request.topic]}
        </div>
        <div style={{ fontSize: 13, color: '#d1d9e2', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {request.message}
        </div>
        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6 }}>
          Sent {new Date(request.createdAt).toLocaleString()}
        </div>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299' }}>Status:</span>
        <StatusPill status={request.status} />
        {request.assignedTo && (
          <span style={{ fontSize: 11, color: '#9B6DFF' }}>
            assigned to {assignedToMe ? 'you' : request.assignedTo.name}
          </span>
        )}
      </div>

      {/* Resolution note */}
      {(canResolve || request.status === 'RESOLVED') && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 6 }}>
            Resolution note (visible to the agent)
          </label>
          <textarea
            value={resolutionNote}
            onChange={e => setResolutionNote(e.target.value)}
            rows={3}
            placeholder="What did you help them with? Next steps?"
            disabled={request.status === 'RESOLVED' || request.status === 'CLOSED'}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0A1628',
              border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: 4, color: '#d1d9e2',
              padding: '10px 12px', fontSize: 12,
              fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canAssign && !assignedToMe && (
          <button
            onClick={onAssignToMe}
            disabled={saving}
            style={{
              background: '#C9A96E', color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: '10px 16px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: saving ? 'wait' : 'pointer', minHeight: 40, flex: 1, minWidth: 140,
            }}
          >
            Assign to {isLC ? 'me' : 'me'}
          </button>
        )}
        {request.status === 'OPEN' && assignedToMe && (
          <button
            onClick={onMarkInProgress}
            disabled={saving}
            style={{
              background: 'transparent', color: '#9B6DFF',
              border: '1px solid rgba(155,109,255,0.35)', borderRadius: 4,
              padding: '10px 16px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: saving ? 'wait' : 'pointer', minHeight: 40, flex: 1, minWidth: 140,
            }}
          >
            Mark in progress
          </button>
        )}
        {canResolve && (
          <button
            onClick={onMarkResolved}
            disabled={saving}
            style={{
              background: 'transparent', color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.35)', borderRadius: 4,
              padding: '10px 16px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: saving ? 'wait' : 'pointer', minHeight: 40, flex: 1, minWidth: 140,
            }}
          >
            Mark resolved
          </button>
        )}
        {canReopen && (
          <button
            onClick={onReopen}
            disabled={saving}
            style={{
              background: 'transparent', color: '#9BB0C4',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
              padding: '10px 16px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: saving ? 'wait' : 'pointer', minHeight: 40, flex: 1, minWidth: 140,
            }}
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab({ refreshNonce }: { refreshNonce: number }) {
  const [agents, setAgents] = useState<LicensingAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [needsAttention, setNeedsAttention] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (needsAttention) params.set('needsAttention', '1')
    if (query.trim()) params.set('q', query.trim())
    const res = await fetch(`/api/vault/licensing-agents?${params}`)
    if (res.ok) {
      const d = await res.json() as { agents: LicensingAgent[] }
      setAgents(d.agents ?? [])
    }
    setLoading(false)
  }, [needsAttention, query])

  useEffect(() => { load() }, [load, refreshNonce])

  const updateField = async (id: string, field: string, value: string | null) => {
    const res = await fetch(`/api/vault/licensing-agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      setAgents(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, code, license #, NPN..."
          style={{
            flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box',
            background: '#0C1E30',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#9BB0C4',
            padding: '10px 12px', fontSize: 12,
          }}
        />
        <button
          onClick={() => setNeedsAttention(v => !v)}
          style={{
            padding: '10px 16px', borderRadius: 4,
            background: needsAttention ? 'rgba(248,113,113,0.1)' : 'transparent',
            border: `1px solid ${needsAttention ? 'rgba(248,113,113,0.35)' : 'rgba(201,169,110,0.15)'}`,
            color: needsAttention ? '#f87171' : '#9BB0C4',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', minHeight: 40,
          }}
        >
          {needsAttention ? '✕ Needs attention' : '⚑ Needs attention only'}
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#6B8299', fontSize: 13, padding: '30px 0' }}>Loading agents...</div>
      ) : agents.length === 0 ? (
        <div style={{ fontSize: 12, color: '#6B8299', padding: '20px 0' }}>No agents match this filter.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map(a => (
            <AgentRow
              key={a.id}
              agent={a}
              expanded={expandedId === a.id}
              onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
              onUpdate={updateField}
            />
          ))}
        </div>
      )}
    </>
  )
}

function AgentRow({
  agent, expanded, onToggle, onUpdate,
}: {
  agent: LicensingAgent
  expanded: boolean
  onToggle: () => void
  onUpdate: (id: string, field: string, value: string | null) => void
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${agent.openRequestCount > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(201,169,110,0.08)'}`,
      borderRadius: 6, overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none',
          padding: '14px 16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto',
          gap: 12, alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>
            {agent.firstName} {agent.lastName}
          </div>
          <div style={{ fontSize: 10, color: '#6B8299' }}>
            {agent.agentCode} · {agent.state ?? '—'} · Phase {agent.phase}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#9BB0C4' }}>
          License: <span style={{ color: agent.licenseNumber ? '#ffffff' : '#4B5563' }}>{agent.licenseNumber ?? '—'}</span>
        </div>
        <div style={{ fontSize: 11, color: '#9BB0C4' }}>
          Carriers: <span style={{ color: '#ffffff' }}>{agent.carriersAppointed}/{agent.carriersTotal}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {agent.openRequestCount > 0 && (
            <span style={{
              background: 'rgba(248,113,113,0.12)',
              color: '#f87171', fontSize: 10, fontWeight: 700,
              padding: '3px 8px', borderRadius: 999,
              border: '1px solid rgba(248,113,113,0.3)',
            }}>
              {agent.openRequestCount} ⚑
            </span>
          )}
          <span style={{ color: '#C9A96E', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(201,169,110,0.08)',
          background: 'rgba(255,255,255,0.015)',
        }}>
          <ExpandedAgentDetail agent={agent} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  )
}

// ─── Expanded agent detail (Details / Carriers / Notes sub-tabs) ──────────────

function ExpandedAgentDetail({
  agent,
  onUpdate,
}: {
  agent: LicensingAgent
  onUpdate: (id: string, field: string, value: string | null) => void
}) {
  const [subtab, setSubtab] = useState<'details' | 'carriers' | 'notes'>('details')

  const tabBtn = (t: typeof subtab, label: string) => (
    <button
      key={t}
      onClick={() => setSubtab(t)}
      style={{
        background: 'none', border: 'none', whiteSpace: 'nowrap',
        padding: '10px 14px', cursor: 'pointer',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: subtab === t ? '#C9A96E' : '#6B8299',
        borderBottom: subtab === t ? '2px solid #C9A96E' : '2px solid transparent',
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div style={{ fontSize: 11, color: '#6B8299', padding: '12px 16px 0', lineHeight: 1.5 }}>
        {agent.phone ?? 'No phone'} · {agent.email}
      </div>
      <div style={{
        display: 'flex', gap: 0, marginTop: 8,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 12px',
      }}>
        {tabBtn('details', 'Licensing Details')}
        {tabBtn('carriers', 'Carriers')}
        {tabBtn('notes', 'Notes')}
      </div>

      <div style={{ padding: '14px 16px 16px' }}>
        {subtab === 'details' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <EditableField label="Exam Date" type="date" value={agent.examDate} onSave={v => onUpdate(agent.id, 'examDate', v)} />
            <EditableField label="License #" type="text" value={agent.licenseNumber} onSave={v => onUpdate(agent.id, 'licenseNumber', v)} />
            <EditableField label="NPN" type="text" value={agent.npn} onSave={v => onUpdate(agent.id, 'npn', v)} />
            <EditableField label="License Lines" type="text" value={agent.licenseLines} onSave={v => onUpdate(agent.id, 'licenseLines', v)} />
            <EditableField label="Submitted to GFI" type="date" value={agent.dateSubmittedToGfi} onSave={v => onUpdate(agent.id, 'dateSubmittedToGfi', v)} />
          </div>
        )}

        {subtab === 'carriers' && <CarriersEditor agentId={agent.id} />}
        {subtab === 'notes' && <NotesTimeline agentId={agent.id} />}
      </div>
    </div>
  )
}

// ─── Carriers editor ──────────────────────────────────────────────────────────

interface CarrierAppointmentRow {
  carrier: string
  status: 'NOT_STARTED' | 'PENDING' | 'APPOINTED' | 'JIT'
  producerNumber: string | null
  appointedDate: string | null
}

function CarriersEditor({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<CarrierAppointmentRow[] | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Record<string, { status?: string; producerNumber?: string }>>({})

  useEffect(() => {
    fetch(`/api/admin/agents/${agentId}/carriers`)
      .then(r => r.json())
      .then((data: CarrierAppointmentRow[]) => {
        // Ensure all known carriers are represented (fill missing with NOT_STARTED)
        const byCarrier = new Map(data.map(d => [d.carrier, d]))
        const full = CARRIERS.map(name => byCarrier.get(name) ?? {
          carrier: name,
          status: 'NOT_STARTED' as const,
          producerNumber: null,
          appointedDate: null,
        })
        setRows(full)
      })
  }, [agentId])

  const setLocal = (carrier: string, patch: { status?: string; producerNumber?: string }) => {
    setRows(prev => prev?.map(r => r.carrier === carrier ? { ...r, ...patch } as CarrierAppointmentRow : r) ?? null)
    setDirty(d => ({ ...d, [carrier]: { ...d[carrier], ...patch } }))
  }

  const save = async (carrier: string) => {
    const row = rows?.find(r => r.carrier === carrier)
    if (!row) return
    setSavingKey(carrier)
    await fetch(`/api/admin/agents/${agentId}/carriers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        carrier: row.carrier,
        status: row.status,
        producerNumber: row.producerNumber || undefined,
      }]),
    })
    setDirty(d => {
      const next = { ...d }
      delete next[carrier]
      return next
    })
    setSavingKey(null)
  }

  if (!rows) return <div style={{ fontSize: 12, color: '#6B8299' }}>Loading carriers...</div>

  return (
    <div>
      <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 10, lineHeight: 1.5 }}>
        Set each carrier&apos;s status and enter the producer number when the agent is appointed. Producer numbers are optional but recommended.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(row => {
          const isDirty = !!dirty[row.carrier]
          const isSaving = savingKey === row.carrier
          const statusColor =
            row.status === 'APPOINTED' ? '#4ade80' :
            row.status === 'PENDING'   ? '#f59e0b' :
            row.status === 'JIT'       ? '#9B6DFF' : '#6B8299'
          return (
            <div
              key={row.carrier}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(140px, 1.4fr) minmax(120px, 1fr) minmax(120px, 1.2fr) auto',
                gap: 8,
                alignItems: 'center',
                padding: '8px 10px',
                background: row.status === 'APPOINTED' ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${row.status === 'APPOINTED' ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 12, color: '#ffffff', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.carrier}
              </div>
              <select
                value={row.status}
                onChange={e => setLocal(row.carrier, { status: e.target.value })}
                style={{
                  background: '#0A1628',
                  border: `1px solid ${statusColor}40`,
                  borderRadius: 4, color: statusColor,
                  padding: '7px 8px', fontSize: 11, fontWeight: 600,
                  appearance: 'auto',
                }}
              >
                <option value="NOT_STARTED">Not Started</option>
                <option value="PENDING">Pending</option>
                <option value="APPOINTED">Appointed</option>
                <option value="JIT">JIT</option>
              </select>
              <input
                value={row.producerNumber ?? ''}
                onChange={e => setLocal(row.carrier, { producerNumber: e.target.value })}
                placeholder="Producer #"
                style={{
                  background: '#0A1628',
                  border: '1px solid rgba(201,169,110,0.15)',
                  borderRadius: 4, color: '#d1d9e2',
                  padding: '7px 10px', fontSize: 11,
                  fontFamily: 'monospace',
                  minWidth: 0,
                }}
              />
              {isDirty ? (
                <button
                  onClick={() => save(row.carrier)}
                  disabled={isSaving}
                  style={{
                    background: '#C9A96E', color: '#142D48',
                    border: 'none', borderRadius: 4,
                    padding: '6px 10px', fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: isSaving ? 'wait' : 'pointer',
                    minHeight: 30, whiteSpace: 'nowrap',
                  }}
                >
                  {isSaving ? '...' : 'Save'}
                </button>
              ) : (
                <span style={{ fontSize: 9, color: '#4B5563', textAlign: 'right' }}>—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Notes timeline ───────────────────────────────────────────────────────────

interface NoteAuthor {
  id: string
  name: string
  role: 'ADMIN' | 'LICENSING_COORDINATOR'
}

interface NoteItem {
  id: string
  body: string
  scope: 'LICENSING' | 'ADMIN_ONLY'
  createdAt: string
  updatedAt: string
  author: NoteAuthor
}

function NotesTimeline({ agentId }: { agentId: string }) {
  const { data: session } = useSession()
  const viewerRole = (session?.user as { role?: string } | undefined)?.role
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const isAdminUser = viewerRole === 'admin'

  const [notes, setNotes] = useState<NoteItem[] | null>(null)
  const [draft, setDraft] = useState('')
  const [draftScope, setDraftScope] = useState<'LICENSING' | 'ADMIN_ONLY'>('LICENSING')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/vault/licensing-agents/${agentId}/notes`)
    if (res.ok) {
      const d = await res.json() as { notes: NoteItem[] }
      setNotes(d.notes)
    }
  }, [agentId])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!draft.trim()) return
    setSubmitting(true)
    const res = await fetch(`/api/vault/licensing-agents/${agentId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: draft, scope: isAdminUser ? draftScope : 'LICENSING' }),
    })
    if (res.ok) {
      const d = await res.json() as { note: NoteItem }
      setNotes(prev => [d.note, ...(prev ?? [])])
      setDraft('')
    }
    setSubmitting(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this note?')) return
    const res = await fetch(`/api/vault/licensing-notes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setNotes(prev => prev?.filter(n => n.id !== id) ?? null)
    }
  }

  // Group notes by date label (Today / Yesterday / This week / Month, Year)
  const groupedNotes = (() => {
    if (!notes) return []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const weekAgo = new Date(today.getTime() - 7 * 86400000)
    const groups = new Map<string, NoteItem[]>()
    for (const n of notes) {
      const created = new Date(n.createdAt)
      let label: string
      if (created >= today) label = 'Today'
      else if (created >= yesterday) label = 'Yesterday'
      else if (created >= weekAgo) label = 'Earlier this week'
      else if (created.getFullYear() === now.getFullYear()) {
        label = created.toLocaleDateString(undefined, { month: 'long' })
      } else {
        label = created.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      }
      const existing = groups.get(label) ?? []
      existing.push(n)
      groups.set(label, existing)
    }
    return Array.from(groups.entries())
  })()

  return (
    <div>
      {/* Add note form */}
      <div style={{
        marginBottom: 18,
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(201,169,110,0.12)',
        borderRadius: 6,
      }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={3}
          placeholder="Add a note about this agent's licensing journey..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0A1628',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#d1d9e2',
            padding: '10px 12px', fontSize: 12,
            fontFamily: 'inherit', resize: 'vertical',
            minHeight: 70,
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, marginTop: 8, flexWrap: 'wrap',
        }}>
          {/* Admin-only scope selector */}
          {isAdminUser ? (
            <div style={{ display: 'flex', gap: 4, padding: 3, background: '#0A1628', borderRadius: 4, border: '1px solid rgba(201,169,110,0.12)' }}>
              {(['LICENSING', 'ADMIN_ONLY'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setDraftScope(s)}
                  style={{
                    background: draftScope === s ? (s === 'ADMIN_ONLY' ? 'rgba(248,113,113,0.14)' : 'rgba(201,169,110,0.14)') : 'transparent',
                    color: draftScope === s ? (s === 'ADMIN_ONLY' ? '#f87171' : '#C9A96E') : '#6B8299',
                    border: 'none', borderRadius: 3,
                    padding: '6px 10px', fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {s === 'LICENSING' ? '👁 Visible to LC' : '🔒 Admin only'}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 10, color: '#6B8299' }}>Visible to all licensing staff</span>
          )}
          <button
            onClick={submit}
            disabled={submitting || !draft.trim()}
            style={{
              background: submitting || !draft.trim() ? 'rgba(201,169,110,0.4)' : '#C9A96E',
              color: '#142D48', border: 'none', borderRadius: 4,
              padding: '8px 16px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: submitting ? 'wait' : 'pointer',
              minHeight: 36,
            }}
          >
            {submitting ? 'Saving...' : '+ Add Note'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {notes === null ? (
        <div style={{ fontSize: 12, color: '#6B8299' }}>Loading...</div>
      ) : notes.length === 0 ? (
        <div style={{
          padding: '24px 16px', textAlign: 'center',
          fontSize: 12, color: '#6B8299',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(201,169,110,0.12)',
          borderRadius: 6,
        }}>
          No notes yet. Add the first one above to start tracking this agent&apos;s licensing journey.
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 22 }}>
          {/* Timeline vertical line */}
          <div style={{
            position: 'absolute', left: 7, top: 6, bottom: 6,
            width: 2, background: 'linear-gradient(180deg, rgba(201,169,110,0.4), rgba(201,169,110,0.05))',
            borderRadius: 1,
          }} />

          {groupedNotes.map(([groupLabel, groupNotes]) => (
            <div key={groupLabel} style={{ marginBottom: 18 }}>
              {/* Group header */}
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: '#C9A96E',
                marginBottom: 10, marginLeft: -22, paddingLeft: 22,
                position: 'relative',
              }}>
                {groupLabel}
              </div>

              {/* Notes in group */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groupNotes.map(note => {
                  const canEdit = note.author.id === viewerId || isAdminUser
                  const isAdminOnly = note.scope === 'ADMIN_ONLY'
                  const authorRoleColor = note.author.role === 'LICENSING_COORDINATOR' ? '#9B6DFF' : '#C9A96E'
                  return (
                    <div key={note.id} style={{ position: 'relative' }}>
                      {/* Timeline dot */}
                      <div style={{
                        position: 'absolute', left: -18, top: 12,
                        width: 10, height: 10, borderRadius: '50%',
                        background: isAdminOnly ? '#f87171' : authorRoleColor,
                        border: '2px solid #0C1E30',
                        boxShadow: `0 0 0 2px ${isAdminOnly ? '#f87171' : authorRoleColor}33`,
                      }} />
                      <div style={{
                        background: isAdminOnly ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.025)',
                        border: `1px solid ${isAdminOnly ? 'rgba(248,113,113,0.2)' : 'rgba(201,169,110,0.12)'}`,
                        borderRadius: 6, padding: '11px 14px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: '#ffffff', fontWeight: 500 }}>
                              {note.author.name}
                            </span>
                            <span style={{
                              fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                              padding: '2px 7px', borderRadius: 3,
                              background: `${authorRoleColor}14`,
                              color: authorRoleColor,
                              border: `1px solid ${authorRoleColor}30`,
                            }}>
                              {note.author.role === 'LICENSING_COORDINATOR' ? 'Licensing' : 'Admin'}
                            </span>
                            {isAdminOnly && (
                              <span style={{
                                fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                padding: '2px 7px', borderRadius: 3,
                                background: 'rgba(248,113,113,0.12)',
                                color: '#f87171',
                                border: '1px solid rgba(248,113,113,0.35)',
                              }}>
                                🔒 Admin only
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 10, color: '#6B8299' }}>
                            {new Date(note.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#d1d9e2', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                          {note.body}
                        </div>
                        {canEdit && (
                          <div style={{ marginTop: 6 }}>
                            <button
                              onClick={() => remove(note.id)}
                              style={{
                                background: 'none', border: 'none',
                                color: '#6B8299', fontSize: 10,
                                cursor: 'pointer', padding: '2px 0',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EditableField({
  label, type, value, onSave,
}: {
  label: string
  type: 'text' | 'date'
  value: string | null
  onSave: (v: string | null) => void
}) {
  const initial = value ? (type === 'date' ? value.split('T')[0] : value) : ''
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(initial) }, [initial])

  const dirty = draft !== initial

  const save = async () => {
    setSaving(true)
    await onSave(draft || null)
    setSaving(false)
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box',
            background: '#0A1628',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#d1d9e2',
            padding: '8px 10px', fontSize: 12,
          }}
        />
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: '#C9A96E', color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: '6px 10px', fontSize: 9, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}
          >
            {saving ? '...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Referrals tab ───────────────────────────────────────────────────────────

interface ReferralItem {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  state: string | null
  notes: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  adminNotes: string | null
  createdAt: string
  approvedAt: string | null
  createdAgentId: string | null
  referringAgent: { firstName: string; lastName: string; agentCode: string }
}

const REF_STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b', APPROVED: '#4ade80', REJECTED: '#f87171',
}

function ReferralsTab() {
  const [referrals, setReferrals] = useState<ReferralItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [cftInput, setCftInput] = useState('')
  const [trainers, setTrainers] = useState<string[]>([])

  useEffect(() => {
    fetch(`/api/vault/referrals?status=${filter}`)
      .then(r => r.json())
      .then((d: { referrals: ReferralItem[] }) => {
        setReferrals(d.referrals ?? [])
        setLoading(false)
      })
  }, [filter])

  useEffect(() => {
    fetch('/api/admin/trainers')
      .then(r => r.json())
      .then((d: { trainers: string[] }) => setTrainers(d.trainers ?? []))
      .catch(() => {})
  }, [])

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessingId(id)
    try {
      const res = await fetch('/api/vault/referrals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, cft: action === 'approve' ? cftInput || undefined : undefined }),
      })
      const d = await res.json() as { ok?: boolean; error?: string; agentCode?: string }
      if (res.ok) {
        setReferrals(prev => prev.map(r => r.id === id ? {
          ...r,
          status: action === 'approve' ? 'APPROVED' as const : 'REJECTED' as const,
          approvedAt: new Date().toISOString(),
        } : r))
        if (d.agentCode) {
          alert(`Agent created with code ${d.agentCode}. Invite email ${d.ok ? 'sent' : 'may not have sent'}.`)
        }
      } else {
        alert(d.error ?? 'Action failed')
      }
    } finally {
      setProcessingId(null)
      setCftInput('')
    }
  }

  const sLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E',
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={sLabel}>Agent Referrals</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['PENDING', 'ALL'] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setLoading(true) }} style={{
              padding: '5px 12px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: filter === f ? 'rgba(201,169,110,0.12)' : 'transparent',
              border: `1px solid ${filter === f ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: filter === f ? '#C9A96E' : '#6B8299', cursor: 'pointer',
            }}>{f === 'PENDING' ? 'Pending' : 'All'}</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        referrals.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No referrals {filter === 'PENDING' ? 'pending approval' : 'found'}.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {referrals.map(r => (
            <div key={r.id} style={{
              padding: '16px 20px', borderRadius: 6,
              background: '#132238', border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>{r.firstName} {r.lastName}</div>
                  <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 2 }}>{r.email}{r.phone ? ` · ${r.phone}` : ''}{r.state ? ` · ${r.state}` : ''}</div>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: REF_STATUS_COLORS[r.status] ?? '#6B8299',
                  padding: '2px 8px', borderRadius: 10,
                  background: r.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : r.status === 'APPROVED' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 8 }}>
                Referred by <span style={{ color: '#C9A96E' }}>{r.referringAgent.firstName} {r.referringAgent.lastName}</span> ({r.referringAgent.agentCode}) · {new Date(r.createdAt).toLocaleDateString()}
              </div>
              {r.notes && <div style={{ fontSize: 11, color: '#9BB0C4', fontStyle: 'italic', marginBottom: 8 }}>&ldquo;{r.notes}&rdquo;</div>}

              {r.status === 'PENDING' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <select
                    value={cftInput}
                    onChange={e => setCftInput(e.target.value)}
                    style={{
                      padding: '6px 10px', fontSize: 11, borderRadius: 4,
                      background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                      color: '#9BB0C4', flex: '0 1 180px',
                    }}
                  >
                    <option value="">Assign trainer (optional)</option>
                    {trainers.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button
                    onClick={() => handleAction(r.id, 'approve')}
                    disabled={processingId === r.id}
                    style={{
                      padding: '6px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: '#4ade80', border: 'none', color: '#0A1628',
                      cursor: processingId === r.id ? 'wait' : 'pointer',
                      opacity: processingId === r.id ? 0.6 : 1,
                    }}
                  >Approve & Send Invite</button>
                  <button
                    onClick={() => handleAction(r.id, 'reject')}
                    disabled={processingId === r.id}
                    style={{
                      padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
                      color: '#f87171', cursor: processingId === r.id ? 'wait' : 'pointer',
                    }}
                  >Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      }
    </div>
  )
}

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { data: session } = useSession()
  const user = session?.user as { id?: string; name?: string; email?: string; role?: string } | undefined

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const changePassword = async () => {
    if (pw.next !== pw.confirm) {
      setMsg({ ok: false, text: 'Passwords do not match' })
      return
    }
    if (pw.next.length < 8) {
      setMsg({ ok: false, text: 'New password must be at least 8 characters' })
      return
    }
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (data.ok) {
      setMsg({ ok: true, text: 'Password updated' })
      setPw({ current: '', next: '', confirm: '' })
    } else {
      setMsg({ ok: false, text: data.error ?? 'Failed to update' })
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.1)',
        borderRadius: 8, padding: 24, marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>
          Your account
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#ffffff' }}>{user?.name ?? '—'}</div>
        <div style={{ fontSize: 12, color: '#9BB0C4', marginTop: 3 }}>{user?.email ?? '—'}</div>
        <div style={{ marginTop: 10 }}>
          <span style={{
            display: 'inline-block',
            background: user?.role === 'licensing_coordinator' ? 'rgba(155,109,255,0.12)' : 'rgba(201,169,110,0.12)',
            border: `1px solid ${user?.role === 'licensing_coordinator' ? 'rgba(155,109,255,0.3)' : 'rgba(201,169,110,0.3)'}`,
            color: user?.role === 'licensing_coordinator' ? '#9B6DFF' : '#C9A96E',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 3,
          }}>
            {user?.role === 'licensing_coordinator' ? 'Licensing Coordinator' : 'Admin'}
          </span>
        </div>
      </div>

      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.1)',
        borderRadius: 8, padding: 24,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>
          Change Password
        </div>
        {(['current', 'next', 'confirm'] as const).map(key => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 6 }}>
              {key === 'current' ? 'Current password' : key === 'next' ? 'New password' : 'Confirm new password'}
            </label>
            <input
              type="password"
              value={pw[key]}
              onChange={e => setPw(p => ({ ...p, [key]: e.target.value }))}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0A1628',
                border: '1px solid rgba(201,169,110,0.2)',
                borderRadius: 4, color: '#d1d9e2',
                padding: '10px 12px', fontSize: 13,
              }}
            />
          </div>
        ))}
        <button
          onClick={changePassword}
          disabled={saving}
          style={{
            background: saving ? 'rgba(201,169,110,0.4)' : '#C9A96E',
            color: '#142D48', border: 'none', borderRadius: 4,
            padding: '12px 22px', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: saving ? 'wait' : 'pointer', minHeight: 44,
          }}
        >
          {saving ? 'Updating...' : 'Update password'}
        </button>
        {msg && (
          <p style={{ marginTop: 12, fontSize: 12, color: msg.ok ? '#4ade80' : '#f87171' }}>
            {msg.ok ? '✓ ' : '✗ '}{msg.text}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { bg: string; fg: string; border: string; label: string }> = {
    OPEN:        { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b', border: 'rgba(245,158,11,0.35)', label: 'Open' },
    IN_PROGRESS: { bg: 'rgba(155,109,255,0.12)', fg: '#9B6DFF', border: 'rgba(155,109,255,0.35)', label: 'In progress' },
    RESOLVED:    { bg: 'rgba(74,222,128,0.12)', fg: '#4ade80', border: 'rgba(74,222,128,0.35)', label: 'Resolved' },
    CLOSED:      { bg: 'rgba(255,255,255,0.04)', fg: '#6B8299', border: 'rgba(255,255,255,0.1)', label: 'Closed' },
  }
  const { bg, fg, border, label } = map[status]
  return (
    <span style={{
      display: 'inline-block',
      background: bg, color: fg,
      border: `1px solid ${border}`,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '3px 10px', borderRadius: 999,
      flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ─── Add Agent modal (LC can onboard new agents from here) ────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

function LicensingAddAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', agentCode: '',
    state: '', phone: '', icaDate: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
    if (!res.ok) {
      setError(data.error ?? 'Failed to create agent')
      setLoading(false)
      return
    }
    // Send invite email (non-blocking — still notify success if this fails)
    await fetch('/api/admin/agents/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentUserId: data.agentUserId }),
    }).catch(() => {})
    onCreated()
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0A1628',
    border: '1px solid rgba(201,169,110,0.15)',
    borderRadius: 4, color: '#d1d9e2',
    padding: '10px 12px', fontSize: 13,
    fontFamily: 'inherit',
  }
  const label: React.CSSProperties = {
    display: 'block',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: '#C9A96E',
    marginBottom: 5,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
        backdropFilter: 'blur(3px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.2)',
        borderRadius: isMobile ? '16px 16px 0 0' : 8,
        width: isMobile ? '100%' : 'min(500px, 100vw)',
        maxHeight: isMobile ? '92vh' : '90vh',
        overflowY: 'auto',
        boxShadow: '0 -24px 80px rgba(0,0,0,0.55)',
      }}>
        <div style={{
          padding: isMobile ? '18px 20px 14px' : '22px 28px 16px',
          borderBottom: '1px solid rgba(201,169,110,0.1)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          position: 'sticky', top: 0, background: '#142D48', zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              New Agent
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff' }}>Onboard into AFF</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 6, width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#C9A96E', fontSize: 16, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: isMobile ? '18px 20px 20px' : '22px 28px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.55, padding: '10px 12px', background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.2)', borderRadius: 4 }}>
            Create the agent record and send the portal invite. They&apos;ll get an email with a link to set their password. Trainer assignment and goal can be filled in later.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div><label style={label}>First Name *</label><input required style={input} value={form.firstName} onChange={set('firstName')} /></div>
            <div><label style={label}>Last Name *</label><input required style={input} value={form.lastName} onChange={set('lastName')} /></div>
            <div><label style={label}>Email *</label><input required type="email" style={input} value={form.email} onChange={set('email')} /></div>
            <div><label style={label}>Agent Code *</label><input required style={input} value={form.agentCode} onChange={set('agentCode')} placeholder="e.g. F2030" /></div>
            <div>
              <label style={label}>State</label>
              <select style={{ ...input, appearance: 'auto' }} value={form.state} onChange={set('state')}>
                <option value="">Select state</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={label}>Phone</label><input style={input} inputMode="tel" value={form.phone} onChange={set('phone')} /></div>
            <div><label style={label}>ICA Date</label><input type="date" style={input} value={form.icaDate} onChange={set('icaDate')} /></div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'flex', gap: 10,
            flexDirection: isMobile ? 'column-reverse' : 'row',
            justifyContent: 'flex-end',
            paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#9BB0C4', borderRadius: 4,
                padding: '12px 18px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: loading ? 'wait' : 'pointer', minHeight: 44,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'rgba(201,169,110,0.4)' : '#C9A96E',
                color: '#142D48', border: 'none', borderRadius: 4,
                padding: '12px 22px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: loading ? 'wait' : 'pointer', minHeight: 44, flex: 1,
              }}
            >
              {loading ? 'Creating...' : 'Create & Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
