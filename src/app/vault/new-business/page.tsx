'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import DatePicker from '@/components/DatePicker'
import AgentTypeahead from '@/components/AgentTypeahead'
import { TIME_RANGE_OPTIONS, rangeForKey, type TimeRangeKey } from '@/lib/time-range'

const card = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14 }
const inputStyle = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }
const fieldLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C9A96E', display: 'block', marginBottom: 4 }

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  PENDING_CARRIER: { bg: 'rgba(96,165,250,0.15)', fg: '#60A5FA' },
  HOLD: { bg: 'rgba(168,85,247,0.15)', fg: '#C084FC' },
  ISSUED: { bg: 'rgba(74,222,128,0.15)', fg: '#4ADE80' },
  DECLINED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  LAPSED: { bg: 'rgba(107,114,128,0.2)', fg: '#9CA3AF' },
  NOT_TAKEN: { bg: 'rgba(107,114,128,0.2)', fg: '#9CA3AF' },
  CONDITIONALLY_ISSUED: { bg: 'rgba(74,222,128,0.10)', fg: '#86EFAC' },
}
const STATUSES = ['PENDING', 'PENDING_CARRIER', 'HOLD', 'ISSUED', 'CONDITIONALLY_ISSUED', 'DECLINED', 'LAPSED', 'NOT_TAKEN'] as const
// LC SOP labels: the guide calls the initial state "New" (= PENDING,
// the default the claim/stats flow keys on) and "Pending" the separate
// at-carrier state (= PENDING_CARRIER). "Hold" is a paused state. These
// labels drive the note composer + status pills; enum values unchanged.
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'New', PENDING_CARRIER: 'Pending', HOLD: 'Hold', ISSUED: 'Issued',
  CONDITIONALLY_ISSUED: 'Conditionally Issued',
  DECLINED: 'Declined', LAPSED: 'Lapsed', NOT_TAKEN: 'Not Taken',
}
const POLICY_LABEL: Record<string, string> = {
  TERM: 'Term', WHOLE_LIFE: 'Whole Life', IUL: 'IUL', ANNUITY: 'Annuity',
  DISABILITY: 'Disability', LTC: 'LTC', OTHER: 'Other',
}

interface SubmissionListItem {
  id: string
  carrier: string
  policyType: string
  points: number | null
  clientFirstName: string
  clientLastName: string
  status: string
  createdAt: string
  issuedDate: string | null
  agentProfile: { id: string; firstName: string; lastName: string; agentCode: string }
  splitWithAgent: { id: string; firstName: string; lastName: string } | null
  assignedTo: { id: string; name: string } | null
  _count: { notes: number }
}

interface SubmissionDetail extends SubmissionListItem {
  applicationDate: string
  policyNumber: string | null
  declinedReason: string | null
  illustrationUrls: string[]
  clientPhone: string | null
  clientEmail: string | null
  clientBirthday: string | null
  clientAddressLine1: string | null
  clientAddressLine2: string | null
  clientCity: string | null
  clientState: string | null
  clientZip: string | null
  notes: {
    id: string
    body: string
    authorType: 'AGENT' | 'ADMIN'
    authorAgent: { id: string; firstName: string; lastName: string } | null
    authorAdmin: { name: string } | null
    createdAt: string
  }[]
}

interface Stats {
  pending: number
  assignedToMe: number
  unassigned: number
  issued: number
  declined: number
  points: number
}

const DEFAULT_RANGE: TimeRangeKey = 'last30'
const EMPTY_STATS: Stats = { pending: 0, assignedToMe: 0, unassigned: 0, issued: 0, declined: 0, points: 0 }

