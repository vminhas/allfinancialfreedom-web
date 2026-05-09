'use client'

import { useState, useEffect, useCallback } from 'react'

type CallType = 'RECRUIT' | 'FOLLOW_UP' | 'CLIENT_APPOINTMENT' | 'OTHER'

const CALL_TYPE_LABEL: Record<CallType, string> = {
  RECRUIT:            'Recruit Calls',
  FOLLOW_UP:          'Follow-up Calls',
  CLIENT_APPOINTMENT: 'Client Appointments / FTAs',
  OTHER:              'Other',
}

const CALL_TYPE_DESCRIPTION: Record<CallType, string> = {
  RECRUIT:            'AFF Hiring deck. The AI grades recruit calls against the script you set here.',
  FOLLOW_UP:          'Touchpoint cadence + recap framing for follow-up calls.',
  CLIENT_APPOINTMENT: 'AFF FTA Field Visit deck. Used when an agent runs a client appointment.',
  OTHER:              'Catch-all for ad-hoc call types tagged as Other.',
}

interface Script {
  id: string
  callType: CallType
  name: string
  content: string
  resourceUrl: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export default function CoachingScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, Partial<Script>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [creatingFor, setCreatingFor] = useState<CallType | null>(null)
  const [draft, setDraft] = useState<Partial<Script>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/call-scripts')
    if (res.ok) {
      const d = await res.json() as { scripts: Script[] }
      setScripts(d.scripts ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const patchField = (id: string, patch: Partial<Script>) =>
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const save = async (id: string) => {
    setSaving(id)
    setError('')
    const patch = editing[id]
    if (!patch) { setSaving(null); return }
    const res = await fetch(`/api/admin/call-scripts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Save failed')
    } else {
      setEditing(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      load()
    }
    setSaving(null)
  }

  const toggleActive = async (s: Script, next: boolean) => {
    setSaving(s.id)
    const res = await fetch(`/api/admin/call-scripts/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Update failed')
    } else {
      load()
    }
    setSaving(null)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this script? Historical reviews stay; future calls of this type fall back to NEPQ-only grading until another script is active.')) return
    setSaving(id)
    const res = await fetch(`/api/admin/call-scripts/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Delete failed')
    } else {
      load()
    }
    setSaving(null)
  }

  const create = async (callType: CallType) => {
    if (!draft.name?.trim() || !draft.content?.trim()) {
      setError('Name and content are required')
      return
    }
    setSaving('new')
    const res = await fetch('/api/admin/call-scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callType,
        name: draft.name,
        content: draft.content,
        resourceUrl: draft.resourceUrl,
        active: draft.active !== false,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Create failed')
    } else {
      setDraft({})
      setCreatingFor(null)
      load()
    }
    setSaving(null)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0C1E30',
    border: '1px solid rgba(201,169,110,0.15)',
    borderRadius: 4, color: '#d1d9e2',
    padding: '10px 14px', fontSize: 13, fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    color: '#C9A96E', marginBottom: 6,
  }
  const btn: React.CSSProperties = {
    background: '#C9A96E', color: '#142D48', border: 'none',
    borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
  }
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: '#9BB0C4',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '8px 14px', fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
  }

  const groups: Array<{ key: CallType; scripts: Script[] }> = (['RECRUIT', 'CLIENT_APPOINTMENT', 'FOLLOW_UP', 'OTHER'] as CallType[])
    .map(callType => ({ callType, scripts: scripts.filter(s => s.callType === callType) }))
    .map(g => ({ key: g.callType, scripts: g.scripts }))

  return (
    <div>
      <div style={{ marginBottom: 28, padding: '28px 0 24px', borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          All Financial Freedom
        </div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Coaching Scripts
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0, maxWidth: 720 }}>
          The AI call analyzer grades transcripts against the active script for each call type, in addition to the general NEPQ rubric. Standardize what every agent should be running so JLM-style coaching points at one playbook.
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, color: '#f87171', fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>}

      {!loading && groups.map(g => (
        <div key={g.key} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{CALL_TYPE_LABEL[g.key]}</div>
            <div style={{ fontSize: 12, color: '#6B8299', marginTop: 2 }}>{CALL_TYPE_DESCRIPTION[g.key]}</div>
          </div>

          {g.scripts.length === 0 && creatingFor !== g.key && (
            <div style={{ padding: '14px 16px', border: '1px dashed rgba(201,169,110,0.2)', borderRadius: 6, color: '#6B8299', fontSize: 12 }}>
              No script yet. The AI falls back to NEPQ-only grading for {CALL_TYPE_LABEL[g.key].toLowerCase()}.
            </div>
          )}

          {g.scripts.map(s => {
            const e = editing[s.id] ?? {}
            const merged = { ...s, ...e }
            const dirty = Object.keys(e).length > 0
            return (
              <div key={s.id} style={{
                marginBottom: 12, padding: 18, borderRadius: 6,
                background: '#0C1E30',
                border: `1px solid ${s.active ? 'rgba(201,169,110,0.35)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {s.active && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '3px 10px', borderRadius: 999, background: 'rgba(201,169,110,0.18)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.4)' }}>ACTIVE</span>
                  )}
                  {!s.active && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '3px 10px', borderRadius: 999, background: 'rgba(107,130,153,0.15)', color: '#9BB0C4', border: '1px solid rgba(107,130,153,0.3)' }}>INACTIVE</span>
                  )}
                  <span style={{ fontSize: 11, color: '#6B8299' }}>Updated {new Date(s.updatedAt).toLocaleDateString()}</span>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Name</label>
                  <input
                    style={inputStyle}
                    value={merged.name}
                    onChange={ev => patchField(s.id, { name: ev.target.value })}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Resource URL (optional)</label>
                  <input
                    style={inputStyle}
                    placeholder="https://canva.com/... or https://docs.google.com/..."
                    value={merged.resourceUrl ?? ''}
                    onChange={ev => patchField(s.id, { resourceUrl: ev.target.value })}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Script content</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 220, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.55, resize: 'vertical' }}
                    value={merged.content}
                    onChange={ev => patchField(s.id, { content: ev.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    style={{ ...btn, opacity: dirty ? 1 : 0.5, cursor: dirty ? 'pointer' : 'not-allowed' }}
                    disabled={!dirty || saving === s.id}
                    onClick={() => save(s.id)}
                  >
                    {saving === s.id ? 'Saving...' : 'Save changes'}
                  </button>
                  {!s.active && (
                    <button style={btnGhost} onClick={() => toggleActive(s, true)} disabled={saving === s.id}>
                      Make active
                    </button>
                  )}
                  {s.active && (
                    <button style={btnGhost} onClick={() => toggleActive(s, false)} disabled={saving === s.id}>
                      Deactivate
                    </button>
                  )}
                  <button
                    style={{ ...btnGhost, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                    onClick={() => remove(s.id)}
                    disabled={saving === s.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}

          {creatingFor === g.key ? (
            <div style={{ marginTop: 12, padding: 18, borderRadius: 6, background: '#0C1E30', border: '1px dashed rgba(201,169,110,0.35)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
                New script for {CALL_TYPE_LABEL[g.key]}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Resource URL (optional)</label>
                <input style={inputStyle} value={draft.resourceUrl ?? ''} onChange={e => setDraft(d => ({ ...d, resourceUrl: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Script content</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 220, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.55, resize: 'vertical' }}
                  value={draft.content ?? ''}
                  onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn} disabled={saving === 'new'} onClick={() => create(g.key)}>
                  {saving === 'new' ? 'Saving...' : 'Create + activate'}
                </button>
                <button style={btnGhost} onClick={() => { setCreatingFor(null); setDraft({}) }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              style={{ ...btnGhost, marginTop: 8, color: '#C9A96E', borderColor: 'rgba(201,169,110,0.3)' }}
              onClick={() => { setCreatingFor(g.key); setDraft({}) }}
            >
              + Add script
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
