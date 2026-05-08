'use client'

import { useEffect, useMemo, useState } from 'react'

// Slide-in drawer that opens when an admin clicks a column header on
// the Progression Matrix. Shows two lists side-by-side:
//   - Completed (N) — agents who finished this item, with date.
//   - Not yet (M)  — agents who haven't, with checkboxes for selection.
// Footer button on the "Not yet" side fires a bulk-email reminder via
// /api/admin/progress-matrix/email-reminder. Email composer modal is
// rendered inline below the lists with a pre-filled template the admin
// can tweak before sending.

const PHASE_COLORS: Record<number, string> = {
  1: '#60a5fa', 2: '#4ade80', 3: '#C9A96E', 4: '#a78bfa', 5: '#f472b6',
}

interface AgentLite {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  email: string | null
  lastLoginAt: string | null
}

export interface SelectedItem {
  itemKey: string
  phase: number
  label: string
}

interface DrawerProps {
  selectedItem: SelectedItem
  agents: AgentLite[]
  // sparse map: `${agentId}:${itemKey}` → ISO timestamp (or '')
  completedAt: Record<string, string>
  onClose: () => void
}

// Pre-filled template. Admins can edit before sending. Placeholder
// substitution happens server-side, so leaving {{firstName}} etc. in
// here is exactly what we want.
const DEFAULT_SUBJECT = "Reminder: complete {{itemLabel}}"
const DEFAULT_BODY = `Hi {{firstName}},

Quick nudge: looks like you haven't completed **{{itemLabel}}** yet (Phase {{phase}}). Tonight's training covers it, so try to make it.

If you can't be there live, reply and let me know what's blocking and we'll figure it out.

See you tonight,
The All Financial Freedom Team`

