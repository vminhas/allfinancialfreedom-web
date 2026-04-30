'use client'

import { useEffect, useState, useCallback } from 'react'

const card = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14 }

const POLICY_LABEL: Record<string, string> = {
  TERM: 'Term', WHOLE_LIFE: 'Whole Life', IUL: 'IUL', ANNUITY: 'Annuity',
  DISABILITY: 'Disability', LTC: 'LTC', OTHER: 'Other',
}

type Stage = 'SIXTY_DAYS' | 'THIRTY_DAYS' | 'SEVEN_DAYS'

interface Reminder {
  id: string
  stage: Stage
  anniversaryYear: number
  sentAt: string
  sentBy: { name: string } | null
}
interface Row {
  id: string
  clientFirstName: string
  clientLastName: string
  clientBirthday: string | null
  clientCity: string | null
  clientState: string | null
  clientEmail: string | null
  clientPhone: string | null
  carrier: string
  policyType: string
  policyNumber: string | null
  issuedDate: string | null
  points: number | null
  agentProfile: { firstName: string; lastName: string; agentCode: string }
  daysUntilAnniversary: number
  currentStage: Stage | null
  anniversaryYear: number
  remindersThisYear: Reminder[]
  allReminders: Reminder[]
}

type SortKey = 'anniversary' | 'issued_newest' | 'issued_oldest' | 'client'

