'use client'

import { useEffect, useMemo, useState } from 'react'
import { AgentTradingCardModal } from '@/components/AgentTradingCard'

// Replicates Vick's "Tracking Team Empower" spreadsheet:
//   rows = agents sorted by Day in Company
//   cols = ZOOM training events in the date range
//   cells = colored blocks (green/yellow/purple/orange/red) for each
//           (agent, event) pair, click to override.
// The grid is the prize; the underlying data flows in from the
// attendance sync. Until Vick wires up Zoom credentials the grid
// renders with PENDING cells (gray) so it's clear nothing's been
// synced yet.

interface AttendanceCell {
  status: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'NOT_TRACKING' | 'NOT_JOINED_YET' | 'PENDING'
  manual: boolean
  manualNote?: string | null
  durationSeconds?: number | null
  zoomDisplayName?: string | null
  synced?: boolean
}

interface AttendanceRow {
  agentProfileId: string
  agentCode: string
  firstName: string
  lastName: string
  cft: string | null
  phase: number
  avatarUrl: string | null
  status: 'ACTIVE' | 'INACTIVE'
  icaDate: string | null
  daysInCompany: number | null
  attendancePct: number | null
  cells: AttendanceCell[]
}

interface AttendancePresenter { name: string; role: string }
interface AttendanceEvent {
  id: string
  title: string
  startsAt: string
  attendanceSyncedAt: string | null
  flyerImageUrl: string | null
  presenters: AttendancePresenter[] | null
  streamType: 'ZOOM' | 'GFI_LIVE'
  streamId: string | null
}

interface AttendancePayload {
  range: { from: string; to: string }
  events: AttendanceEvent[]
  rows: AttendanceRow[]
}

const STATUS_STYLE: Record<AttendanceCell['status'], { bg: string; border: string; label: string; fg: string }> = {
  PRESENT:        { bg: '#4ADE80', border: '#22C55E', fg: '#0A1628', label: 'Present' },
  ABSENT:         { bg: '#FBBF24', border: '#F59E0B', fg: '#0A1628', label: 'Absent' },
  EXCUSED:        { bg: '#9B6DFF', border: '#7C3AED', fg: '#fff',    label: 'Excused' },
  NOT_TRACKING:   { bg: '#EF4444', border: '#DC2626', fg: '#fff',    label: 'Not tracking' },
  NOT_JOINED_YET: { bg: '#F97316', border: '#EA580C', fg: '#fff',    label: 'Not joined yet' },
  PENDING:        { bg: '#1F2937', border: '#374151', fg: '#6B8299', label: 'Awaiting sync' },
}

const OVERRIDE_OPTIONS: { value: AttendanceCell['status'] | 'CLEAR'; label: string }[] = [
  { value: 'PRESENT',        label: 'Mark Present' },
  { value: 'ABSENT',         label: 'Mark Absent' },
  { value: 'EXCUSED',        label: 'Mark Excused' },
  { value: 'NOT_TRACKING',   label: 'Mark Not Tracking' },
  { value: 'NOT_JOINED_YET', label: 'Mark Not Joined Yet' },
  { value: 'CLEAR',          label: 'Reset to auto' },
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
}

