'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { TOPIC_LABELS, type LicensingRequestTopic } from '@/components/LicensingRequestModal'
import { useIsMobile } from '@/lib/useIsMobile'

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

  const [tab, setTab] = useState<'inbox' | 'agents' | 'profile'>('inbox')

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 24,
        padding: '28px 0 20px',
        borderBottom: '1px solid rgba(201,169,110,0.08)',
      }}>
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

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 24,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {(['inbox', 'agents', 'profile'] as const).map(t => (
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
            {t === 'inbox' ? 'Inbox' : t === 'agents' ? 'Agents' : 'Profile'}
          </button>
        ))}
      </div>

      {tab === 'inbox' && <InboxTab viewerId={viewerId} isLC={isLC} />}
      {tab === 'agents' && <AgentsTab />}
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

function AgentsTab() {
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

  useEffect(() => { load() }, [load])

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
          padding: '14px 16px 16px',
          borderTop: '1px solid rgba(201,169,110,0.08)',
          background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 12, lineHeight: 1.5 }}>
            {agent.phone ?? 'No phone'} · {agent.email}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <EditableField label="Exam Date" type="date" value={agent.examDate} onSave={v => onUpdate(agent.id, 'examDate', v)} />
            <EditableField label="License #" type="text" value={agent.licenseNumber} onSave={v => onUpdate(agent.id, 'licenseNumber', v)} />
            <EditableField label="NPN" type="text" value={agent.npn} onSave={v => onUpdate(agent.id, 'npn', v)} />
            <EditableField label="License Lines" type="text" value={agent.licenseLines} onSave={v => onUpdate(agent.id, 'licenseLines', v)} />
            <EditableField label="Submitted to GFI" type="date" value={agent.dateSubmittedToGfi} onSave={v => onUpdate(agent.id, 'dateSubmittedToGfi', v)} />
          </div>
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