export default function VaultNewBusinessPage() {
  // Self id is needed to claim a row ("Assign to me" sends our own id
  // to the assignedToId column). Pulled from the NextAuth session.
  const { data: session } = useSession()
  const selfId = (session?.user as { id?: string } | undefined)?.id ?? null

  const [list, setList] = useState<SubmissionListItem[]>([])
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [busyAssignId, setBusyAssignId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [assignment, setAssignment] = useState<string>('') // '' | 'me' | 'unassigned'
  const [agentFilter, setAgentFilter] = useState<string>('')   // '' or agentProfileId
  const [agentFilterLabel, setAgentFilterLabel] = useState<string>('') // display name for the active-filter chip
  const [search, setSearch] = useState('')
  const [rangeKey, setRangeKey] = useState<TimeRangeKey>(DEFAULT_RANGE)
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo, setCustomTo] = useState<string>('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [carrierFilter, setCarrierFilter] = useState('')
  const [policyTypeFilter, setPolicyTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const PAGE_SIZE = 50
  // Agent picker options. Loaded once on mount and not refiltered as the
  // list narrows so the dropdown always shows every agent that has at
  // least one submission on file.
  const [agentOptions, setAgentOptions] = useState<{ id: string; firstName: string; lastName: string; agentCode: string }[]>([])

  useEffect(() => {
    fetch('/api/vault/new-business/agents')
      .then(r => r.ok ? r.json() : null)
      .then((d: { agents: typeof agentOptions } | null) => {
        if (d?.agents) setAgentOptions(d.agents)
      })
      .catch(() => {})
  }, [])

  // Compute the active [from, to) the page is filtering on. For custom we
  // build it from the two date inputs; for presets we let the helper pick.
  const activeRange = useMemo(() => {
    if (rangeKey === 'custom') {
      const from = customFrom ? new Date(customFrom) : null
      // Inclusive upper bound — bump to start of next day so the API's
      // half-open [from, to) clause includes the picked end date.
      let to: Date | null = null
      if (customTo) {
        const t = new Date(customTo)
        t.setDate(t.getDate() + 1)
        to = t
      }
      return { from, to }
    }
    return rangeForKey(rangeKey)
  }, [rangeKey, customFrom, customTo])

  const rangeLabel = TIME_RANGE_OPTIONS.find(o => o.key === rangeKey)?.label ?? 'Range'

  const refresh = useCallback(() => {
    const p = new URLSearchParams()
    if (statusFilter) p.set('status', statusFilter)
    if (assignment) p.set('assignment', assignment)
    if (agentFilter) p.set('agent', agentFilter)
    if (search.trim()) p.set('q', search.trim())
    if (carrierFilter.trim()) p.set('carrier', carrierFilter.trim())
    if (policyTypeFilter) p.set('policyType', policyTypeFilter)
    if (activeRange.from) p.set('from', activeRange.from.toISOString())
    if (activeRange.to) p.set('to', activeRange.to.toISOString())
    p.set('page', String(page))
    p.set('pageSize', String(PAGE_SIZE))
    Promise.all([
      fetch(`/api/vault/new-business?${p.toString()}`).then(r => r.ok ? r.json() : { submissions: [], total: 0 }),
      fetch(`/api/vault/new-business/stats?${p.toString()}`).then(r => r.ok ? r.json() : null),
    ]).then(([listRes, statsRes]: [{ submissions: SubmissionListItem[]; total: number }, Stats | null]) => {
      setList(listRes.submissions ?? [])
      setTotal(listRes.total ?? 0)
      if (statsRes) setStats(statsRes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [statusFilter, assignment, agentFilter, search, carrierFilter, policyTypeFilter, activeRange, page])

  // Reset to page 1 whenever any filter changes.
  useEffect(() => { setPage(1) }, [statusFilter, assignment, agentFilter, search, carrierFilter, policyTypeFilter, rangeKey, customFrom, customTo])

  useEffect(() => { refresh() }, [refresh])

  // Claim a row to the current LC / admin (or any other staff if we
  // ever add a "reassign to..." menu). Sends a PATCH with the new
  // assignedToId; null means unclaim. Stops row click propagation
  // so we don't open the drawer at the same time.
  const setAssignee = async (e: React.MouseEvent, id: string, newAssigneeId: string | null) => {
    e.stopPropagation()
    setBusyAssignId(id)
    try {
      const res = await fetch(`/api/vault/new-business/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId: newAssigneeId }),
      })
      if (res.ok) refresh()
    } finally { setBusyAssignId(null) }
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={sectionLabel}>Licensing Coordinator</div>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            New Business
          </h1>
          <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
            Submissions from agents. Update status as you work them in Tevah; notes here are visible to the agent.
          </p>
        </div>
        <button
          onClick={() => setShowDuplicates(true)}
          title="Find existing duplicate submissions (same writer + client + product) and merge them"
          style={{
            background: 'transparent', color: '#9BB0C4',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
            padding: '8px 14px', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Find duplicates
        </button>
      </div>

      {showDuplicates && <DuplicatesModal onClose={() => setShowDuplicates(false)} onMerged={refresh} />}

      {/* KPI cards. The first five act as quick filters — clicking sets the
          relevant status/assignment combination on the table; clicking again
          (when the same filter is active) clears it. Points is display-only
          since it's a tally rather than a row category. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard
          label="Pending (now)"
          value={stats.pending}
          accent="#F59E0B"
          hint={stats.pending === 0
            ? 'No PENDING submissions. You\'re caught up.'
            : `${stats.pending} submission${stats.pending === 1 ? '' : 's'} still in PENDING. Tap to filter and work them.`}
          active={statusFilter === 'PENDING' && assignment === ''}
          onClick={() => {
            const wasActive = statusFilter === 'PENDING' && assignment === ''
            setStatusFilter(wasActive ? '' : 'PENDING')
            setAssignment('')
          }}
        />
        <KpiCard
          label="Assigned to me"
          value={stats.assignedToMe}
          accent="#9B6DFF"
          hint={stats.assignedToMe === 0
            ? 'Nothing on your plate yet.'
            : 'PENDING submissions you claimed. Update the status as you work them.'}
          active={assignment === 'me'}
          onClick={() => setAssignment(assignment === 'me' ? '' : 'me')}
        />
        <KpiCard
          label="Unassigned"
          value={stats.unassigned}
          accent="#6B8299"
          hint={stats.unassigned === 0
            ? 'Every PENDING submission has someone on it.'
            : `${stats.unassigned} PENDING submission${stats.unassigned === 1 ? ' is' : 's are'} waiting for an LC to claim. Tap to filter, then claim with "Assign to me".`}
          active={assignment === 'unassigned'}
          onClick={() => setAssignment(assignment === 'unassigned' ? '' : 'unassigned')}
        />
        <KpiCard
          label={`Issued · ${rangeLabel}`}
          value={stats.issued}
          accent="#4ADE80"
          hint={`Submissions marked ISSUED in the ${rangeLabel.toLowerCase()}. Reference, no action needed.`}
          active={statusFilter === 'ISSUED'}
          onClick={() => setStatusFilter(statusFilter === 'ISSUED' ? '' : 'ISSUED')}
        />
        <KpiCard
          label={`Declined · ${rangeLabel}`}
          value={stats.declined}
          accent="#EF4444"
          hint={`Submissions DECLINED by the carrier. Note the reason on the row so the agent has context.`}
          active={statusFilter === 'DECLINED'}
          onClick={() => setStatusFilter(statusFilter === 'DECLINED' ? '' : 'DECLINED')}
        />
        <KpiCard
          label={`Points · ${rangeLabel}`}
          value={stats.points.toLocaleString()}
          accent="#C9A96E"
          hint="Total target premium across ISSUED submissions in this range."
        />
      </div>

      {(statusFilter || assignment || agentFilter || search.trim() || carrierFilter.trim() || policyTypeFilter) && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#6B8299' }}>Active filters:</span>
          {statusFilter && <FilterPill label={`Status: ${statusFilter.replace('_', ' ')}`} onClear={() => setStatusFilter('')} />}
          {assignment === 'me' && <FilterPill label="Assigned to me" onClear={() => setAssignment('')} />}
          {assignment === 'unassigned' && <FilterPill label="Unassigned" onClear={() => setAssignment('')} />}
          {agentFilter && (() => {
            const a = agentOptions.find(x => x.id === agentFilter)
            const name = agentFilterLabel || (a ? `${a.firstName} ${a.lastName}` : '(selected)')
            return <FilterPill label={`Agent: ${name}`} onClear={() => { setAgentFilter(''); setAgentFilterLabel('') }} />
          })()}
          {carrierFilter.trim() && <FilterPill label={`Carrier: ${carrierFilter.trim()}`} onClear={() => setCarrierFilter('')} />}
          {policyTypeFilter && <FilterPill label={`Type: ${POLICY_LABEL[policyTypeFilter] ?? policyTypeFilter}`} onClear={() => setPolicyTypeFilter('')} />}
          {search.trim() && <FilterPill label={`Search: "${search.trim()}"`} onClear={() => setSearch('')} />}
          <button
            onClick={() => { setStatusFilter(''); setAssignment(''); setAgentFilter(''); setAgentFilterLabel(''); setSearch(''); setCarrierFilter(''); setPolicyTypeFilter('') }}
            style={{ background: 'transparent', border: 'none', color: '#9B6DFF', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          >Clear all</button>
        </div>
      )}

      <div style={{ ...card, padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Time range</label>
          <select style={inputStyle} value={rangeKey} onChange={e => setRangeKey(e.target.value as TimeRangeKey)}>
            {TIME_RANGE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        {rangeKey === 'custom' && (
          <>
            <div style={{ minWidth: 150 }}>
              <label style={fieldLabel}>From</label>
              <DatePicker value={customFrom} onChange={setCustomFrom} />
            </div>
            <div style={{ minWidth: 150 }}>
              <label style={fieldLabel}>To</label>
              <DatePicker value={customTo} onChange={setCustomTo} />
            </div>
          </>
        )}
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Status</label>
          <select style={inputStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Assignment</label>
          <select style={inputStyle} value={assignment} onChange={e => setAssignment(e.target.value)}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        <div style={{ minWidth: 220 }}>
          <label style={fieldLabel}>Agent</label>
          <AgentTypeahead
            valueField="id"
            value={agentFilter}
            onChange={(v, opt) => {
              setAgentFilter(v)
              setAgentFilterLabel(opt ? `${opt.firstName} ${opt.lastName}` : '')
            }}
            includeFormer
            placeholder="All agents (type to search)"
          />
        </div>
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Type</label>
          <select style={inputStyle} value={policyTypeFilter} onChange={e => setPolicyTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(POLICY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={fieldLabel}>Carrier</label>
          <input style={inputStyle} value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)} placeholder="Corebridge..." />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={fieldLabel}>Search (client / policy #)</label>
          <input style={inputStyle} value={search} onChange={e => setSearch(e.target.value)} placeholder="Smith, ABC123..." />
        </div>
      </div>

      <div style={{ ...card, padding: '20px 24px' }}>
        {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
          list.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No submissions match.</div> :
          // 9-column table; on narrow viewports it has no chance of
          // fitting. Wrapping in an overflow:auto container lets it
          // horizontally scroll within the card instead of bleeding
          // out the right edge. The negative margin + matching padding
          // expands the scroll area to the card edges so the first
          // and last columns aren't clipped by the card padding.
          <div style={{ overflowX: 'auto', margin: '0 -24px', padding: '0 24px', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Agent', 'Client', 'Carrier', 'Type', 'Points', 'Status', 'Assigned', 'Submitted', 'Notes'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {list.map(s => {
                const isMine = !!selfId && s.assignedTo?.id === selfId
                const busy = busyAssignId === s.id
                // Claim is only meaningful while the submission is still
                // PENDING. Once it's ISSUED/DECLINED/etc the work is
                // done; show the historical assignee for reference but
                // hide the buttons.
                const canClaim = s.status === 'PENDING'
                return (
                  <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>
                      {s.agentProfile.firstName} {s.agentProfile.lastName}
                      {s.splitWithAgent && (
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                          Split: {s.splitWithAgent.firstName} {s.splitWithAgent.lastName}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#fff' }}>{s.clientFirstName} {s.clientLastName}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{s.carrier}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{POLICY_LABEL[s.policyType] ?? s.policyType}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#C9A96E' }}>
                      {s.points != null ? (s.splitWithAgent ? (s.points / 2) : s.points) : '—'}
                      {s.splitWithAgent && s.points != null && (
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>of {s.points} (split)</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11 }}><StatusPill status={s.status} /></td>
                    <td style={{ padding: '10px 12px', fontSize: 11 }}>
                      {s.assignedTo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                            background: isMine ? 'rgba(155,109,255,0.15)' : 'rgba(201,169,110,0.10)',
                            border: `1px solid ${isMine ? 'rgba(155,109,255,0.35)' : 'rgba(201,169,110,0.25)'}`,
                            color: isMine ? '#9B6DFF' : '#C9A96E',
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                          }}>
                            {isMine ? 'You' : s.assignedTo.name}
                          </span>
                          {canClaim && (
                            <button
                              onClick={e => setAssignee(e, s.id, null)}
                              disabled={busy}
                              title="Unassign"
                              style={{ background: 'transparent', border: 'none', color: '#6B8299', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                            >×</button>
                          )}
                        </div>
                      ) : canClaim ? (
                        <button
                          onClick={e => selfId ? setAssignee(e, s.id, selfId) : null}
                          disabled={busy || !selfId}
                          style={{
                            background: 'rgba(201,169,110,0.10)', border: '1px solid rgba(201,169,110,0.35)',
                            color: '#C9A96E', borderRadius: 4, padding: '4px 10px',
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            cursor: busy || !selfId ? 'wait' : 'pointer',
                          }}
                        >
                          {busy ? '...' : 'Assign to me'}
                        </button>
                      ) : (
                        <span style={{ color: '#4B5563' }}>&mdash;</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#6B8299' }}>{s._count.notes}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        }
      </div>

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '0 4px' }}>
          <span style={{ fontSize: 12, color: '#6B8299' }}>
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)', color: '#C9A96E', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
            >← Prev</button>
            <span style={{ fontSize: 12, color: '#9BB0C4', alignSelf: 'center' }}>Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
            <button
              onClick={() => setPage(p => Math.min(Math.ceil(total / PAGE_SIZE), p + 1))}
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)', color: '#C9A96E', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: page >= Math.ceil(total / PAGE_SIZE) ? 'default' : 'pointer', opacity: page >= Math.ceil(total / PAGE_SIZE) ? 0.4 : 1 }}
            >Next →</button>
          </div>
        </div>
      )}

      {openId && <SubmissionDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  )
}

// "Find duplicates" sweep: lists same-writer/same-client/same-type
// submission pairs that share a fuzzy-matched carrier and applied
// within a 60-day window. Each pair has a confidence rating ("high"
// = matching policy number OR exactly-one-side-has-Tevah-id, the
// manual + Tevah pattern). The admin can merge individual pairs or
// bulk-merge all high-confidence ones. Merge mechanics live in
// src/lib/submission-merge.ts and run inside one transaction.
interface DuplicatesPair {
  keepId: string
  mergeId: string
  agentProfileId: string
  confidence: 'high' | 'medium' | 'low' | 'distinct'
  reason: string
  keep: PairSide
  merge: PairSide
  agent: { firstName: string; lastName: string; agentCode: string } | null
}
interface PairSide {
  id: string
  clientFirstName: string
  clientLastName: string
  carrier: string
  policyType: string
  status: string
  points: number | null
  policyNumber: string | null
  applicationDate: string
  createdAt: string
  tevahClientId: number | null
  notesCount: number
}

function DuplicatesModal({ onClose, onMerged }: { onClose: () => void; onMerged: () => void }) {
  const [pairs, setPairs] = useState<DuplicatesPair[] | null>(null)
  const [summary, setSummary] = useState<{ total: number; high: number; medium: number; low: number; distinct: number } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const showFlash = (kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text })
    setTimeout(() => setFlash(null), 3000)
  }

  const load = useCallback(async () => {
    setPairs(null)
    const res = await fetch('/api/admin/new-business/duplicates')
    if (!res.ok) { setPairs([]); return }
    const d = await res.json() as { pairs: DuplicatesPair[]; summary: typeof summary }
    setPairs(d.pairs)
    setSummary(d.summary)
  }, [])
  useEffect(() => { load() }, [load])

  const mergeOne = async (p: DuplicatesPair) => {
    // Distinct policy numbers means the carrier issued two separate
    // policies. Make the LC explicitly confirm they are NOT two real
    // policies before deleting one (which would undercount production).
    const distinctWarning = p.confidence === 'distinct'
      ? `\n\n⚠ THESE HAVE DIFFERENT POLICY NUMBERS (${p.keep.policyNumber} vs ${p.merge.policyNumber}). The carrier treats these as TWO SEPARATE POLICIES. Only merge if you have confirmed they are genuinely the same policy (e.g. a re-key). Merging deletes one and will undercount the agent's production.\n`
      : ''
    if (!confirm(`Merge these two submissions?${distinctWarning}\n\nKeeper (older): ${p.keep.clientFirstName} ${p.keep.clientLastName} · ${p.keep.carrier} · ${p.keep.policyType} · ${p.keep.status}\nMerged in (newer): ${p.merge.status}\n\n${p.merge.notesCount} note(s)${p.merge.policyNumber ? ', policy #' + p.merge.policyNumber : ''} will move to the keeper. The merged row is deleted.`)) return
    setBusyId(p.mergeId)
    try {
      const res = await fetch('/api/admin/new-business/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: p.keepId, mergeId: p.mergeId }),
      })
      if (res.ok) { showFlash('ok', 'Merged.'); await load(); onMerged() }
      else {
        const d = await res.json().catch(() => ({}))
        showFlash('err', d.error ?? 'Merge failed.')
      }
    } finally { setBusyId(null) }
  }

  const mergeAllHighConfidence = async () => {
    const targets = (pairs ?? []).filter(p => p.confidence === 'high')
    if (targets.length === 0) return
    if (!confirm(`Merge all ${targets.length} high-confidence pairs?\n\nThis is destructive: each newer row is deleted after its data and notes move to the older row. Cannot be undone.`)) return
    setBulkBusy(true)
    let ok = 0, fail = 0
    try {
      for (const p of targets) {
        const res = await fetch('/api/admin/new-business/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepId: p.keepId, mergeId: p.mergeId }),
        })
        if (res.ok) ok += 1
        else fail += 1
      }
      showFlash(fail === 0 ? 'ok' : 'err', `${ok} merged${fail > 0 ? `, ${fail} failed` : ''}.`)
      await load()
      onMerged()
    } finally { setBulkBusy(false) }
  }

  const fmt = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 980, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#0F1E33', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 8 }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>Find duplicates</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B8299', lineHeight: 1.5 }}>
              Same writer + client + product, carrier-fuzzy match, applied within 60 days. Keeper is the older row; the newer row&apos;s notes and Tevah fields move to the keeper.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9BB0C4', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {flash && (
          <div style={{
            margin: '10px 22px 0', padding: '10px 14px', borderRadius: 6, fontSize: 12,
            background: flash.kind === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
            border: `1px solid ${flash.kind === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
            color: flash.kind === 'ok' ? '#86efac' : '#fca5a5',
          }}>{flash.text}</div>
        )}

        {summary && (
          <div style={{ padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#9BB0C4', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span><strong style={{ color: '#fff' }}>{summary.total}</strong> candidate pair{summary.total === 1 ? '' : 's'}</span>
            <span style={{ color: '#4ade80' }}><strong>{summary.high}</strong> high</span>
            <span style={{ color: '#fbbf24' }}><strong>{summary.medium}</strong> medium</span>
            <span style={{ color: '#9BB0C4' }}><strong>{summary.low}</strong> low</span>
            {summary.distinct > 0 && <span style={{ color: '#60a5fa' }}><strong>{summary.distinct}</strong> distinct policy #s</span>}
            {summary.high > 0 && (
              <button
                onClick={mergeAllHighConfidence}
                disabled={bulkBusy}
                style={{ marginLeft: 'auto', background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: bulkBusy ? 'wait' : 'pointer' }}
              >
                {bulkBusy ? 'Merging...' : `Merge all ${summary.high} high-confidence`}
              </button>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px' }}>
          {pairs === null ? (
            <div style={{ color: '#6B8299', fontSize: 13 }}>Scanning...</div>
          ) : pairs.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No duplicate candidates found. Inbound dedup is working.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pairs.map(p => {
                const pillColor = p.confidence === 'high' ? '#4ade80' : p.confidence === 'medium' ? '#fbbf24' : p.confidence === 'distinct' ? '#60a5fa' : '#9BB0C4'
                return (
                  <div key={`${p.keepId}-${p.mergeId}`} style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: pillColor, border: `1px solid ${pillColor}55`, background: `${pillColor}1a`, borderRadius: 3, padding: '2px 8px' }}>
                        {p.confidence}
                      </span>
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
                        {p.keep.clientFirstName} {p.keep.clientLastName} · {p.keep.policyType}
                      </span>
                      {p.agent && (
                        <span style={{ fontSize: 11, color: '#6B8299' }}>· {p.agent.firstName} {p.agent.lastName} ({p.agent.agentCode})</span>
                      )}
                      <span style={{ fontSize: 11, color: '#6B8299', marginLeft: 'auto' }}>{p.reason}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                      <PairCard label="Keeper (older)" side={p.keep} fmt={fmt} highlight />
                      <PairCard label="Merged in (newer)" side={p.merge} fmt={fmt} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        onClick={() => mergeOne(p)}
                        disabled={busyId === p.mergeId || bulkBusy}
                        style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: busyId === p.mergeId ? 'wait' : 'pointer' }}
                      >
                        {busyId === p.mergeId ? 'Merging...' : 'Merge this pair'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PairCard({ label, side, fmt, highlight }: { label: string; side: PairSide; fmt: (s: string) => string; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? 'rgba(201,169,110,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${highlight ? 'rgba(201,169,110,0.25)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 4, padding: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: highlight ? '#C9A96E' : '#6B8299', marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 12, marginBottom: 4 }}>{side.carrier} · {side.status}</div>
      <div style={{ color: '#9BB0C4', fontSize: 11, lineHeight: 1.6 }}>
        <div>Applied: {fmt(side.applicationDate)} · Submitted: {fmt(side.createdAt)}</div>
        <div>Points: {side.points ?? '—'} {side.policyNumber ? `· Policy # ${side.policyNumber}` : ''}</div>
        <div>{side.notesCount} note{side.notesCount === 1 ? '' : 's'} {side.tevahClientId != null ? '· Tevah ✓' : '· no Tevah'}</div>
      </div>
    </div>
  )
}

function KpiCard({
  label, value, accent, active, onClick, hint,
}: {
  label: string
  value: number | string
  accent: string
  active?: boolean
  onClick?: () => void
  // One-liner that explains what the count actually represents and
  // what action it implies. Visible by default beneath the value so
  // the LC never sees a number without knowing what to do about it.
  hint?: string
}) {
  const interactive = !!onClick
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      style={{
        ...card,
        padding: '16px 18px',
        textAlign: 'left',
        cursor: interactive ? 'pointer' : 'default',
        background: active ? `${accent}1A` : card.background,
        border: active
          ? `1px solid ${accent}`
          : `1px solid ${interactive ? 'rgba(201,169,110,0.18)' : 'rgba(201,169,110,0.1)'}`,
        boxShadow: active ? `0 0 0 1px ${accent}55` : 'none',
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: active ? accent : '#6B8299', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 300, color: accent, letterSpacing: '-0.02em' }}>{value}</div>
      {hint && (
        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </button>
  )
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.35)',
      fontSize: 11, fontWeight: 600, color: '#C5B4FF',
    }}>
      {label}
      <button
        onClick={onClear}
        style={{ background: 'transparent', border: 'none', color: '#C5B4FF', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
        aria-label={`Clear ${label}`}
      >×</button>
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.PENDING
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {STATUS_LABEL[status] ?? status.replace('_', ' ')}
    </span>
  )
}

function SubmissionDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [editStatus, setEditStatus] = useState<string>('')
  const [issuedDate, setIssuedDate] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [declinedReason, setDeclinedReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [tevahVerified, setTevahVerified] = useState(false)
  const [posting, setPosting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [editCarrier, setEditCarrier] = useState('')
  const [editPolicyType, setEditPolicyType] = useState('')
  const [editPoints, setEditPoints] = useState('')
  const [editAppDate, setEditAppDate] = useState('')
  const [editClientPhone, setEditClientPhone] = useState('')
  const [editClientEmail, setEditClientEmail] = useState('')
  const [editClientBirthday, setEditClientBirthday] = useState('')
  const [editAddressLine1, setEditAddressLine1] = useState('')
  const [editAddressLine2, setEditAddressLine2] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editState, setEditState] = useState('')
  const [editZip, setEditZip] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsSaved, setDetailsSaved] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Hard-delete the submission. Used for accidental duplicate
  // submissions (an agent clicks Submit twice and a dup row lands in
  // the queue). Double-confirms because all attached notes,
  // illustrations, and renewal reminders cascade away with it.
  const handleDelete = async () => {
    if (!detail) return
    const name = `${detail.clientFirstName} ${detail.clientLastName}`.trim() || 'this submission'
    const ok = window.confirm(
      `Delete ${name}'s ${detail.carrier} ${detail.policyType} submission?\n\nThis removes all notes, illustrations, and renewal reminders attached to it. Cannot be undone.`,
    )
    if (!ok) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/vault/new-business/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(`Delete failed: ${data.error ?? `HTTP ${res.status}`}`)
        return
      }
      onChanged()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const load = useCallback(() => {
    fetch(`/api/vault/new-business/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { submission: SubmissionDetail } | null) => {
        if (!d) return
        setDetail(d.submission)
        setEditStatus(d.submission.status)
        setIssuedDate(d.submission.issuedDate ? d.submission.issuedDate.slice(0, 10) : '')
        setPolicyNumber(d.submission.policyNumber ?? '')
        setDeclinedReason(d.submission.declinedReason ?? '')
        setEditCarrier(d.submission.carrier ?? '')
        setEditPolicyType(d.submission.policyType ?? '')
        setEditPoints(d.submission.points != null ? String(d.submission.points) : '')
        setEditAppDate(d.submission.applicationDate ? d.submission.applicationDate.slice(0, 10) : '')
        setEditClientPhone(d.submission.clientPhone ?? '')
        setEditClientEmail(d.submission.clientEmail ?? '')
        setEditClientBirthday(d.submission.clientBirthday ? d.submission.clientBirthday.slice(0, 10) : '')
        setEditAddressLine1(d.submission.clientAddressLine1 ?? '')
        setEditAddressLine2(d.submission.clientAddressLine2 ?? '')
        setEditCity(d.submission.clientCity ?? '')
        setEditState(d.submission.clientState ?? '')
        setEditZip(d.submission.clientZip ?? '')
      })
  }, [id])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/vault/new-business/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          issuedDate: issuedDate || null,
          policyNumber: policyNumber || null,
          declinedReason: declinedReason || null,
        }),
      })
      if (res.ok) {
        load()
        onChanged()
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setSaveError(d.error ?? 'Save failed')
      }
    } catch {
      setSaveError('Save failed — check your connection')
    } finally { setSaving(false) }
  }

  const saveDetails = async () => {
    if (!detail) return
    setSavingDetails(true)
    setDetailsError(null)

    const changes: { field: string; from: string; to: string }[] = []
    const patch: Record<string, unknown> = {}

    const check = (field: string, label: string, oldVal: string | null, newVal: string) => {
      const o = oldVal ?? ''
      if (o !== newVal) {
        changes.push({ field: label, from: o || '(empty)', to: newVal || '(empty)' })
        patch[field] = newVal || null
      }
    }

    check('carrier', 'Carrier', detail.carrier, editCarrier)
    if (editPolicyType !== detail.policyType) {
      changes.push({ field: 'Policy Type', from: POLICY_LABEL[detail.policyType] ?? detail.policyType, to: POLICY_LABEL[editPolicyType] ?? editPolicyType })
      patch.policyType = editPolicyType
    }
    const oldPts = detail.points != null ? String(detail.points) : ''
    if (editPoints !== oldPts) {
      changes.push({ field: 'Points', from: oldPts || '(empty)', to: editPoints || '(empty)' })
      patch.points = editPoints ? Number(editPoints) : null
    }
    const oldAppDate = detail.applicationDate ? detail.applicationDate.slice(0, 10) : ''
    if (editAppDate !== oldAppDate) {
      changes.push({ field: 'Application Date', from: oldAppDate || '(empty)', to: editAppDate || '(empty)' })
      patch.applicationDate = editAppDate || null
    }
    check('clientPhone', 'Client Phone', detail.clientPhone, editClientPhone)
    check('clientEmail', 'Client Email', detail.clientEmail, editClientEmail)
    const oldBday = detail.clientBirthday ? detail.clientBirthday.slice(0, 10) : ''
    if (editClientBirthday !== oldBday) {
      changes.push({ field: 'Client Birthday', from: oldBday || '(empty)', to: editClientBirthday || '(empty)' })
      patch.clientBirthday = editClientBirthday || null
    }
    check('clientAddressLine1', 'Address Line 1', detail.clientAddressLine1, editAddressLine1)
    check('clientAddressLine2', 'Address Line 2', detail.clientAddressLine2, editAddressLine2)
    check('clientCity', 'City', detail.clientCity, editCity)
    check('clientState', 'State', detail.clientState, editState)
    check('clientZip', 'Zip', detail.clientZip, editZip)

    if (changes.length === 0) {
      setSavingDetails(false)
      return
    }

    try {
      const res = await fetch(`/api/vault/new-business/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setDetailsError(d.error ?? 'Save failed')
        return
      }

      const noteLines = changes.map(c => `${c.field}: ${c.from} → ${c.to}`)
      const noteBody = `Policy details updated:\n${noteLines.join('\n')}`
      await fetch(`/api/vault/new-business/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody }),
      }).catch(() => {})

      load()
      onChanged()
      setDetailsSaved(true)
      setTimeout(() => setDetailsSaved(false), 2000)
    } catch {
      setDetailsError('Save failed')
    } finally {
      setSavingDetails(false)
    }
  }

  // Structured SOP note. Requires Action Taken or Note (so an empty
  // submit doesn't post). If the LC changed the status in the composer,
  // PATCH the status FIRST (single status-change code path, keeps the
  // notifyIssued/notifyDeclined pipeline intact) so the auto-generated
  // licensing mirror note reflects the new status.
  const addNote = async () => {
    if (!actionTaken.trim() && !noteText.trim()) return
    setPosting(true)
    try {
      if (detail && editStatus && editStatus !== detail.status) {
        await fetch(`/api/vault/new-business/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: editStatus,
            issuedDate: issuedDate || null,
            policyNumber: policyNumber || null,
            declinedReason: declinedReason || null,
          }),
        })
      }
      const res = await fetch(`/api/vault/new-business/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionTaken: actionTaken.trim(),
          tevahVerified,
          note: noteText.trim(),
        }),
      })
      if (res.ok) {
        setNoteText(''); setActionTaken(''); setTevahVerified(false)
        load(); onChanged()
      }
    } finally { setPosting(false) }
  }

  if (!detail) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Drawer is a 3-row flex column: header (fixed), scrollable
          body, sticky composer at the bottom. Without this, growing
          notes pushed the composer off-screen and the LC had to
          scroll to find the input every time. Chat-room layout. */}
      <div onClick={e => e.stopPropagation()} style={{
        width: 600, maxWidth: '95vw', height: '100vh',
        background: '#0F1E33', borderLeft: '1px solid rgba(201,169,110,0.2)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '24px 24px 0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>{detail.clientFirstName} {detail.clientLastName}</h2>
            <StatusPill status={detail.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete this submission (cascades to notes, illustrations, reminders)"
              style={{
                background: 'transparent',
                border: '1px solid rgba(239,68,68,0.35)',
                color: deleting ? '#6B8299' : '#f87171',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '5px 10px',
                borderRadius: 4,
                cursor: deleting ? 'wait' : 'pointer',
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9BB0C4', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ marginBottom: 16, fontSize: 12, color: '#9BB0C4' }}>
          Agent: <span style={{ color: '#fff' }}>{detail.agentProfile.firstName} {detail.agentProfile.lastName}</span> · {detail.agentProfile.agentCode}
        </div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ ...sectionLabel, fontSize: 9 }}>Coordinator Updates</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={fieldLabel}>Status</label>
              <select style={inputStyle} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Issued Date</label>
              <DatePicker value={issuedDate} onChange={setIssuedDate} />
            </div>
            <div><label style={fieldLabel}>Policy Number</label><input style={inputStyle} value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} /></div>
            <div><label style={fieldLabel}>Declined Reason</label><input style={inputStyle} value={declinedReason} onChange={e => setDeclinedReason(e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: justSaved ? '#4ADE80' : '#C9A96E',
                color: '#142D48', border: 'none', borderRadius: 4,
                padding: '7px 14px', fontSize: 11, fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                transition: 'background 0.2s',
              }}
            >
              {saving ? 'Saving...' : justSaved ? '✓ Saved' : 'Save Changes'}
            </button>
            {justSaved && (
              <span style={{ fontSize: 11, color: '#4ADE80', fontWeight: 600 }}>
                {editStatus === 'ISSUED'
                  ? 'Marked issued — agent has been notified.'
                  : editStatus === 'DECLINED'
                  ? 'Marked declined — agent has been DM’d.'
                  : 'Updated.'}
              </span>
            )}
            {saveError && (
              <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>{saveError}</span>
            )}
          </div>
        </div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ ...sectionLabel, fontSize: 9 }}>Policy Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={fieldLabel}>Carrier</label><input style={inputStyle} value={editCarrier} onChange={e => setEditCarrier(e.target.value)} /></div>
            <div><label style={fieldLabel}>Policy Type</label>
              <select style={inputStyle} value={editPolicyType} onChange={e => setEditPolicyType(e.target.value)}>
                {Object.entries(POLICY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Points</label><input style={inputStyle} type="number" step="any" value={editPoints} onChange={e => setEditPoints(e.target.value)} /></div>
            <div><label style={fieldLabel}>Application Date</label><DatePicker value={editAppDate} onChange={setEditAppDate} /></div>
          </div>
          {detail.splitWithAgent && (
            <div style={{ display: 'flex', padding: '8px 0 0', fontSize: 12 }}>
              <div style={{ width: 150, color: '#6B8299' }}>Split With</div>
              <div style={{ color: '#E5E7EB', flex: 1 }}>{detail.splitWithAgent.firstName} {detail.splitWithAgent.lastName}</div>
            </div>
          )}

          <div style={{ ...sectionLabel, fontSize: 9, marginTop: 16 }}>Client Info</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={editClientPhone} onChange={e => setEditClientPhone(e.target.value)} placeholder="(555) 555-5555" /></div>
            <div><label style={fieldLabel}>Email</label><input style={inputStyle} type="email" value={editClientEmail} onChange={e => setEditClientEmail(e.target.value)} /></div>
            <div><label style={fieldLabel}>Birthday</label><DatePicker value={editClientBirthday} onChange={setEditClientBirthday} /></div>
          </div>

          <div style={{ ...sectionLabel, fontSize: 9, marginTop: 16 }}>Address</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            <div><label style={fieldLabel}>Line 1</label><input style={inputStyle} value={editAddressLine1} onChange={e => setEditAddressLine1(e.target.value)} /></div>
            <div><label style={fieldLabel}>Line 2</label><input style={inputStyle} value={editAddressLine2} onChange={e => setEditAddressLine2(e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
              <div><label style={fieldLabel}>City</label><input style={inputStyle} value={editCity} onChange={e => setEditCity(e.target.value)} /></div>
              <div><label style={fieldLabel}>State</label><input style={inputStyle} value={editState} onChange={e => setEditState(e.target.value)} maxLength={2} /></div>
              <div><label style={fieldLabel}>Zip</label><input style={inputStyle} value={editZip} onChange={e => setEditZip(e.target.value)} /></div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={saveDetails}
              disabled={savingDetails}
              style={{
                background: detailsSaved ? '#4ADE80' : '#C9A96E',
                color: '#142D48', border: 'none', borderRadius: 4,
                padding: '7px 14px', fontSize: 11, fontWeight: 700,
                cursor: savingDetails ? 'wait' : 'pointer', opacity: savingDetails ? 0.7 : 1,
                transition: 'background 0.2s',
              }}
            >
              {savingDetails ? 'Saving...' : detailsSaved ? '✓ Saved' : 'Save Details'}
            </button>
            {detailsSaved && (
              <span style={{ fontSize: 11, color: '#4ADE80', fontWeight: 600 }}>Changes saved and logged.</span>
            )}
            {detailsError && (
              <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>{detailsError}</span>
            )}
          </div>
        </div>

        {detail.illustrationUrls.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...sectionLabel, fontSize: 9 }}>Illustrations</div>
            {detail.illustrationUrls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: '#C9A96E', fontSize: 12, marginBottom: 4 }}>
                Illustration {i + 1} ↗
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div style={{ ...sectionLabel, fontSize: 9 }}>Notes (visible to agent)</div>
          <div style={{ marginBottom: 12 }}>
            {detail.notes.length === 0 && <div style={{ color: '#4B5563', fontSize: 12 }}>No notes yet.</div>}
            {detail.notes.map(n => {
              // Color by ROLE on this policy. Writer = sky, split =
              // pink, admin = purple. Fixed assignments mean the
              // colors never collide regardless of who's posting.
              const isAdmin = n.authorType === 'ADMIN'
              const isWriter = !isAdmin && n.authorAgent?.id === detail.agentProfile.id
              const isSplit  = !isAdmin && n.authorAgent?.id != null && n.authorAgent.id === detail.splitWithAgent?.id
              const accent = isAdmin ? '#9B6DFF' : isWriter ? '#60A5FA' : isSplit ? '#F472B6' : '#4ADE80'
              return (
                <div key={n.id} style={{
                  padding: '10px 12px',
                  background: `${accent}0E`,
                  borderRadius: 4, marginBottom: 6,
                  borderLeft: `3px solid ${accent}`,
                }}>
                  <div style={{ fontSize: 10, color: accent, fontWeight: 700, marginBottom: 4 }}>
                    {isAdmin ? `Coordinator: ${n.authorAdmin?.name ?? 'Admin'}` : `${n.authorAgent?.firstName ?? 'Agent'} ${n.authorAgent?.lastName ?? ''}`}
                    <span style={{ color: '#6B8299', fontWeight: 400, marginLeft: 8 }}>{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ color: '#E5E7EB', fontSize: 12, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {/* Composer pinned to the bottom of the drawer (chat-room
          style) so it stays in place no matter how many notes
          accumulate. The body above scrolls; this row doesn't. */}
      <div style={{
        flexShrink: 0,
        padding: '12px 24px 16px',
        borderTop: '1px solid rgba(201,169,110,0.15)',
        background: '#0A1628',
      }}>
        {/* Structured New Business note (LC SOP). Status + Action Taken
            + Verified through Tevah + Note. On save, the agent's
            licensing record gets the standardized one-liner
            automatically (NEW BUSINESS SUBMITTED / NOTE). */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 10, color: '#6B8299', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</label>
          <select
            value={editStatus}
            onChange={e => setEditStatus(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '5px 8px', flex: '0 0 auto' }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={tevahVerified} onChange={e => setTevahVerified(e.target.checked)} />
            Verified through Tevah
          </label>
        </div>
        <input
          value={actionTaken}
          onChange={e => setActionTaken(e.target.value)}
          placeholder="Action Taken (e.g. Called Ethos, confirmed issued)"
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Note (visible to the agent)"
          style={{ ...inputStyle, height: 56, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <span style={{ fontSize: 10, color: '#6B8299' }}>
            Posting also logs a standardized note on the agent&apos;s licensing record.
          </span>
          <button onClick={addNote} disabled={posting || (!actionTaken.trim() && !noteText.trim())} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: posting ? 'wait' : 'pointer', opacity: posting || (!actionTaken.trim() && !noteText.trim()) ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {posting ? 'Posting...' : 'Add Note'}
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
      <div style={{ width: 150, color: '#6B8299' }}>{k}</div>
      <div style={{ color: '#E5E7EB', flex: 1 }}>{v}</div>
    </div>
  )
}