function fmtDuration(s: number | null | undefined): string {
  if (!s) return ''
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function todayMinusDays(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function truncateTitle(t: string, max: number): string {
  const s = (t ?? '').trim()
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

// Cell-status sort priorities. Two flavors so the user can flip
// between "show me who showed up" (present-first) and "show me who
// missed" (absent-first) without the rest of the row order randomly
// shifting.
const SORT_PRESENT_FIRST: Record<string, number> = {
  PRESENT: 0, EXCUSED: 1, ABSENT: 2, PENDING: 3, NOT_TRACKING: 4, NOT_JOINED_YET: 5,
}
const SORT_ABSENT_FIRST: Record<string, number> = {
  ABSENT: 0, PENDING: 1, EXCUSED: 2, PRESENT: 3, NOT_TRACKING: 4, NOT_JOINED_YET: 5,
}

interface OrphanRow {
  id: string
  trainingEventId: string
  eventTitle: string
  eventStartsAt: string
  zoomDisplayName: string
  zoomEmail: string | null
  joinedAt: string
  durationSeconds: number
  createdAt: string
}

interface AgentPicker {
  id: string
  agentCode: string
  firstName: string
  lastName: string
}

export default function AttendancePage() {
  const [data, setData] = useState<AttendancePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Default to the last 30 days so the initial load matches the
  // window the team is most likely scanning. Wider ranges are a
  // single click on the date input.
  const [from, setFrom] = useState(todayMinusDays(30))
  const [to, setTo] = useState(todayStr())
  const [cftFilter, setCftFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE')
  // Bulk-sync progress: { done, total, current } while running, null otherwise.
  const [bulkSync, setBulkSync] = useState<{ done: number; total: number; current: string; failures: number } | null>(null)
  // Per-event failures from the last bulk run, sticky after the run
  // finishes so admins can see which events errored and why.
  const [bulkFailures, setBulkFailures] = useState<{ id: string; title: string; date: string; error: string; kind: string }[]>([])
  // Free-text search over agent name + code.
  const [nameFilter, setNameFilter] = useState('')
  // When set, the grid rows are sorted by attendance status for this
  // event in the chosen direction. Click the column header twice to
  // toggle direction; click the same column a third time to clear.
  const [sortBy, setSortBy] = useState<{ eventId: string; direction: 'present' | 'absent' } | null>(null)
  // Hovered column header -> floating flyer/title preview.
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)
  // Clicked column header -> action panel modal.
  const [eventPanelId, setEventPanelId] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Clicked agent name -> trading card modal.
  const [cardCode, setCardCode] = useState<string | null>(null)
  const [popover, setPopover] = useState<{
    rowIdx: number
    colIdx: number
    cell: AttendanceCell
    eventId: string
    agentProfileId: string
    agentName: string
    eventTitle: string
  } | null>(null)
  const [popoverNote, setPopoverNote] = useState('')
  const [savingCell, setSavingCell] = useState(false)

  const [orphans, setOrphans] = useState<OrphanRow[]>([])
  const [orphanAgents, setOrphanAgents] = useState<AgentPicker[]>([])
  const [showOrphans, setShowOrphans] = useState(false)

  interface UntrackedEvent {
    id: string
    title: string
    startsAt: string
    flyerImageUrl: string | null
    presenters: AttendancePresenter[] | null
  }
  const [untracked, setUntracked] = useState<UntrackedEvent[]>([])
  const [showUntracked, setShowUntracked] = useState(false)
  const [reenabling, setReenabling] = useState<string | null>(null)

  const loadUntracked = async () => {
    const res = await fetch('/api/admin/attendance/untracked')
    if (!res.ok) return
    const d = await res.json() as { events: UntrackedEvent[] }
    setUntracked(d.events)
  }

  const reenableEvent = async (eventId: string) => {
    setReenabling(eventId)
    try {
      const res = await fetch(`/api/admin/trainings/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackAttendance: true }),
      })
      if (res.ok) {
        await Promise.all([loadUntracked(), load()])
      }
    } finally { setReenabling(null) }
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/attendance?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Failed to load attendance')
      const d = await res.json() as AttendancePayload
      setData(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const loadOrphans = async () => {
    const res = await fetch('/api/admin/attendance/orphans')
    if (!res.ok) return
    const d = await res.json() as { orphans: OrphanRow[]; agents: AgentPicker[] }
    setOrphans(d.orphans)
    setOrphanAgents(d.agents)
  }

  useEffect(() => { load() }, [from, to])
  useEffect(() => { loadOrphans(); loadUntracked() }, [])

  const filteredRows = useMemo(() => {
    if (!data) return []
    const q = nameFilter.trim().toLowerCase()
    let rows = data.rows.filter(r => {
      if (statusFilter === 'ACTIVE' && r.status !== 'ACTIVE') return false
      if (cftFilter && (r.cft ?? '') !== cftFilter) return false
      if (q) {
        const haystack = `${r.firstName} ${r.lastName} ${r.agentCode}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    // Sort by a specific event's status when set; otherwise the
    // server's tenure-descending order is preserved.
    if (sortBy) {
      const eventIdx = data.events.findIndex(e => e.id === sortBy.eventId)
      if (eventIdx >= 0) {
        const order = sortBy.direction === 'present' ? SORT_PRESENT_FIRST : SORT_ABSENT_FIRST
        rows = [...rows].sort((a, b) => {
          const sa = order[a.cells[eventIdx]?.status ?? 'ABSENT'] ?? 9
          const sb = order[b.cells[eventIdx]?.status ?? 'ABSENT'] ?? 9
          return sa - sb
        })
      }
    }
    return rows
  }, [data, cftFilter, statusFilter, nameFilter, sortBy])

  // Per-event tally so the action panel + hover preview can show
  // counts without re-walking the whole grid each render.
  const eventStats = useMemo(() => {
    const stats: Record<string, { present: number; absent: number; excused: number; pending: number; notTracking: number; notJoinedYet: number }> = {}
    if (!data) return stats
    for (let i = 0; i < data.events.length; i++) {
      const ev = data.events[i]
      const tally = { present: 0, absent: 0, excused: 0, pending: 0, notTracking: 0, notJoinedYet: 0 }
      for (const r of data.rows) {
        if (r.status !== 'ACTIVE') continue
        const c = r.cells[i]
        if (!c) continue
        switch (c.status) {
          case 'PRESENT': tally.present++; break
          case 'ABSENT': tally.absent++; break
          case 'EXCUSED': tally.excused++; break
          case 'PENDING': tally.pending++; break
          case 'NOT_TRACKING': tally.notTracking++; break
          case 'NOT_JOINED_YET': tally.notJoinedYet++; break
        }
      }
      stats[ev.id] = tally
    }
    return stats
  }, [data])

  const cftOptions = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    for (const r of data.rows) if (r.cft) set.add(r.cft)
    return Array.from(set).sort()
  }, [data])

  const saveCell = async (override: AttendanceCell['status'] | 'CLEAR') => {
    if (!popover) return
    setSavingCell(true)
    try {
      const res = await fetch('/api/admin/attendance/cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainingEventId: popover.eventId,
          agentProfileId: popover.agentProfileId,
          manualStatus: override === 'CLEAR' ? null : override,
          note: popoverNote || null,
        }),
      })
      if (res.ok) {
        await load()
        setPopover(null)
        setPopoverNote('')
      }
    } finally { setSavingCell(false) }
  }

  const publishToDiscord = async (eventId: string) => {
    setPublishing(true)
    setPublishMsg(null)
    try {
      const res = await fetch(`/api/admin/attendance/${eventId}/publish-discord`, { method: 'POST' })
      const d = await res.json() as { ok?: boolean; counts?: { present: number; absent: number; pct: number | null }; error?: string }
      if (res.ok && d.ok && d.counts) {
        const c = d.counts
        setPublishMsg({ ok: true, text: `Posted to Discord (${c.present} present, ${c.absent} missing${c.pct != null ? `, ${c.pct}%` : ''})` })
      } else {
        setPublishMsg({ ok: false, text: d.error ?? 'Discord post failed' })
      }
    } catch {
      setPublishMsg({ ok: false, text: 'Network error' })
    } finally {
      setPublishing(false)
      setTimeout(() => setPublishMsg(null), 8000)
    }
  }

  const toggleSort = (eventId: string) => {
    setSortBy(prev => {
      if (!prev || prev.eventId !== eventId) return { eventId, direction: 'present' }
      if (prev.direction === 'present') return { eventId, direction: 'absent' }
      return null  // third click clears
    })
  }

  // Loop through every event in the current date range and trigger a
  // sync for each. Concurrency capped at 3 so we're polite to Zoom's
  // rate limiter (heavy endpoints sit around 10 rps; 3 in flight at
  // a time keeps us comfortably under that). Per-event failures are
  // counted but don't stop the run, so a single 404 (report not yet
  // ready) doesn't abort the whole backfill.
  const syncAll = async () => {
    if (!data || data.events.length === 0) return
    // Only Zoom events can be auto-synced; non-Zoom events on the
    // grid are for manual marking only and shouldn't add 400s to the
    // failure panel.
    const events = data.events.filter(e => e.streamType === 'ZOOM' && e.streamId)
    if (events.length === 0) return
    setBulkSync({ done: 0, total: events.length, current: '', failures: 0 })
    setBulkFailures([])

    const CONCURRENCY = 3
    let cursor = 0
    let failures = 0
    const failureLog: typeof bulkFailures = []

    const worker = async () => {
      while (cursor < events.length) {
        const idx = cursor++
        const ev = events[idx]
        setBulkSync(s => s ? { ...s, current: ev.title } : s)
        try {
          const res = await fetch(`/api/admin/trainings/${ev.id}/sync-attendance`, { method: 'POST' })
          if (!res.ok) {
            const d = await res.json().catch(() => ({})) as { error?: string; kind?: string }
            failures++
            failureLog.push({
              id: ev.id,
              title: ev.title,
              date: ev.startsAt,
              error: d.error ?? `HTTP ${res.status}`,
              kind: d.kind ?? 'unknown',
            })
          }
        } catch (err) {
          failures++
          failureLog.push({
            id: ev.id,
            title: ev.title,
            date: ev.startsAt,
            error: err instanceof Error ? err.message : 'Network error',
            kind: 'network',
          })
        }
        setBulkSync(s => s ? { ...s, done: s.done + 1, failures } : s)
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    setBulkSync(null)
    setBulkFailures(failureLog)
    await load()
    await loadOrphans()
  }

  return (
    <div style={{ maxWidth: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>Trainings</p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>Attendance</h1>
        <p style={{ color: '#6B8299', fontSize: 12, marginTop: 8, lineHeight: 1.6, maxWidth: 720 }}>
          Auto-pulled from Zoom after each ZOOM-streamed training. Click any cell to set Excused, Not Tracking, or override the auto value. Re-syncs preserve your overrides.
        </p>
      </div>

      {/* Filters + legend */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={lblStyle}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={lblStyle}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={lblStyle}>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'ACTIVE' | 'ALL')} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="ACTIVE">Active only</option>
            <option value="ALL">All (incl. inactive)</option>
          </select>
        </div>
        <div>
          <label style={lblStyle}>Trainer (CFT)</label>
          <select value={cftFilter} onChange={e => setCftFilter(e.target.value)} style={{ ...inputStyle, appearance: 'auto', minWidth: 160 }}>
            <option value="">All trainers</option>
            {cftOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={lblStyle}>Search</label>
          <input
            type="search"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder="Filter by name or code..."
            style={{ ...inputStyle, minWidth: 200 }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={syncAll}
          disabled={!!bulkSync || !data || data.events.length === 0}
          title="Re-pull attendance from Zoom for every event in this date range"
          style={{
            padding: '8px 14px', background: bulkSync ? 'rgba(96,165,250,0.18)' : 'rgba(96,165,250,0.10)',
            color: '#60a5fa', border: '1px solid rgba(96,165,250,0.40)',
            borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: bulkSync ? 'wait' : (!data || data.events.length === 0) ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {bulkSync
            ? `Syncing ${bulkSync.done}/${bulkSync.total}...`
            : `↻ Sync all ${data?.events.filter(e => e.streamType === 'ZOOM' && e.streamId).length ?? 0} Zoom events`}
        </button>
        {untracked.length > 0 && (
          <button
            onClick={() => setShowUntracked(true)}
            title="Re-enable events you previously stopped tracking"
            style={{
              padding: '8px 14px', background: 'rgba(107,130,153,0.10)',
              color: '#9BB0C4', border: '1px solid rgba(107,130,153,0.30)',
              borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {untracked.length} untracked
          </button>
        )}
        {orphans.length > 0 && (
          <button
            onClick={() => setShowOrphans(s => !s)}
            style={{
              padding: '8px 14px', background: 'rgba(248,113,113,0.10)',
              color: '#f87171', border: '1px solid rgba(248,113,113,0.35)',
              borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {showOrphans ? 'Hide' : 'Resolve'} {orphans.length} unmatched
          </button>
        )}
      </div>

      {bulkSync && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'rgba(96,165,250,0.06)',
          border: '1px solid rgba(96,165,250,0.25)', borderRadius: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 11, color: '#9BB0C4', marginBottom: 6 }}>
            <span>Pulling from Zoom: {bulkSync.current || '...'}</span>
            <span style={{ color: '#60a5fa', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {bulkSync.done} / {bulkSync.total}{bulkSync.failures > 0 && (
                <span style={{ color: '#f87171', marginLeft: 8 }}>({bulkSync.failures} failed)</span>
              )}
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.round((bulkSync.done / bulkSync.total) * 100)}%`,
              height: '100%', background: '#60a5fa', transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {!bulkSync && bulkFailures.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '12px 14px',
          background: 'rgba(248,113,113,0.06)',
          border: '1px solid rgba(248,113,113,0.30)', borderRadius: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f87171' }}>
              {bulkFailures.length} event{bulkFailures.length > 1 ? 's' : ''} couldn&apos;t sync
            </span>
            <button
              onClick={() => setBulkFailures([])}
              style={{ background: 'transparent', border: 'none', color: '#6B8299', fontSize: 11, cursor: 'pointer' }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bulkFailures.map(f => (
              <div key={f.id} style={{ fontSize: 11, color: '#9BB0C4', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ color: '#fff', fontWeight: 500 }}>{fmtDate(f.date)}</span>
                <span style={{ color: '#9BB0C4' }}>{f.title}</span>
                <span style={{ color: '#f87171', flex: 1, minWidth: 200 }}>· {f.error}</span>
                {f.kind === 'not_ready' && <span style={{ fontSize: 9, color: '#FBBF24', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>retry later</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 10, lineHeight: 1.5 }}>
            <strong style={{ color: '#9BB0C4' }}>&quot;not found&quot; / 404</strong> usually means the meeting was hosted by a Zoom user outside this Workspace account. Zoom&apos;s API only returns participant data for meetings owned by users in the connected account.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {(['PRESENT','ABSENT','EXCUSED','NOT_JOINED_YET','NOT_TRACKING','PENDING'] as const).map(s => (
          <span key={s} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, color: '#9BB0C4', letterSpacing: '0.05em',
          }}>
            <span style={{
              display: 'inline-block', width: 14, height: 14, borderRadius: 2,
              background: STATUS_STYLE[s].bg, border: `1px solid ${STATUS_STYLE[s].border}`,
            }} />
            {STATUS_STYLE[s].label}
          </span>
        ))}
      </div>

      {showOrphans && (
        <OrphanQueue
          orphans={orphans}
          agents={orphanAgents}
          onResolved={async () => { await loadOrphans(); await load() }}
        />
      )}

      {error && (
        <div style={{ padding: 14, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, color: '#f87171', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center' }}>Loading attendance...</div>
      ) : !data || data.events.length === 0 ? (
        <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center', border: '1px dashed rgba(201,169,110,0.18)', borderRadius: 6 }}>
          No ZOOM trainings in this date range. Trainings streamed via GFI Live aren&apos;t tracked here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 6, background: '#0C1E30' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, color: '#9BB0C4' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 3, background: '#142D48', textAlign: 'right' }}>Day in co.</th>
                <th style={{ ...thStyle, position: 'sticky', left: 78, zIndex: 3, background: '#142D48', minWidth: 180 }}>Agent</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>%</th>
                {data.events.map(ev => {
                  const isSorted = sortBy?.eventId === ev.id
                  const sortIcon = isSorted ? (sortBy.direction === 'present' ? '↓✓' : '↑✗') : ''
                  return (
                    <th key={ev.id} style={{ ...thStyle, minWidth: 56, padding: '6px 4px', cursor: 'pointer' }}>
                      <div
                        onMouseEnter={() => setHoveredEventId(ev.id)}
                        onMouseLeave={() => setHoveredEventId(prev => prev === ev.id ? null : prev)}
                        onClick={() => setEventPanelId(ev.id)}
                        title={ev.title}
                        style={{
                          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                          whiteSpace: 'nowrap', fontSize: 10, color: '#9BB0C4', fontWeight: 600,
                          paddingTop: 8,
                          display: 'inline-flex', flexDirection: 'column', gap: 4,
                          minHeight: 140,
                        }}
                      >
                        <span style={{ color: '#fff', fontWeight: 700 }}>
                          {fmtDate(ev.startsAt)}
                          {sortIcon && <span style={{ color: '#60a5fa', marginLeft: 4 }}>{sortIcon}</span>}
                        </span>
                        <span style={{ color: '#C9A96E', fontSize: 9, fontWeight: 600 }}>
                          {truncateTitle(ev.title, 32)}
                        </span>
                        {ev.streamType !== 'ZOOM' && (
                          <span style={{ color: '#9B6DFF', fontSize: 9, fontWeight: 700 }}>manual</span>
                        )}
                        {ev.streamType === 'ZOOM' && !ev.attendanceSyncedAt && <span style={{ color: '#6B8299', fontSize: 9 }}>pending</span>}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, rIdx) => (
                <tr key={row.agentProfileId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...tdStyle, position: 'sticky', left: 0, zIndex: 2, background: '#0C1E30', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6B8299' }}>
                    {row.daysInCompany ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 78, zIndex: 2, background: '#0C1E30' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: row.avatarUrl ? `url(${row.avatarUrl}) center/cover` : 'rgba(201,169,110,0.15)',
                        border: '1px solid rgba(201,169,110,0.3)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, color: '#C9A96E', flexShrink: 0,
                      }}>
                        {!row.avatarUrl && `${row.firstName[0] ?? ''}${row.lastName[0] ?? ''}`}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          onClick={() => setCardCode(row.agentCode)}
                          title="Open trading card · call · text · email"
                          style={{
                            color: '#fff', fontWeight: 500, fontSize: 12, lineHeight: 1.2,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            cursor: 'pointer',
                          }}
                        >
                          {row.firstName} {row.lastName}
                        </div>
                        <div style={{ fontSize: 9, color: '#6B8299', letterSpacing: '0.04em' }}>
                          {row.agentCode}{row.cft ? ` · ${row.cft}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: row.attendancePct == null ? '#4B5563' : row.attendancePct >= 80 ? '#4ade80' : row.attendancePct >= 50 ? '#FBBF24' : '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {row.attendancePct == null ? '—' : `${row.attendancePct}%`}
                  </td>
                  {row.cells.map((cell, cIdx) => {
                    const ev = data.events[cIdx]
                    const meta = STATUS_STYLE[cell.status]
                    return (
                      <td key={`${row.agentProfileId}:${ev.id}`} style={{ ...tdStyle, padding: 2, textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setPopover({
                              rowIdx: rIdx,
                              colIdx: cIdx,
                              cell,
                              eventId: ev.id,
                              agentProfileId: row.agentProfileId,
                              agentName: `${row.firstName} ${row.lastName}`,
                              eventTitle: ev.title,
                            })
                            setPopoverNote(cell.manualNote ?? '')
                          }}
                          title={[
                            `${row.firstName} ${row.lastName}`,
                            ev.title,
                            meta.label,
                            cell.manual ? '(manual override)' : '',
                            cell.durationSeconds != null ? `Joined: ${fmtDuration(cell.durationSeconds)}` : '',
                            cell.zoomDisplayName ? `Zoom name: ${cell.zoomDisplayName}` : '',
                            cell.manualNote ? `Note: ${cell.manualNote}` : '',
                          ].filter(Boolean).join('\n')}
                          style={{
                            width: '100%', height: 28,
                            background: meta.bg,
                            border: `1px solid ${meta.border}`,
                            borderRadius: 2,
                            cursor: 'pointer',
                            position: 'relative',
                            padding: 0,
                          }}
                        >
                          {cell.manual && (
                            <span style={{
                              position: 'absolute', top: 1, right: 2,
                              fontSize: 8, color: meta.fg, fontWeight: 700,
                            }}>•</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hover preview: flyer thumbnail + full title + presenters.
          Pinned bottom-right so the table doesn't shift; pointer-
          events: none so it never intercepts clicks. */}
      {hoveredEventId && data && !eventPanelId && (() => {
        const ev = data.events.find(e => e.id === hoveredEventId)
        if (!ev) return null
        const presStr = ev.presenters?.map(p => p.name).join(' · ')
        return (
          <div style={{
            position: 'fixed', bottom: 24, right: 24,
            background: '#142D48', border: '1px solid rgba(201,169,110,0.35)',
            borderRadius: 8, padding: 14, maxWidth: 320,
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            zIndex: 80, pointerEvents: 'none',
          }}>
            {ev.flyerImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ev.flyerImageUrl} alt="" style={{ width: '100%', borderRadius: 6, marginBottom: 10, display: 'block' }} />
            )}
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1.35, marginBottom: 4 }}>
              {ev.title}
            </div>
            <div style={{ color: '#9BB0C4', fontSize: 11 }}>
              {fmtDate(ev.startsAt)}{presStr ? ` · ${presStr}` : ''}
            </div>
          </div>
        )
      })()}

      {/* Per-event action panel: stats, sort toggles, publish button.
          Modal because we want all the actions in one focused space
          and the column headers are too narrow for inline buttons. */}
      {eventPanelId && data && (() => {
        const ev = data.events.find(e => e.id === eventPanelId)
        if (!ev) return null
        const stats = eventStats[ev.id] ?? { present: 0, absent: 0, excused: 0, pending: 0, notTracking: 0, notJoinedYet: 0 }
        const counted = stats.present + stats.absent + stats.excused
        const attended = stats.present + stats.excused
        const pct = counted > 0 ? Math.round((attended / counted) * 100) : null
        const presStr = ev.presenters?.map(p => p.name).join(' · ')
        const isSorted = sortBy?.eventId === ev.id
        return (
          <div
            onClick={() => setEventPanelId(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#142D48', border: '1px solid rgba(201,169,110,0.25)',
                borderRadius: 8, padding: 20, width: '100%', maxWidth: 480,
                boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                {ev.flyerImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.flyerImageUrl} alt="" style={{ width: 96, height: 'auto', borderRadius: 6, flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
                    {fmtDate(ev.startsAt)}
                  </div>
                  <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
                    {ev.title}
                  </div>
                  {presStr && (
                    <div style={{ color: '#9BB0C4', fontSize: 11, marginTop: 4 }}>
                      Presented by {presStr}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                <Stat color="#4ADE80" label="Present" value={stats.present} />
                <Stat color="#FBBF24" label="Absent"  value={stats.absent} />
                <Stat color="#9B6DFF" label="Excused" value={stats.excused} />
                <Stat color="#9BB0C4" label="Rate" value={pct != null ? `${pct}%` : '—'} />
              </div>

              {/* Sort toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => toggleSort(ev.id)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 4,
                    background: isSorted ? 'rgba(96,165,250,0.18)' : 'transparent',
                    border: '1px solid rgba(96,165,250,0.4)',
                    color: '#60a5fa', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {isSorted
                    ? sortBy!.direction === 'present'
                      ? 'Sorted: present first ✓ — flip'
                      : 'Sorted: absent first ✗ — clear'
                    : 'Sort grid by this event'}
                </button>
              </div>

              {/* Publish to Discord */}
              <button
                onClick={() => publishToDiscord(ev.id)}
                disabled={publishing || !ev.attendanceSyncedAt}
                title={ev.attendanceSyncedAt ? 'Post a recap to the admin Discord channel' : 'Sync this event from Zoom first'}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 4,
                  background: '#C9A96E', color: '#142D48', border: 'none',
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: publishing ? 'wait' : !ev.attendanceSyncedAt ? 'not-allowed' : 'pointer',
                  opacity: !ev.attendanceSyncedAt ? 0.5 : 1,
                }}
              >
                {publishing ? 'Posting...' : '📣 Publish stats to Discord'}
              </button>

              {/* Stop tracking — removes the column from the grid + skips
                  the cron going forward. Useful for events that aren't
                  hosted on the AFF Zoom account (Onboarding Academy,
                  hierarchy calls, guest broadcasts). */}
              <button
                onClick={async () => {
                  const res = await fetch(`/api/admin/trainings/${ev.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trackAttendance: false }),
                  })
                  if (res.ok) {
                    setEventPanelId(null)
                    await load()
                  }
                }}
                style={{
                  width: '100%', marginTop: 8, padding: '8px 14px', borderRadius: 4,
                  background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.35)',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Stop tracking this event
              </button>

              {publishMsg && (
                <div style={{ marginTop: 10, fontSize: 11, color: publishMsg.ok ? '#4ade80' : '#f87171' }}>
                  {publishMsg.ok ? '✓ ' : '✗ '}{publishMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  onClick={() => setEventPanelId(null)}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Re-enable list: every Zoom event currently flipped to
          trackAttendance=false, with a one-click Re-enable button so
          admins don't have to hunt through /vault/trainings. */}
      {showUntracked && (
        <div
          onClick={() => setShowUntracked(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#142D48', border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 8, padding: 20, width: '100%', maxWidth: 520,
              maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              Untracked events
            </div>
            <div style={{ color: '#9BB0C4', fontSize: 11, marginBottom: 14, lineHeight: 1.5 }}>
              These Zoom events are currently excluded from the grid + cron. Click <strong style={{ color: '#fff' }}>Re-enable</strong> to add one back.
            </div>

            {untracked.length === 0 ? (
              <div style={{ color: '#6B8299', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                Nothing currently untracked.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {untracked.map(ev => {
                  const presStr = ev.presenters?.map(p => p.name).join(' · ')
                  return (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 5 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: 12, fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.title}
                        </div>
                        <div style={{ color: '#6B8299', fontSize: 10, marginTop: 2 }}>
                          {fmtDate(ev.startsAt)}{presStr ? ` · ${presStr}` : ''}
                        </div>
                      </div>
                      <button
                        disabled={reenabling === ev.id}
                        onClick={() => reenableEvent(ev.id)}
                        style={{
                          background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.40)',
                          color: '#60a5fa', borderRadius: 4, padding: '6px 12px',
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          cursor: reenabling === ev.id ? 'wait' : 'pointer',
                        }}
                      >
                        {reenabling === ev.id ? '...' : 'Re-enable'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => setShowUntracked(false)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {cardCode && <AgentTradingCardModal agentCode={cardCode} onClose={() => setCardCode(null)} />}

      {popover && data && (
        <div
          onClick={() => setPopover(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#142D48', border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: 8, padding: 20, width: '100%', maxWidth: 360,
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              Override cell
            </div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
              {popover.agentName}
            </div>
            <div style={{ color: '#9BB0C4', fontSize: 11, marginBottom: 14 }}>
              {popover.eventTitle} · {fmtDate(data.events[popover.colIdx].startsAt)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {OVERRIDE_OPTIONS.map(opt => {
                const isCurrent = (opt.value === 'CLEAR' && !popover.cell.manual)
                  || (opt.value !== 'CLEAR' && popover.cell.manual && popover.cell.status === opt.value)
                return (
                  <button
                    key={opt.value}
                    disabled={savingCell}
                    onClick={() => saveCell(opt.value)}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px', borderRadius: 4, fontSize: 12,
                      background: isCurrent ? 'rgba(201,169,110,0.15)' : 'transparent',
                      border: '1px solid rgba(201,169,110,0.25)',
                      color: '#9BB0C4', cursor: savingCell ? 'wait' : 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {opt.label}{isCurrent ? ' ✓' : ''}
                  </button>
                )
              })}
            </div>

            <label style={lblStyle}>Note (optional)</label>
            <textarea
              value={popoverNote}
              onChange={e => setPopoverNote(e.target.value)}
              placeholder="e.g. PTO, family emergency, GFI conference"
              rows={2}
              style={{ ...inputStyle, fontFamily: 'inherit', minHeight: 48 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => setPopover(null)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0C1E30', border: '1px solid rgba(201,169,110,0.18)',
  borderRadius: 4, color: '#d1d9e2', padding: '7px 10px',
  fontSize: 12, outline: 'none', fontFamily: 'inherit',
}
const lblStyle: React.CSSProperties = {
  display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
  textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4,
}
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 8px',
  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: '#C9A96E', borderBottom: '1px solid rgba(201,169,110,0.2)',
  background: '#142D48',
}
const tdStyle: React.CSSProperties = {
  padding: '6px 8px', verticalAlign: 'middle',
}

function Stat({ color, label, value }: { color: string; label: string; value: number | string }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 6,
      background: `${color}14`, border: `1px solid ${color}40`,
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'Cormorant Garamond, Georgia, serif', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  )
}

function OrphanQueue({ orphans, agents, onResolved }: {
  orphans: OrphanRow[]
  agents: AgentPicker[]
  onResolved: () => void | Promise<void>
}) {
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const resolve = async (orphanId: string) => {
    const agentProfileId = picks[orphanId]
    if (!agentProfileId) return
    setBusy(orphanId)
    try {
      const res = await fetch('/api/admin/attendance/orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orphanId, agentProfileId }),
      })
      if (res.ok) await onResolved()
    } finally { setBusy(null) }
  }

  const dismiss = async (orphanId: string) => {
    setBusy(orphanId)
    try {
      const res = await fetch(`/api/admin/attendance/orphans?orphanId=${encodeURIComponent(orphanId)}`, {
        method: 'DELETE',
      })
      if (res.ok) await onResolved()
    } finally { setBusy(null) }
  }

  return (
    <div style={{ marginBottom: 18, border: '1px solid rgba(248,113,113,0.25)', borderRadius: 6, padding: 14, background: 'rgba(248,113,113,0.04)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f87171', marginBottom: 8 }}>
        Unmatched Zoom participants
      </div>
      <div style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 12, lineHeight: 1.5 }}>
        Zoom recorded these joins but the matcher couldn&apos;t find an agent. Pick the right person to resolve, or dismiss if it was a guest.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orphans.map(o => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: 4 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>{o.zoomDisplayName}</div>
              <div style={{ color: '#6B8299', fontSize: 10 }}>
                {o.zoomEmail ?? 'no email'} · {o.eventTitle} · {fmtDate(o.eventStartsAt)} · {fmtDuration(o.durationSeconds)}
              </div>
            </div>
            <select
              value={picks[o.id] ?? ''}
              onChange={e => setPicks(p => ({ ...p, [o.id]: e.target.value }))}
              style={{ ...inputStyle, appearance: 'auto', minWidth: 200 }}
            >
              <option value="">Pick agent...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} ({a.agentCode})
                </option>
              ))}
            </select>
            <button
              disabled={busy === o.id || !picks[o.id]}
              onClick={() => resolve(o.id)}
              style={{
                background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.4)',
                color: '#4ade80', borderRadius: 4, padding: '6px 12px',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: busy === o.id || !picks[o.id] ? 'not-allowed' : 'pointer',
              }}
            >
              {busy === o.id ? '...' : 'Resolve'}
            </button>
            <button
              disabled={busy === o.id}
              onClick={() => dismiss(o.id)}
              title="Mark as guest, do not create attendance row"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                color: '#6B8299', borderRadius: 4, padding: '6px 10px',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: busy === o.id ? 'not-allowed' : 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
