'use client'

import { useState, useEffect } from 'react'

interface ContactOption {
  id: string
  firstName: string
  lastName: string
  email: string
  licenseType?: string
  currentAgency?: string
  state?: string
  wornOut: boolean
  importJobId?: string
}

interface Draft {
  contactId: string
  firstName: string
  lastName: string
  subject: string
  body: string
  approved: boolean
  editing: boolean
  inputTokens?: number
  outputTokens?: number
}

export default function OutreachPage() {
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [context, setContext] = useState('')
  const [contextSource, setContextSource] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [advanceStage, setAdvanceStage] = useState(true)

  useEffect(() => {
    fetch('/api/admin/contacts?outreachStatus=pending&limit=200')
      .then(r => r.json())
      .then(async d => {
        const loaded = d.contacts ?? []
        setContacts(loaded)

        // Auto-fill context from import job if all contacts share one job
        const jobIds = [...new Set(loaded.map((c: ContactOption) => c.importJobId).filter(Boolean))]
        if (jobIds.length === 1) {
          const jobRes = await fetch(`/api/admin/import-job/${jobIds[0]}`)
          if (jobRes.ok) {
            const job = await jobRes.json()
            if (job.contextPrompt) {
              setContext(job.contextPrompt)
              setContextSource(job.fileName)
            }
          }
        }
      })
  }, [])

  const filteredContacts = filter === 'pending'
    ? contacts.filter(c => c)
    : contacts

  function toggleSelect(id: string) {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filteredContacts.map(c => c.id)))
  }

  function selectNone() { setSelected(new Set()) }

  async function handleDraft() {
    setDrafting(true)
    setSentCount(null)
    const toDraft = filteredContacts.filter(c => selected.has(c.id))
    const res = await fetch('/api/admin/draft-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, contacts: toDraft }),
    })
    const data = await res.json()
    setDrafts((data.drafts ?? []).map((d: Omit<Draft, 'approved' | 'editing'>) => ({ ...d, approved: true, editing: false })))
    setDrafting(false)
  }

  async function handleSend() {
    setSending(true)
    const toSend = drafts.filter(d => d.approved).map(d => ({
      contactId: d.contactId,
      subject: d.subject,
      body: d.body,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
    }))
    const res = await fetch('/api/admin/send-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: toSend, advanceStage }),
    })
    const data = await res.json()
    setSentCount(data.sent ?? 0)
    setSending(false)
    setDrafts([])
    setSelected(new Set())
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', background: '#0C1E30',
    border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
    color: '#ffffff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>AI-Powered</p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>Outreach</h1>
      </div>

      {sentCount !== null && (
        <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 6, padding: '16px 24px', marginBottom: 24 }}>
          <p style={{ color: '#4ade80', margin: 0, fontSize: 14 }}>✓ {sentCount} emails sent successfully.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 24 }}>

        {/* Left: contact selector + context */}
        <div>
          <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(201,169,110,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
                Select Contacts ({selected.size} selected)
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={selectAll} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>All</button>
                <button onClick={selectNone} style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>None</button>
              </div>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {filteredContacts.length === 0 ? (
                <p style={{ color: '#6B8299', fontSize: 13, padding: '20px', textAlign: 'center' }}>No contacts with pending outreach.</p>
              ) : filteredContacts.map(c => (
                <label key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
                  cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: selected.has(c.id) ? 'rgba(201,169,110,0.05)' : 'transparent',
                }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#ffffff', fontSize: 13, margin: '0 0 2px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      {c.firstName} {c.lastName}
                      {c.wornOut && <span style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', borderRadius: 2 }}>soft</span>}
                    </p>
                    <p style={{ color: '#6B8299', fontSize: 11, margin: 0 }}>{c.licenseType} {c.state ? `· ${c.state}` : ''}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Context prompt */}
          <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
                Context for Claude
              </p>
              {contextSource && (
                <span style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.1em' }}>
                  ✓ pre-filled from import: {contextSource}
                </span>
              )}
            </div>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="e.g. These are State Farm agents in Texas. We want to show them AFF's higher income potential and flexibility."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <input type="checkbox" id="advance" checked={advanceStage} onChange={e => setAdvanceStage(e.target.checked)} />
              <label htmlFor="advance" style={{ color: '#9BB0C4', fontSize: 12, cursor: 'pointer' }}>
                Move to "Contacted" stage in GHL pipeline after sending
              </label>
            </div>
            <button
              onClick={handleDraft}
              disabled={selected.size === 0 || drafting}
              style={{
                width: '100%', padding: '10px', background: selected.size > 0 && !drafting ? '#C9A96E' : '#2a4a6a',
                color: selected.size > 0 && !drafting ? '#142D48' : '#6B8299',
                border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {drafting ? `Drafting ${selected.size} emails...` : `Draft ${selected.size} Emails with Claude`}
            </button>
          </div>
        </div>

        {/* Right: draft review */}
        <div>
          {drafts.length === 0 ? (
            <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '48px', textAlign: 'center' }}>
              <p style={{ color: '#6B8299', fontSize: 13 }}>Select contacts and click "Draft Emails" to generate personalized outreach with Claude.</p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
                  {drafts.filter(d => d.approved).length} / {drafts.length} approved
                </p>
                <button onClick={handleSend} disabled={sending || drafts.filter(d => d.approved).length === 0} style={{
                  padding: '8px 20px', background: '#C9A96E', color: '#142D48', border: 'none',
                  borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}>
                  {sending ? 'Sending...' : `Send ${drafts.filter(d => d.approved).length} Emails`}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {drafts.map((d, i) => (
                  <div key={d.contactId} style={{
                    background: '#142D48', borderRadius: 6,
                    border: `1px solid ${d.approved ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    opacity: d.approved ? 1 : 0.5,
                  }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" checked={d.approved} onChange={() => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, approved: !x.approved } : x))} />
                      <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>{d.firstName} {d.lastName}</span>
                      <button
                        onClick={() => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, editing: !x.editing } : x))}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}
                      >
                        {d.editing ? 'Done' : 'Edit'}
                      </button>
                    </div>
                    <div style={{ padding: '14px 20px' }}>
                      {d.editing ? (
                        <>
                          <input
                            value={d.subject}
                            onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))}
                            style={{ ...inputStyle, marginBottom: 10, fontSize: 12 }}
                            placeholder="Subject"
                          />
                          <textarea
                            value={d.body}
                            onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
                            rows={6}
                            style={{ ...inputStyle, resize: 'vertical', fontSize: 12, lineHeight: 1.6 }}
                          />
                        </>
                      ) : (
                        <>
                          <p style={{ color: '#C9A96E', fontSize: 11, fontWeight: 600, margin: '0 0 6px' }}>{d.subject}</p>
                          <p style={{ color: '#9BB0C4', fontSize: 12, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{d.body}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
