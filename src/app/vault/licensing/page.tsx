'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { TOPIC_LABELS, type LicensingRequestTopic } from '@/components/LicensingRequestModal'
import { LICENSING_TOPICS, LC_PURPOSE_LABELS, lcPurposeLabel } from '@/lib/licensing-topics'
import { useIsMobile } from '@/lib/useIsMobile'
import { CARRIERS } from '@/lib/agent-constants'
import DatePicker from '@/components/DatePicker'
import AgentTypeahead from '@/components/AgentTypeahead'
import LicensingProgressTab from './LicensingProgressTab'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

interface AdminUserRef {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'LICENSING_COORDINATOR'
}

interface ThreadMessage {
  id: string
  fromRole: 'agent' | 'admin' | 'licensing_coordinator' | string
  fromUserId: string
  fromName: string
  body: string
  createdAt: string
}

interface Request {
  id: string
  phaseItemKey: string | null
  topic: LicensingRequestTopic
  message: string
  status: Status
  resolutionNote: string | null
  messages: ThreadMessage[]
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
  openRequests: { id: string; topic: LicensingRequestTopic; status: string; createdAt: string }[]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Daily tasks panel for the Licensing Coordinator. Recurring SOP steps
// (seeded, reset each day) plus ad-hoc tasks she adds (birthday flyers,
// announcement updates, off-platform Breezy messages, etc.). Whatever
// is checked off today flows into the nightly digest's Tasks section.
interface LcTask {
  id: string
  title: string
  recurring: boolean
  completedOn: string | null
}

function LcTasksPanel() {
  const [open, setOpen] = useState(true)
  const [tasks, setTasks] = useState<LcTask[]>([])
  const [today, setToday] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    fetch('/api/vault/lc-tasks')
      .then(r => r.ok ? r.json() : null)
      .then((d: { tasks: LcTask[]; today: string } | null) => {
        if (d) { setTasks(d.tasks); setToday(d.today) }
      })
      .catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const isDone = (t: LcTask) => !!t.completedOn && t.completedOn === today
  const doneCount = tasks.filter(isDone).length

  const toggle = async (t: LcTask) => {
    const next = !isDone(t)
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, completedOn: next ? today : null } : x))
    await fetch(`/api/vault/lc-tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: next }),
    }).catch(() => load())
  }

  const addTask = async () => {
    const title = newTitle.trim()
    if (!title) return
    setAdding(true)
    try {
      const res = await fetch('/api/vault/lc-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (res.ok) { setNewTitle(''); load() }
    } finally { setAdding(false) }
  }

  const remove = async (id: string) => {
    setTasks(prev => prev.filter(x => x.id !== id))
    await fetch(`/api/vault/lc-tasks/${id}`, { method: 'DELETE' }).catch(() => load())
  }

  return (
    <div style={{
      marginBottom: 20,
      border: '1px solid rgba(201,169,110,0.18)',
      borderRadius: 6,
      background: 'rgba(201,169,110,0.04)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none',
          padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#C9A96E', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        }}
      >
        <span>Daily Tasks{tasks.length > 0 ? ` · ${doneCount}/${tasks.length} done` : ''}</span>
        <span style={{ fontSize: 13 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tasks.map(t => {
              const done = isDone(t)
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.02)' }}>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(t)}
                    style={{ marginTop: 2, width: 15, height: 15, accentColor: '#C9A96E', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{
                    flex: 1, fontSize: 12.5, lineHeight: 1.5,
                    color: done ? '#6B8299' : '#d1d9e2',
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {t.title}
                    {t.recurring && (
                      <span style={{ marginLeft: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 3, padding: '1px 5px' }}>Daily</span>
                    )}
                  </span>
                  <button
                    onClick={() => remove(t.id)}
                    title="Remove task"
                    style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 13, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                  >×</button>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask() }}
              placeholder="Add a task (birthday flyer, announcement update, etc.)"
              style={{
                flex: 1, boxSizing: 'border-box',
                background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
                borderRadius: 4, color: '#d1d9e2', padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
              }}
            />
            <button
              onClick={addTask}
              disabled={adding || !newTitle.trim()}
              style={{
                background: adding || !newTitle.trim() ? 'rgba(201,169,110,0.4)' : '#C9A96E',
                color: '#142D48', border: 'none', borderRadius: 4,
                padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: adding ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              }}
            >Add</button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 10, color: '#6B8299' }}>
            Checked tasks roll up into tonight&apos;s 9pm digest. Daily tasks reset each morning.
          </p>
        </div>
      )}
    </div>
  )
}

export default function LicensingWorkspacePage() {
  const { data: session } = useSession()
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const viewerRole = (session?.user as { role?: string } | undefined)?.role ?? null
  const isLC = viewerRole === 'licensing_coordinator'

  const [tab, setTab] = useState<'inbox' | 'agents' | 'progress' | 'referrals' | 'profile'>('inbox')
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [showNewBusinessModal, setShowNewBusinessModal] = useState(false)
  const [agentsRefreshNonce, setAgentsRefreshNonce] = useState(0)

  // Pull the same sidebar badge counts so we can split them across the
  // sub-tabs. The sidebar shows one number on Licensing Inbox, but the
  // LC then has to guess which sub-tab the work is in. Putting a badge
  // on Inbox / Referrals / Agents resolves that.
  const [tabCounts, setTabCounts] = useState({ inbox: 0, agents: 0, referrals: 0 })
  useEffect(() => {
    const load = () => {
      fetch('/api/vault/sidebar-counts').then(r => r.ok ? r.json() : null).then(d => {
        if (!d) return
        setTabCounts(c => ({ ...c, inbox: d.licensingOpen ?? 0, referrals: d.referralsPending ?? 0 }))
      }).catch(() => {})
      // Agents-tab badge: agents currently flagged as needing attention.
      fetch('/api/vault/licensing-agents?needsAttention=1').then(r => r.ok ? r.json() : null).then(d => {
        if (!d) return
        setTabCounts(c => ({ ...c, agents: Array.isArray(d.agents) ? d.agents.length : 0 }))
      }).catch(() => {})
    }
    load()
  }, [agentsRefreshNonce])

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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowNewBusinessModal(true)}
              style={{
                background: 'transparent', color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4,
                padding: '12px 18px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: 'pointer', minHeight: 44,
              }}
              title="Log a new business policy on behalf of another agent (e.g. for Vick)"
            >
              + New Business
            </button>
            <button
              onClick={() => setShowAddAgentModal(true)}
              style={{
                background: '#C9A96E', color: '#142D48',
                border: 'none', borderRadius: 4,
                padding: '12px 22px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: 'pointer', minHeight: 44,
                boxShadow: '0 0 20px rgba(201,169,110,0.2)',
              }}
            >
              + Add Agent
            </button>
          </div>
        </div>
      </div>

      <LcTasksPanel />

      {showAddAgentModal && (
        <LicensingAddAgentModal
          onClose={() => setShowAddAgentModal(false)}
          onCreated={() => {
            setShowAddAgentModal(false)
            setAgentsRefreshNonce(n => n + 1)
          }}
        />
      )}

      {showNewBusinessModal && (
        <OnBehalfNewBusinessModal
          onClose={() => setShowNewBusinessModal(false)}
          onCreated={() => {
            setShowNewBusinessModal(false)
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
        {(['inbox', 'agents', 'progress', 'referrals', 'profile'] as const).map(t => {
          const count = t === 'inbox' ? tabCounts.inbox
            : t === 'agents' ? tabCounts.agents
            : t === 'referrals' ? tabCounts.referrals
            : 0
          const label = t === 'inbox' ? 'Inbox' : t === 'agents' ? 'Agents' : t === 'progress' ? 'Progress' : t === 'referrals' ? 'Referrals' : 'Profile'
          const tooltip = t === 'inbox' ? `${count} open coordinator request${count === 1 ? '' : 's'} waiting for action`
            : t === 'agents' ? `${count} agent${count === 1 ? '' : 's'} flagged with open requests`
            : t === 'referrals' ? `${count} pending referral${count === 1 ? '' : 's'} waiting for approval`
            : t === 'progress' ? 'Licensing checklist completion across all agents'
            : undefined
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              title={tooltip}
              style={{
                background: 'none', border: 'none', whiteSpace: 'nowrap',
                padding: '12px 18px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: tab === t ? '#C9A96E' : '#6B8299',
                borderBottom: tab === t ? '2px solid #C9A96E' : '2px solid transparent',
                marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>{label}</span>
              {count > 0 && (
                <span style={{
                  background: 'rgba(248,113,113,0.15)', color: '#f87171',
                  fontSize: 9, fontWeight: 700, padding: '1px 7px',
                  borderRadius: 999, border: '1px solid rgba(248,113,113,0.3)',
                  letterSpacing: 0,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'inbox' && <InboxTab viewerId={viewerId} isLC={isLC} />}
      {tab === 'agents' && <AgentsTab refreshNonce={agentsRefreshNonce} />}
      {tab === 'progress' && <LicensingProgressTab />}
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
  // Single textarea drives both "Send reply" (writes a thread message
  // without changing status) and "Mark resolved" (uses it as the final
  // resolution note). Two buttons, one input.
  const [replyBody, setReplyBody] = useState('')
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

  // Don't carry the resolutionNote across requests as a default - it
  // would prefill an already-resolved note into the reply box on the
  // next ticket. Reset to empty when switching selections.
  useEffect(() => { setReplyBody('') }, [selected?.id])

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

  // Reply to the agent without changing resolution status. Server-side
  // bumps OPEN to IN_PROGRESS automatically on first reply.
  const sendReply = async () => {
    if (!selected) return
    const body = replyBody.trim()
    if (body.length === 0) return
    setSaving(true)
    const res = await fetch(`/api/vault/coordinator-requests/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (res.ok) {
      const d = await res.json() as { request: Request }
      setSelected(d.request)
      setRequests(prev => prev.map(r => r.id === d.request.id ? d.request : r))
      setReplyBody('')
    }
    setSaving(false)
  }

  const assignToMe = () => patch({ assignedToId: viewerId, status: 'IN_PROGRESS' })
  // When marking resolved, send any unsent reply text as the final
  // resolution note + as a thread message so the agent sees it both
  // places.
  const markResolved = async () => {
    if (replyBody.trim().length > 0) await sendReply()
    return patch({ status: 'RESOLVED', resolutionNote: replyBody.trim() || null })
  }
  const markInProgress = () => patch({ status: 'IN_PROGRESS' })
  const reopen = () => patch({ status: 'OPEN' })

  // After the LC fulfills a request (completes a phase item + the
  // server auto-resolves it), the row leaves the open list, so just
  // clear the selection and reload.
  const onFulfilled = async () => {
    setSelected(null)
    await load()
  }

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
              replyBody={replyBody}
              setReplyBody={setReplyBody}
              saving={saving}
              viewerId={viewerId}
              onClose={() => setSelected(null)}
              onAssignToMe={assignToMe}
              onMarkInProgress={markInProgress}
              onSendReply={sendReply}
              onMarkResolved={markResolved}
              onReopen={reopen}
              onFulfilled={onFulfilled}
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
  request, isLC, replyBody, setReplyBody, saving, viewerId,
  onClose, onAssignToMe, onMarkInProgress, onSendReply, onMarkResolved, onReopen,
  onFulfilled,
}: {
  request: Request
  isLC: boolean
  replyBody: string
  setReplyBody: (v: string) => void
  saving: boolean
  viewerId: string | null
  onClose: () => void
  onAssignToMe: () => void
  onMarkInProgress: () => void
  onSendReply: () => void
  onMarkResolved: () => void
  onReopen: () => void
  onFulfilled: () => void
}) {
  const assignedToMe = request.assignedTo?.id === viewerId
  const canAssign = request.status === 'OPEN' || !request.assignedTo
  const canResolve = request.status === 'IN_PROGRESS' || request.status === 'OPEN'
  const canReopen = request.status === 'RESOLVED' || request.status === 'CLOSED'

  // Outstanding phase items for this request's agent. Loaded lazily
  // when the request is still actionable so the LC can complete the
  // exact item the agent is asking about (defaults to the request's
  // linked item) and resolve the ticket in one go.
  const [fulfillItems, setFulfillItems] = useState<{ phase: number; itemKey: string; label: string }[]>([])
  const [fulfillSel, setFulfillSel] = useState('')
  const [fulfilling, setFulfilling] = useState(false)
  const [fulfillErr, setFulfillErr] = useState<string | null>(null)

  useEffect(() => {
    if (!canResolve) { setFulfillItems([]); setFulfillSel(''); return }
    let cancelled = false
    fetch(`/api/vault/coordinator-requests/${request.id}/fulfill`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { items?: { phase: number; itemKey: string; label: string }[]; defaultKey?: string | null }) => {
        if (cancelled) return
        const items = d.items ?? []
        setFulfillItems(items)
        const def = d.defaultKey ? items.find(i => i.itemKey === d.defaultKey) : undefined
        setFulfillSel(def ? `${def.phase}:${def.itemKey}` : (items[0] ? `${items[0].phase}:${items[0].itemKey}` : ''))
      })
      .catch(() => { if (!cancelled) { setFulfillItems([]); setFulfillSel('') } })
    return () => { cancelled = true }
  }, [request.id, canResolve])

  const doFulfill = async () => {
    if (!fulfillSel || fulfilling) return
    const [phaseStr, ...keyParts] = fulfillSel.split(':')
    const phase = Number(phaseStr)
    const itemKey = keyParts.join(':')
    setFulfilling(true)
    setFulfillErr(null)
    try {
      const res = await fetch(`/api/vault/coordinator-requests/${request.id}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, itemKey }),
      })
      if (res.ok) {
        onFulfilled()
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setFulfillErr(d.error ?? 'Could not complete that item.')
      }
    } catch {
      setFulfillErr('Network error.')
    } finally {
      setFulfilling(false)
    }
  }

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

      {/* Conversation thread between agent and LC. Original request body */}
      {/* (request.message above) is the first turn; everything below is */}
      {/* a back-and-forth that doesn't touch resolution status. */}
      {request.messages.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
            Conversation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {request.messages.map(m => {
              const isAgent = m.fromRole === 'agent'
              return (
                <div key={m.id} style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: isAgent ? 'rgba(155,109,255,0.08)' : 'rgba(201,169,110,0.06)',
                  border: `1px solid ${isAgent ? 'rgba(155,109,255,0.2)' : 'rgba(201,169,110,0.18)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isAgent ? '#9B6DFF' : '#C9A96E' }}>
                      {isAgent ? `${m.fromName} (agent)` : m.fromName}
                    </span>
                    <span style={{ fontSize: 9, color: '#6B8299' }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#d1d9e2', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Reply box. Drives both "Send reply" (no status change, just */}
      {/* posts a thread message) and "Mark resolved" (uses the same */}
      {/* body as the final resolution note + a thread message). */}
      {(canResolve || request.status === 'RESOLVED') && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 6 }}>
            Reply (visible to the agent)
          </label>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            rows={3}
            placeholder="Send a quick update or, when the step is done on their end, mark it resolved."
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
          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: '#9BB0C4' }}>Send reply</strong> keeps the request open so you can come back to it after the agent acts.{' '}
            <strong style={{ color: '#9BB0C4' }}>Mark resolved</strong> closes it once the step is actually done.
          </div>
        </div>
      )}

      {/* Show prior resolution note (read-only) on already-resolved requests */}
      {request.status === 'RESOLVED' && request.resolutionNote && (
        <div style={{
          marginBottom: 14,
          padding: '10px 12px',
          background: 'rgba(74,222,128,0.06)',
          border: '1px solid rgba(74,222,128,0.2)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 4 }}>
            Resolution
          </div>
          <div style={{ fontSize: 12, color: '#d1d9e2', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{request.resolutionNote}</div>
        </div>
      )}

      {/* Satisfy the request right here: complete any outstanding phase
          item for the agent (defaults to the item the request is linked
          to) and auto-resolve the ticket. Title/announcement update
          immediately, same as an admin ticking the box. */}
      {canResolve && fulfillItems.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '12px 14px',
          background: 'rgba(74,222,128,0.05)',
          border: '1px solid rgba(74,222,128,0.18)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 8 }}>
            Satisfy this request
          </div>
          <select
            value={fulfillSel}
            onChange={e => setFulfillSel(e.target.value)}
            style={{
              width: '100%', marginBottom: 8,
              background: '#0A1628', color: '#fff',
              border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4,
              padding: '8px 10px', fontSize: 12,
            }}
          >
            {fulfillItems.map(i => (
              <option key={`${i.phase}:${i.itemKey}`} value={`${i.phase}:${i.itemKey}`}>
                P{i.phase}: {i.label}
              </option>
            ))}
          </select>
          <button
            onClick={doFulfill}
            disabled={fulfilling || !fulfillSel}
            style={{
              width: '100%',
              background: '#4ade80', color: '#0A1628',
              border: 'none', borderRadius: 4,
              padding: '11px 16px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: fulfilling || !fulfillSel ? 'not-allowed' : 'pointer',
              opacity: fulfilling || !fulfillSel ? 0.6 : 1, minHeight: 42,
            }}
          >
            {fulfilling ? 'Completing...' : 'Complete & resolve'}
          </button>
          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
            Marks the selected item complete for {request.agentProfile.firstName} and resolves this request. Title and the team announcement update right away.
          </div>
          {fulfillErr && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{fulfillErr}</div>
          )}
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
            onClick={onSendReply}
            disabled={saving || replyBody.trim().length === 0}
            style={{
              background: '#C9A96E', color: '#142D48',
              border: 'none', borderRadius: 4,
              padding: '10px 16px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: saving || replyBody.trim().length === 0 ? 'not-allowed' : 'pointer',
              opacity: saving || replyBody.trim().length === 0 ? 0.5 : 1,
              minHeight: 40, flex: 1, minWidth: 140,
            }}
          >
            Send reply
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
  // Pagination state — defaults match the API. Reset to page 1 when
  // any filter changes so the LC isn't stuck on a stale page after
  // toggling needsAttention or typing a search.
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 25

  useEffect(() => { setPage(1) }, [needsAttention, query])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (needsAttention) params.set('needsAttention', '1')
    if (query.trim()) params.set('q', query.trim())
    const res = await fetch(`/api/vault/licensing-agents?${params}`)
    if (res.ok) {
      const d = await res.json() as { agents: LicensingAgent[]; total?: number }
      // Sort needs-attention agents to the top so the LC opens the
      // Agents tab and immediately sees who needs them. Higher request
      // count wins; ties fall back to the API's createdAt-desc order.
      const sorted = [...(d.agents ?? [])].sort((a, b) => b.openRequestCount - a.openRequestCount)
      setAgents(sorted)
      setTotal(d.total ?? sorted.length)
    }
    setLoading(false)
  }, [needsAttention, query, page])

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
              onRefresh={load}
            />
          ))}
        </div>
      )}
      <PaginationControls page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
    </>
  )
}

