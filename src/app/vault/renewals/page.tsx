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

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={sectionLabel}>Licensing Coordinator</div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Renewals
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
          Issued policies grouped by upcoming anniversary. Click <strong>Send reminder</strong> to DM the agent — each stage fires once per anniversary year.
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
        </>
      )}
    </div>
  )
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