export default function PhaseItemDrawer({ selectedItem, agents, completedAt, onClose }: DrawerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [composerOpen, setComposerOpen] = useState(false)
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [bodyText, setBodyText] = useState(DEFAULT_BODY)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Split agents into completed / pending. Sort completed by recency
  // (most-recent-first) so the admin can see who just did it; sort
  // pending by phase asc then last-login desc so the most-active
  // not-yet-completed agents float up.
  const { completed, pending } = useMemo(() => {
    const c: Array<AgentLite & { completedAt: string }> = []
    const p: AgentLite[] = []
    for (const a of agents) {
      const at = completedAt[`${a.id}:${selectedItem.itemKey}`]
      if (at) c.push({ ...a, completedAt: at })
      else p.push(a)
    }
    c.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
    p.sort((a, b) => {
      if (a.phase !== b.phase) return a.phase - b.phase
      const al = a.lastLoginAt ?? ''
      const bl = b.lastLoginAt ?? ''
      return bl.localeCompare(al)
    })
    return { completed: c, pending: p }
  }, [agents, completedAt, selectedItem.itemKey])

  // Default to all pending agents selected for the email blast. Admin
  // can untick anyone they want to skip (e.g. someone who's on PTO).
  useEffect(() => {
    setSelectedIds(new Set(pending.map(a => a.id)))
  }, [pending])

  const toggleAll = () => {
    if (selectedIds.size === pending.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(pending.map(a => a.id)))
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/progress-matrix/email-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: selectedItem.phase,
          itemKey: selectedItem.itemKey,
          agentProfileIds: Array.from(selectedIds),
          subject, body: bodyText,
        }),
      })
      const data = await res.json() as { sent?: number; failed?: number; skipped?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? `${res.status}`)
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, skipped: data.skipped ?? 0 })
      setComposerOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 40,
      }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(560px, 100vw)',
        background: '#0F2440', color: '#ffffff',
        borderLeft: '1px solid rgba(201,169,110,0.2)',
        boxShadow: '-12px 0 36px rgba(0,0,0,0.4)',
        zIndex: 41,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: PHASE_COLORS[selectedItem.phase] ?? '#C9A96E', marginBottom: 4 }}>
                Phase {selectedItem.phase}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 400, margin: 0, lineHeight: 1.2, color: '#ffffff' }}>
                {selectedItem.label}
              </h2>
              <p style={{ fontSize: 12, color: '#9BB0C4', margin: '6px 0 0' }}>
                <strong style={{ color: '#4ade80' }}>{completed.length}</strong> completed &middot;{' '}
                <strong style={{ color: '#f59e0b' }}>{pending.length}</strong> not yet &middot;{' '}
                {agents.length} total
              </p>
            </div>
            <button onClick={onClose} title="Close" style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9BB0C4', borderRadius: 4, padding: '4px 10px',
              cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0,
            }}>×</button>
          </div>
        </div>

        {result && (
          <div style={{
            padding: '10px 14px', margin: '12px 20px 0',
            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: 4, fontSize: 12, color: '#86efac',
          }}>
            Sent {result.sent} {result.sent === 1 ? 'email' : 'emails'}
            {result.failed > 0 && <>, <span style={{ color: '#fca5a5' }}>{result.failed} failed</span></>}
            {result.skipped > 0 && <>, <span style={{ color: '#9BB0C4' }}>{result.skipped} skipped (no email on file)</span></>}.
          </div>
        )}

        {error && (
          <div style={{
            padding: '10px 14px', margin: '12px 20px 0',
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 4, fontSize: 12, color: '#fca5a5',
          }}>
            {error}
          </div>
        )}

        {/* Content. Two scrollable sections + a sticky composer / footer. */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Pending list, the action-rich section, comes first */}
          <Section
            label={`Not yet (${pending.length})`}
            color="#f59e0b"
            actions={pending.length > 0 && (
              <button onClick={toggleAll} style={pillButton}>
                {selectedIds.size === pending.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          >
            {pending.length === 0 ? (
              <Empty>Everyone&apos;s done it.</Empty>
            ) : (
              <ul style={listStyle}>
                {pending.map(a => {
                  const checked = selectedIds.has(a.id)
                  const phaseColor = PHASE_COLORS[a.phase] ?? '#9BB0C4'
                  return (
                    <li key={a.id} style={{ ...rowStyle, opacity: checked ? 1 : 0.5 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(a.id)}
                        style={{ accentColor: '#C9A96E', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>
                          {a.firstName} {a.lastName}
                        </div>
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                          {a.agentCode} &middot; <span style={{ color: phaseColor }}>Phase {a.phase}</span>
                          {!a.email && <span style={{ color: '#f87171', marginLeft: 8 }}>· no email on file</span>}
                          {a.email && a.lastLoginAt && (
                            <span style={{ marginLeft: 8 }}>
                              · last seen {relTime(a.lastLoginAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* Completed list, just for visibility */}
          <Section label={`Completed (${completed.length})`} color="#4ade80">
            {completed.length === 0 ? (
              <Empty>Nobody yet.</Empty>
            ) : (
              <ul style={listStyle}>
                {completed.map(a => {
                  const phaseColor = PHASE_COLORS[a.phase] ?? '#9BB0C4'
                  return (
                    <li key={a.id} style={{ ...rowStyle, paddingLeft: 24 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#d1d9e2', fontWeight: 500 }}>
                          {a.firstName} {a.lastName}
                        </div>
                        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                          {a.agentCode} &middot; <span style={{ color: phaseColor }}>Phase {a.phase}</span>
                          {' · '}
                          <span style={{ color: '#4ade80' }}>completed {relTime(a.completedAt)}</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </div>

        {/* Composer: hidden by default, expands above the footer when
            "Send reminder email" is clicked. Pre-filled template;
            placeholder substitution happens server-side. */}
        {composerOpen && (
          <div style={{
            padding: '14px 20px',
            background: '#0A1628',
            borderTop: '1px solid rgba(201,169,110,0.15)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div>
              <label style={labelStyle}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Body</label>
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                rows={8}
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 120 }}
              />
              <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4 }}>
                Placeholders: <code>{'{{firstName}}'}</code> <code>{'{{lastName}}'}</code> <code>{'{{itemLabel}}'}</code> <code>{'{{phase}}'}</code> <code>{'{{agentCode}}'}</code>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          background: '#0A1628',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {composerOpen ? (
            <>
              <button
                onClick={() => setComposerOpen(false)}
                disabled={sending}
                style={ghostButton}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || selectedIds.size === 0 || !subject.trim() || !bodyText.trim()}
                style={primaryButton(sending || selectedIds.size === 0)}
              >
                {sending ? 'Sending...' : `Send to ${selectedIds.size} agent${selectedIds.size === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <button
              onClick={() => setComposerOpen(true)}
              disabled={selectedIds.size === 0}
              style={primaryButton(selectedIds.size === 0)}
              title={selectedIds.size === 0 ? 'Select at least one agent first' : undefined}
            >
              Email reminder to {selectedIds.size} agent{selectedIds.size === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Section({
  label, color, actions, children,
}: {
  label: string
  color: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color,
        }}>
          {label}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '14px', textAlign: 'center',
      background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.06)',
      borderRadius: 4, color: '#6B8299', fontSize: 12,
    }}>{children}</div>
  )
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms)) return ''
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return mins <= 0 ? 'just now' : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ─── Style constants ──────────────────────────────────────────────────

const listStyle: React.CSSProperties = {
  margin: 0, padding: 0, listStyle: 'none',
  display: 'flex', flexDirection: 'column', gap: 4,
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.04)',
  borderRadius: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'rgba(0,0,0,0.3)', color: '#ffffff', fontSize: 13,
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
  textTransform: 'uppercase', color: '#9BB0C4', marginBottom: 4,
}

const pillButton: React.CSSProperties = {
  background: 'transparent', color: '#C9A96E',
  border: '1px solid rgba(201,169,110,0.4)', borderRadius: 3,
  padding: '3px 9px', fontSize: 9, fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: 'pointer',
}

const ghostButton: React.CSSProperties = {
  background: 'transparent', color: '#9BB0C4',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
  padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? 'rgba(201,169,110,0.3)' : 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)',
  color: '#142D48', border: 'none', borderRadius: 4,
  padding: '8px 18px', fontSize: 12, fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,0.3)',
})