function AgentRow({
  agent, expanded, onToggle, onUpdate, onRefresh,
}: {
  agent: LicensingAgent
  expanded: boolean
  onToggle: () => void
  onUpdate: (id: string, field: string, value: string | null) => void
  // Called after a successful inline action that changes server state
  // (currently: dismissing an open request). Refetches the agent list
  // so the request pill disappears + the openRequestCount decrements.
  onRefresh: () => void
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
          {/* Surface WHY this agent is flagged. Without this the LC sees
              "needs attention" with no signal of what to do. Show up to
              two topic labels inline; rest land in the expanded view.
              Each pill carries a ✕ to kill the request — used when an
              agent left or the request became stale. PATCHes status to
              CLOSED on the server. */}
          {agent.openRequestCount > 0 && (
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {agent.openRequests.slice(0, 2).map(r => (
                <span key={r.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                  padding: '2px 4px 2px 7px', borderRadius: 999,
                  background: 'rgba(248,113,113,0.08)', color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.25)',
                }}>
                  {TOPIC_LABELS[r.topic] ?? r.topic}
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const ok = confirm(`Dismiss "${TOPIC_LABELS[r.topic] ?? r.topic}"?\n\nUse this when ${agent.firstName} no longer needs this request — they left, the issue resolved itself, or it was created by mistake. The request is closed in the system; the agent won't be pinged again.`)
                      if (!ok) return
                      const res = await fetch(`/api/vault/coordinator-requests/${r.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'CLOSED', resolutionNote: 'Dismissed from licensing inbox' }),
                      })
                      if (res.ok) onRefresh()
                      else alert('Couldn\'t dismiss the request — refresh and try again.')
                    }}
                    aria-label={`Dismiss ${TOPIC_LABELS[r.topic] ?? r.topic}`}
                    title="Dismiss this request"
                    style={{
                      background: 'transparent', border: 'none', color: 'inherit',
                      fontSize: 11, lineHeight: 1, padding: '0 2px',
                      cursor: 'pointer', opacity: 0.7,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {agent.openRequests.length > 2 && (
                <span style={{ fontSize: 9, color: '#9BB0C4', alignSelf: 'center' }}>
                  +{agent.openRequests.length - 2} more
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#9BB0C4' }}>
          License: <span style={{ color: agent.licenseNumber ? '#ffffff' : '#4B5563' }}>{agent.licenseNumber ?? '—'}</span>
        </div>
        <div style={{ fontSize: 11, color: '#9BB0C4' }}>
          Carriers: <span style={{ color: '#ffffff' }}>{agent.carriersAppointed}/{agent.carriersTotal}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {agent.openRequestCount > 0 && (
            <span
              title={agent.openRequests.map(r => TOPIC_LABELS[r.topic] ?? r.topic).join(' · ')}
              style={{
                background: 'rgba(248,113,113,0.12)',
                color: '#f87171', fontSize: 10, fontWeight: 700,
                padding: '3px 8px', borderRadius: 999,
                border: '1px solid rgba(248,113,113,0.3)',
              }}
            >
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
  purpose?: string | null
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
  const [notePurpose, setNotePurpose] = useState<LicensingRequestTopic | ''>('')
  const [noteAction, setNoteAction] = useState('')
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

  // Structured Licensing note (LC SOP): Purpose + Action Taken +
  // Additional Note. Requires a purpose plus at least one of the text
  // fields so an empty submit doesn't post.
  const canSubmit = !!notePurpose && (!!noteAction.trim() || !!draft.trim())
  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    const res = await fetch(`/api/vault/licensing-agents/${agentId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: notePurpose,
        actionTaken: noteAction.trim(),
        additionalNote: draft.trim(),
        scope: isAdminUser ? draftScope : 'LICENSING',
      }),
    })
    if (res.ok) {
      const d = await res.json() as { note: NoteItem }
      setNotes(prev => [d.note, ...(prev ?? [])])
      setDraft(''); setNoteAction(''); setNotePurpose('')
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
        {/* Structured Licensing note (LC SOP): Purpose, Action Taken,
            Additional Note. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select
            value={notePurpose}
            onChange={e => setNotePurpose(e.target.value as LicensingRequestTopic | '')}
            style={{
              flex: '1 1 180px', boxSizing: 'border-box',
              background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
              borderRadius: 4, color: notePurpose ? '#d1d9e2' : '#6B8299',
              padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
            }}
          >
            <option value="">Purpose...</option>
            {LICENSING_TOPICS.map(t => <option key={t} value={t}>{LC_PURPOSE_LABELS[t]}</option>)}
          </select>
          <input
            value={noteAction}
            onChange={e => setNoteAction(e.target.value)}
            placeholder="Action Taken"
            style={{
              flex: '2 1 220px', boxSizing: 'border-box',
              background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
              borderRadius: 4, color: '#d1d9e2',
              padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
            }}
          />
        </div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={3}
          placeholder="Additional note (optional)"
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
            disabled={submitting || !canSubmit}
            style={{
              background: submitting || !canSubmit ? 'rgba(201,169,110,0.4)' : '#C9A96E',
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
                            {note.purpose && (
                              <span style={{
                                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '2px 7px', borderRadius: 3,
                                background: 'rgba(96,165,250,0.12)',
                                color: '#60a5fa',
                                border: '1px solid rgba(96,165,250,0.3)',
                              }}>
                                {lcPurposeLabel(note.purpose)}
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
        {type === 'date' ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <DatePicker value={draft} onChange={setDraft} />
          </div>
        ) : (
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
        )}
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
  referringAgentId: string
  referringAgent: { firstName: string; lastName: string; agentCode: string; referralsBlockedAt: string | null }
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
  // Tracks the most-recent announce status per referral row so the
  // button can flash a brief "Sent ✓" without a layout shift.
  const [announceState, setAnnounceState] = useState<Record<string, 'sending' | 'sent' | 'error'>>({})
  // Pagination + search. Default page size 25 mirrors the API default.
  // Search hits the API (cross-field: recruit name, email, recruiter)
  // so we don't have to load every page client-side to find someone.
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const PAGE_SIZE = 25

  const reannounce = async (id: string) => {
    setAnnounceState(s => ({ ...s, [id]: 'sending' }))
    try {
      const res = await fetch(`/api/admin/referrals/${id}/announce`, { method: 'POST' })
      setAnnounceState(s => ({ ...s, [id]: res.ok ? 'sent' : 'error' }))
      setTimeout(() => setAnnounceState(s => { const n = { ...s }; delete n[id]; return n }), 3000)
    } catch {
      setAnnounceState(s => ({ ...s, [id]: 'error' }))
    }
  }

  // Reset to page 1 whenever filter or search changes — paginating to
  // page 7 on PENDING and then flipping to ALL would otherwise show
  // page 7 of ALL, which is rarely what you want.
  useEffect(() => { setPage(1) }, [filter, search])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ status: filter, page: String(page), limit: String(PAGE_SIZE) })
    if (search.trim().length >= 2) params.set('q', search.trim())
    fetch(`/api/vault/referrals?${params}`)
      .then(r => r.json())
      .then((d: { referrals: ReferralItem[]; total?: number }) => {
        setReferrals(d.referrals ?? [])
        setTotal(d.total ?? 0)
        setLoading(false)
      })
  }, [filter, page, search])

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
      const d = await res.json() as { ok?: boolean; error?: string; agentCode?: string; linkedExisting?: boolean; emailSent?: boolean }
      if (res.ok) {
        setReferrals(prev => prev.map(r => r.id === id ? {
          ...r,
          status: action === 'approve' ? 'APPROVED' as const : 'REJECTED' as const,
          approvedAt: new Date().toISOString(),
        } : r))
        if (d.agentCode) {
          if (d.linkedExisting) {
            alert(`This recruit was already in the system as ${d.agentCode}. Referral closed and recruiter credit applied where the existing agent had no recruiter on file. No new welcome email sent.`)
          } else {
            alert(`Agent created with code ${d.agentCode}. Invite email ${d.emailSent ? 'sent' : 'may not have sent'}.`)
          }
        }
      } else {
        alert(d.error ?? 'Action failed')
      }
    } finally {
      setProcessingId(null)
      setCftInput('')
    }
  }

  // Block a referrer + purge their pending queue in one shot. Used when
  // an agent has been spamming the referrals queue (fake placeholder
  // emails, sequential names, etc.). The block is permanent until an
  // admin clears it from this same row.
  const handleBlock = async (referringAgentId: string, agentName: string) => {
    const reason = window.prompt(
      `Block ${agentName} from submitting new referrals?\n\nThis will (1) flag them as blocked and (2) immediately delete every PENDING referral they have on the queue. Enter a short reason for the audit trail:`,
      'Submitted multiple referrals with fake placeholder emails',
    )
    if (reason === null) return
    setProcessingId(referringAgentId)
    try {
      const res = await fetch('/api/vault/referrals/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referringAgentId, blocked: true, reason: reason.trim(), purgePending: true }),
      })
      const d = await res.json() as { ok?: boolean; purgedPending?: number; error?: string }
      if (!res.ok) { alert(d.error ?? 'Block failed'); return }
      // Refresh: remove the agent's pending referrals from view and mark
      // any of their remaining (approved/rejected) rows as BLOCKED.
      setReferrals(prev => prev
        .filter(r => !(r.referringAgentId === referringAgentId && r.status === 'PENDING'))
        .map(r => r.referringAgentId === referringAgentId
          ? { ...r, referringAgent: { ...r.referringAgent, referralsBlockedAt: new Date().toISOString() } }
          : r))
      alert(`Blocked ${agentName}. ${d.purgedPending ?? 0} pending referral(s) deleted.`)
    } finally { setProcessingId(null) }
  }

  const handleUnblock = async (referringAgentId: string, agentName: string) => {
    if (!confirm(`Unblock ${agentName}? They will be able to submit new referrals again.`)) return
    setProcessingId(referringAgentId)
    try {
      const res = await fetch('/api/vault/referrals/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referringAgentId, blocked: false }),
      })
      if (!res.ok) { alert('Unblock failed'); return }
      setReferrals(prev => prev.map(r => r.referringAgentId === referringAgentId
        ? { ...r, referringAgent: { ...r.referringAgent, referralsBlockedAt: null } }
        : r))
    } finally { setProcessingId(null) }
  }

  // Purge pending queue without blocking. Used after a "wrong form"
  // training incident (Mel mis-trained an upline who bulk-loaded their
  // BP list as referrals) where the queue needs to be cleared but the
  // referrer is legitimate and should stay able to submit.
  const handlePurgePending = async (referringAgentId: string, agentName: string) => {
    if (!confirm(`Delete every PENDING referral submitted by ${agentName}? This does NOT block them, so they can still submit new referrals after the cleanup.`)) return
    setProcessingId(referringAgentId)
    try {
      const res = await fetch('/api/vault/referrals/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referringAgentId, blocked: false, purgePending: true }),
      })
      const d = await res.json() as { ok?: boolean; purgedPending?: number; error?: string }
      if (!res.ok) { alert(d.error ?? 'Purge failed'); return }
      // Also clear any existing block flag from view since the API just set blocked=false.
      setReferrals(prev => prev
        .filter(r => !(r.referringAgentId === referringAgentId && r.status === 'PENDING'))
        .map(r => r.referringAgentId === referringAgentId
          ? { ...r, referringAgent: { ...r.referringAgent, referralsBlockedAt: null } }
          : r))
      alert(`Deleted ${d.purgedPending ?? 0} pending referral(s) from ${agentName}.`)
    } finally { setProcessingId(null) }
  }

  const sLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E',
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
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
      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or recruiter..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, color: '#d1d9e2',
            padding: '8px 12px', fontSize: 12, fontFamily: 'inherit',
          }}
        />
      </div>

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        referrals.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No referrals {filter === 'PENDING' ? 'pending approval' : 'found'}{search.trim() ? ` matching "${search.trim()}"` : ''}.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {referrals.map(r => (
            <div key={r.id} style={{
              padding: '16px 20px', borderRadius: 6,
              background: '#132238', border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>{r.firstName} {r.lastName}</div>
                  <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 2 }}>{r.email}{r.phone ? ` · ${r.phone}` : ''}{r.state ? ` · ${r.state}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/* Re-announce on Discord. Lets admins backfill the
                      NEW_RECRUIT card for referrals that landed as
                      plain text under the old code path, or push an
                      extra announcement if the original was missed. */}
                  <button
                    onClick={() => reannounce(r.id)}
                    disabled={announceState[r.id] === 'sending'}
                    title="Post the new-recruit card to the Discord announcements channel"
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 4,
                      background: announceState[r.id] === 'sent'
                        ? 'rgba(74,222,128,0.10)'
                        : announceState[r.id] === 'error'
                          ? 'rgba(248,113,113,0.10)'
                          : 'transparent',
                      border: `1px solid ${announceState[r.id] === 'sent' ? 'rgba(74,222,128,0.4)' : announceState[r.id] === 'error' ? 'rgba(248,113,113,0.4)' : 'rgba(201,169,110,0.3)'}`,
                      color: announceState[r.id] === 'sent' ? '#4ADE80' : announceState[r.id] === 'error' ? '#f87171' : '#C9A96E',
                      cursor: announceState[r.id] === 'sending' ? 'wait' : 'pointer',
                    }}
                  >
                    {announceState[r.id] === 'sending' ? 'Posting...'
                      : announceState[r.id] === 'sent' ? '✓ Sent'
                      : announceState[r.id] === 'error' ? 'Failed'
                      : 'Re-announce'}
                  </button>
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: REF_STATUS_COLORS[r.status] ?? '#6B8299',
                    padding: '2px 8px', borderRadius: 10,
                    background: r.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : r.status === 'APPROVED' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                  }}>{r.status}</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 8 }}>
                Referred by <span style={{ color: '#C9A96E' }}>{r.referringAgent.firstName} {r.referringAgent.lastName}</span> ({r.referringAgent.agentCode}) · {new Date(r.createdAt).toLocaleDateString()}
                {r.referringAgent.referralsBlockedAt && (
                  <span title="This referrer is blocked from submitting new referrals" style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F87171', padding: '2px 6px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 3 }}>BLOCKED</span>
                )}
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
                  <button
                    onClick={() => handlePurgePending(r.referringAgentId, `${r.referringAgent.firstName} ${r.referringAgent.lastName}`)}
                    disabled={processingId === r.referringAgentId}
                    title="Delete every PENDING referral this agent has queued, without blocking them. Use after a wrong-form training incident."
                    style={{
                      marginLeft: 'auto', padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: 'transparent', border: '1px solid rgba(245,158,11,0.50)',
                      color: '#F59E0B', cursor: 'pointer',
                    }}
                  >Purge their pending queue</button>
                  {r.referringAgent.referralsBlockedAt ? (
                    <button
                      onClick={() => handleUnblock(r.referringAgentId, `${r.referringAgent.firstName} ${r.referringAgent.lastName}`)}
                      disabled={processingId === r.referringAgentId}
                      title="This referrer is currently blocked. Click to allow them to submit again."
                      style={{
                        padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.40)',
                        color: '#F87171', cursor: 'pointer',
                      }}
                    >Unblock referrer</button>
                  ) : (
                    <button
                      onClick={() => handleBlock(r.referringAgentId, `${r.referringAgent.firstName} ${r.referringAgent.lastName}`)}
                      disabled={processingId === r.referringAgentId}
                      title="Block this referrer from submitting future referrals AND delete every pending referral they currently have queued."
                      style={{
                        padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: 'transparent', border: '1px solid rgba(248,113,113,0.50)',
                        color: '#F87171', cursor: 'pointer',
                      }}
                    >Block referrer + purge queue</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      }
      <PaginationControls page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────