const STAGE_META: Record<Stage, { label: string; accent: string; bg: string }> = {
  SEVEN_DAYS:  { label: '7 days or less', accent: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
  THIRTY_DAYS: { label: '8–30 days',      accent: '#C9A96E', bg: 'rgba(201,169,110,0.10)' },
  SIXTY_DAYS:  { label: '31–60 days',     accent: '#9B6DFF', bg: 'rgba(155,109,255,0.10)' },
}

export default function VaultRenewalsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})
  // Filters for the "All policies" section below the urgent buckets.
  // Defaults to soonest-anniversary first so the same urgency cue
  // exists even when the user hasn't picked a sort yet.
  const [search, setSearch] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [carrierFilter, setCarrierFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('anniversary')

  const refresh = useCallback(() => {
    fetch('/api/vault/renewals')
      .then(r => r.ok ? r.json() : { submissions: [] })
      .then((d: { submissions: Row[] }) => { setRows(d.submissions ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const sendReminder = async (row: Row) => {
    if (!row.currentStage) return
    setBusyId(row.id)
    setErrorById(prev => { const next = { ...prev }; delete next[row.id]; return next })
    try {
      const res = await fetch(`/api/vault/renewals/${row.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: row.currentStage }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setErrorById(prev => ({ ...prev, [row.id]: d.error ?? 'Send failed' }))
      } else {
        refresh()
      }
    } catch {
      setErrorById(prev => ({ ...prev, [row.id]: 'Network error — try again' }))
    } finally {
      setBusyId(null)
    }
  }

  // Bucket rows by their currentStage. Rows with no active stage drop out of
  // the urgent sections — but their reminder history shows in "Recently sent".
  const bySeven = rows.filter(r => r.currentStage === 'SEVEN_DAYS')
  const byThirty = rows.filter(r => r.currentStage === 'THIRTY_DAYS')
  const bySixty = rows.filter(r => r.currentStage === 'SIXTY_DAYS')

  // Recently sent — flatten reminders across all rows, take the 14-day window.
  const fourteenDaysAgo = Date.now() - 14 * 86400000
  const recentlySent = rows
    .flatMap(r => r.allReminders.map(rem => ({
      reminder: rem,
      clientName: `${r.clientFirstName} ${r.clientLastName}`,
      agentName: `${r.agentProfile.firstName} ${r.agentProfile.lastName}`,
    })))
    .filter(x => new Date(x.reminder.sentAt).getTime() >= fourteenDaysAgo)
    .sort((a, b) => new Date(b.reminder.sentAt).getTime() - new Date(a.reminder.sentAt).getTime())

  // Distinct dropdowns for the "All policies" filters. Sorted alphabetic.
  const distinctAgents = Array.from(new Map(
    rows.map(r => [r.agentProfile.agentCode, r.agentProfile])
  ).values()).sort((a, b) => a.firstName.localeCompare(b.firstName))
  const distinctCarriers = Array.from(new Set(rows.map(r => r.carrier))).sort()

  // The "All policies" list applies the search/filter/sort controls.
  // Search is a case-insensitive contains across client name, agent name,
  // policy number, city, and state so the LC can paste in whatever they
  // remember about the client.
  const q = search.trim().toLowerCase()
  const allFiltered = rows
    .filter(r => !agentFilter || r.agentProfile.agentCode === agentFilter)
    .filter(r => !carrierFilter || r.carrier === carrierFilter)
    .filter(r => {
      if (!q) return true
      const hay = [
        r.clientFirstName, r.clientLastName,
        r.agentProfile.firstName, r.agentProfile.lastName,
        r.policyNumber, r.clientCity, r.clientState,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => {
      switch (sortKey) {
        case 'issued_newest': {
          const at = a.issuedDate ? new Date(a.issuedDate).getTime() : 0
          const bt = b.issuedDate ? new Date(b.issuedDate).getTime() : 0
          return bt - at
        }
        case 'issued_oldest': {
          const at = a.issuedDate ? new Date(a.issuedDate).getTime() : Infinity
          const bt = b.issuedDate ? new Date(b.issuedDate).getTime() : Infinity
          return at - bt
        }
        case 'client':
          return `${a.clientLastName} ${a.clientFirstName}`.localeCompare(`${b.clientLastName} ${b.clientFirstName}`)
        case 'anniversary':
        default:
          return a.daysUntilAnniversary - b.daysUntilAnniversary
      }
    })

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={sectionLabel}>Licensing Coordinator</div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Renewals
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
          Upcoming anniversary windows are pinned at the top. Below that, every issued policy lives in <strong>All Policies</strong> with search and sort, so you can scan VIP clients, find anyone by city or carrier, or pull a list of who to send birthday cards to.
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          <Section stage="SEVEN_DAYS"  rows={bySeven}  busyId={busyId} errorById={errorById} onSend={sendReminder} />
          <Section stage="THIRTY_DAYS" rows={byThirty} busyId={busyId} errorById={errorById} onSend={sendReminder} />
          <Section stage="SIXTY_DAYS"  rows={bySixty}  busyId={busyId} errorById={errorById} onSend={sendReminder} />

          {/* Recently sent collapsed list */}
          <div style={{ marginTop: 28 }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Recently sent · last 14 days · {recentlySent.length}</div>
            {recentlySent.length === 0 ? (
              <div style={{ color: '#4B5563', fontSize: 12 }}>None yet.</div>
            ) : (
              <div style={{ ...card, padding: '14px 18px' }}>
                {recentlySent.slice(0, 30).map(({ reminder, clientName, agentName }) => (
                  <div key={reminder.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ color: '#fff' }}>
                      {clientName} <span style={{ color: '#9BB0C4' }}>· agent {agentName}</span>
                    </span>
                    <span style={{ color: '#6B8299' }}>
                      {STAGE_META[reminder.stage].label} · {new Date(reminder.sentAt).toLocaleDateString()}
                      {reminder.sentBy && ` · ${reminder.sentBy.name}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All policies — every issued policy, with search/sort/filter */}
          <div style={{ marginTop: 32 }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>All Policies &middot; {allFiltered.length} of {rows.length}</div>

            {/* Filter bar. Search is liberal: client/agent name, city, state, */}
            {/* policy number all match. Sort defaults to soonest anniversary. */}
            <div style={{ ...card, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>Search</label>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Client, agent, city, policy #..."
                  style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>Agent</label>
                <select
                  value={agentFilter}
                  onChange={e => setAgentFilter(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit' }}
                >
                  <option value="">All agents</option>
                  {distinctAgents.map(a => (
                    <option key={a.agentCode} value={a.agentCode}>{a.firstName} {a.lastName}</option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 160 }}>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>Carrier</label>
                <select
                  value={carrierFilter}
                  onChange={e => setCarrierFilter(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit' }}
                >
                  <option value="">All carriers</option>
                  {distinctCarriers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>Sort by</label>
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit' }}
                >
                  <option value="anniversary">Soonest anniversary</option>
                  <option value="issued_newest">Newest policy first</option>
                  <option value="issued_oldest">Longest-tenured client</option>
                  <option value="client">Client name (A-Z)</option>
                </select>
              </div>
            </div>

            {allFiltered.length === 0 ? (
              <div style={{ color: '#4B5563', fontSize: 12, padding: '20px 0' }}>No policies match these filters.</div>
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                        {['Client', 'Agent', 'Carrier · Type', 'Issued', 'Anniversary', 'Birthday'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allFiltered.map(r => {
                        const stageMeta = r.currentStage ? STAGE_META[r.currentStage] : null
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px 14px', fontSize: 12 }}>
                              <div style={{ color: '#fff', fontWeight: 500 }}>
                                {r.clientFirstName} {r.clientLastName}
                              </div>
                              {(r.clientCity || r.clientState) && (
                                <div style={{ color: '#6B8299', fontSize: 10, marginTop: 2 }}>
                                  {[r.clientCity, r.clientState].filter(Boolean).join(', ')}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>
                              {r.agentProfile.firstName} {r.agentProfile.lastName}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>
                              {r.carrier} &middot; {POLICY_LABEL[r.policyType] ?? r.policyType}
                              {r.policyNumber && <span style={{ color: '#6B8299' }}> &middot; {r.policyNumber}</span>}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>
                              {r.issuedDate ? new Date(r.issuedDate).toLocaleDateString() : '—'}
                              {r.issuedDate && (
                                <div style={{ color: '#6B8299', fontSize: 10, marginTop: 2 }}>
                                  {yearsSince(r.issuedDate)}y client
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12 }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                                background: stageMeta ? stageMeta.bg : 'rgba(255,255,255,0.04)',
                                color: stageMeta ? stageMeta.accent : '#9BB0C4',
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                              }}>
                                {r.daysUntilAnniversary === 0 ? 'Today' : `in ${r.daysUntilAnniversary}d`}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>
                              {r.clientBirthday ? formatBirthday(r.clientBirthday) : <span style={{ color: '#4B5563' }}>&mdash;</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// "3y" / "1y" / "<1y" — short, scannable tenure for the table cell.
function yearsSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const years = ms / (365.25 * 86400000)
  if (years < 1) return '<1'
  return String(Math.floor(years))
}

// Birthdays may not have a year stored cleanly, so display month/day
// only. The LC mostly cares about "when do I send a card" not age.
function formatBirthday(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Section({
  stage, rows, busyId, errorById, onSend,
}: {
  stage: Stage
  rows: Row[]
  busyId: string | null
  errorById: Record<string, string>
  onSend: (r: Row) => void
}) {
  const meta = STAGE_META[stage]
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ ...sectionLabel, color: meta.accent, marginBottom: 10 }}>
        {meta.label} · {rows.length}
      </div>
      {rows.length === 0 ? (
        <div style={{ color: '#4B5563', fontSize: 12 }}>None right now.</div>
      ) : (
        <div style={{ ...card, padding: '14px 18px' }}>
          {rows.map(r => {
            const alreadySent = r.remindersThisYear.find(rem => rem.stage === stage)
            const error = errorById[r.id]
            return (
              <div key={r.id} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 1.5fr) minmax(140px, 1fr) minmax(110px, auto) minmax(80px, auto) minmax(170px, auto)',
                alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}>
                <div>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>
                    {r.clientFirstName} {r.clientLastName}
                  </div>
                  <div style={{ color: '#9BB0C4', fontSize: 11, marginTop: 2 }}>
                    {r.carrier} · {POLICY_LABEL[r.policyType] ?? r.policyType}
                    {r.policyNumber && ` · ${r.policyNumber}`}
                  </div>
                </div>
                <div style={{ color: '#9BB0C4', fontSize: 12 }}>
                  Agent: <span style={{ color: '#fff' }}>{r.agentProfile.firstName} {r.agentProfile.lastName}</span>
                </div>
                <div>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                    background: meta.bg, color: meta.accent,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>
                    {r.daysUntilAnniversary === 0 ? 'Today' : `${r.daysUntilAnniversary} day${r.daysUntilAnniversary === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#6B8299' }}>
                  Anniv. {r.anniversaryYear}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  {alreadySent ? (
                    <span style={{
                      display: 'inline-block', padding: '4px 10px', borderRadius: 4,
                      background: 'rgba(74,222,128,0.12)', color: '#4ADE80',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>
                      ✓ Sent {new Date(alreadySent.sentAt).toLocaleDateString()}
                      {alreadySent.sentBy && ` · ${alreadySent.sentBy.name}`}
                    </span>
                  ) : (
                    <button
                      onClick={() => onSend(r)}
                      disabled={busyId === r.id}
                      style={{
                        background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4,
                        padding: '6px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                        cursor: busyId === r.id ? 'wait' : 'pointer', opacity: busyId === r.id ? 0.7 : 1,
                      }}
                    >
                      {busyId === r.id ? 'Sending...' : 'Send reminder'}
                    </button>
                  )}
                  {error && <span style={{ fontSize: 10, color: '#EF4444' }}>{error}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