// Reusable controls for the long-list tabs (Referrals, Agents). Shows
// "Showing X-Y of Z" + Prev/Next, and hides itself entirely when total
// fits in one page so the empty bar doesn't take up space.
function PaginationControls({
  page, total, pageSize, onPage,
}: {
  page: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  if (total <= pageSize) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    background: 'transparent',
    border: '1px solid rgba(201,169,110,0.25)',
    color: disabled ? '#4B5563' : '#C9A96E',
    borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
    textTransform: 'uppercase',
  })
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 16, padding: '12px 4px',
      borderTop: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ fontSize: 11, color: '#6B8299' }}>
        Showing <span style={{ color: '#9BB0C4' }}>{start}</span>&ndash;<span style={{ color: '#9BB0C4' }}>{end}</span> of <span style={{ color: '#9BB0C4' }}>{total}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))} style={btnStyle(page <= 1)}>← Prev</button>
        <div style={{ fontSize: 11, color: '#6B8299', minWidth: 80, textAlign: 'center' }}>
          Page <span style={{ color: '#9BB0C4', fontWeight: 700 }}>{page}</span> / {totalPages}
        </div>
        <button disabled={page >= totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))} style={btnStyle(page >= totalPages)}>Next →</button>
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
        // iOS PWA bottom-sheet would otherwise sit under the home
        // indicator on iPhones with no Home button. paddingBottom
        // pushes content up; paddingTop reserved in case the user
        // expands the sheet to ~full height.
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
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
            <div><label style={label}>ICA Date</label><DatePicker value={form.icaDate} onChange={v => setForm(f => ({ ...f, icaDate: v }))} /></div>
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

// On-behalf-of new-business logging. Built for Natalia logging
// policies Vick the CEO writes; supports any agent. Mirrors the
// agent-portal form shape so the resulting submission lands in
// New Business identically to a self-logged one.
function OnBehalfNewBusinessModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) {
  const POLICY_TYPES = [
    { value: 'TERM',        label: 'Term' },
    { value: 'WHOLE_LIFE',  label: 'Whole Life' },
    { value: 'IUL',         label: 'IUL' },
    { value: 'ANNUITY',     label: 'Annuity' },
    { value: 'DISABILITY',  label: 'Disability' },
    { value: 'LTC',         label: 'LTC' },
    { value: 'OTHER',       label: 'Other' },
  ] as const

  const [agentProfileId, setAgentProfileId] = useState<string | null>(null)
  const [splitWithAgentId, setSplitWithAgentId] = useState<string | null>(null)
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().slice(0, 10))
  const [carrier, setCarrier] = useState('')
  const [policyType, setPolicyType] = useState<string>('TERM')
  const [points, setPoints] = useState<string>('')
  const [clientFirstName, setClientFirstName] = useState('')
  const [clientLastName, setClientLastName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentProfileId) { setError('Pick the agent who wrote this policy'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/vault/new-business/on-behalf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentProfileId,
        splitWithAgentId,
        applicationDate,
        carrier,
        policyType,
        points: points || null,
        clientFirstName,
        clientLastName,
        clientPhone,
        clientEmail,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Save failed')
      setSaving(false)
      return
    }
    onCreated()
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    color: '#C9A96E', marginBottom: 6,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#d1d9e2', padding: '10px 14px',
    fontSize: 13, fontFamily: 'inherit',
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(10,22,40,0.85)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto',
      }}
    >
      <div style={{
        background: '#0C1E30', border: '1px solid rgba(201,169,110,0.25)',
        borderRadius: 8, width: '100%', maxWidth: 640, padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>Licensing Coordinator</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#fff', marginTop: 4 }}>Log New Business On Behalf</div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, lineHeight: 1.55 }}>
              Pick the agent who wrote the policy. The submission lands in their New Business pipeline + counts toward their Climb points, exactly as if they logged it themselves.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#9BB0C4', fontSize: 14, cursor: 'pointer', width: 32, height: 32 }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Agent who wrote the policy</label>
            <AgentTypeahead
              valueField="id"
              value={agentProfileId ?? ''}
              onChange={v => setAgentProfileId(v || null)}
              placeholder="Start typing… (e.g. Vick, Karmvir)"
              includeFormer={false}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Split with (optional)</label>
            <AgentTypeahead
              valueField="id"
              value={splitWithAgentId ?? ''}
              onChange={v => setSplitWithAgentId(v || null)}
              placeholder="No split"
              includeFormer={false}
            />
          </div>
          <div>
            <label style={labelStyle}>Application date</label>
            <DatePicker value={applicationDate} onChange={setApplicationDate} />
          </div>
          <div>
            <label style={labelStyle}>Carrier</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={carrier} onChange={e => setCarrier(e.target.value)} required>
              <option value="">Select carrier</option>
              {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Policy type</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={policyType} onChange={e => setPolicyType(e.target.value)}>
              {POLICY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Points</label>
            <input style={inputStyle} type="number" inputMode="numeric" value={points} onChange={e => setPoints(e.target.value)} placeholder="Optional" />
          </div>
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9BB0C4', marginBottom: 10 }}>
              Client info
            </div>
          </div>
          <div>
            <label style={labelStyle}>First name</label>
            <input style={inputStyle} value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>Last name</label>
            <input style={inputStyle} value={clientLastName} onChange={e => setClientLastName(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(555) 555-5555" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
          </div>

          {error && (
            <div style={{ gridColumn: '1 / -1', padding: '10px 14px', borderRadius: 4, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !agentProfileId} style={{ padding: '10px 18px', borderRadius: 4, fontSize: 11, background: '#C9A96E', border: 'none', color: '#142D48', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', opacity: saving || !agentProfileId ? 0.6 : 1 }}>
              {saving ? 'Logging...' : 'Log policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
