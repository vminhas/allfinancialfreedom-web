'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'

interface SetupResource {
  id: string
  key: string
  label: string
  url: string
  category: string
  description: string | null
  callType: string | null
  rawScriptContent: string | null
  aiScriptOutline: string | null
  outlineGeneratedAt: string | null
  updatedAt: string
}

const CATEGORIES = ['scripts', 'training', 'tools', 'forms', 'general'] as const

const CALL_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',                   label: '— Not a call script' },
  { value: 'RECRUIT',            label: 'Recruit calls (Hiring deck)' },
  { value: 'CLIENT_APPOINTMENT', label: 'Client appointments / FTAs' },
  { value: 'FOLLOW_UP',          label: 'Follow-up calls' },
  { value: 'OTHER',              label: 'Other call types' },
]

const SUGGESTED_RESOURCES = [
  { key: 'scripts_presentation', label: 'Presentation Scripts', category: 'scripts' },
  { key: 'scripts_phone', label: 'Phone Call Scripts', category: 'scripts' },
  { key: 'scripts_recruiting', label: 'Recruiting Scripts', category: 'scripts' },
  { key: 'fast_start_link', label: 'Fast Start School Link', category: 'training' },
  { key: 'pfr_tool', label: 'PFR Tool', category: 'tools' },
  { key: 'business_marketing_template', label: 'Business Marketing Plan Template', category: 'tools' },
  { key: 'ce_course_provider', label: 'CE Course Provider', category: 'forms' },
  { key: 'eo_insurance_provider', label: 'E&O Insurance Provider', category: 'forms' },
  { key: 'discord_invite', label: 'Discord Invite Link', category: 'tools' },
]

export default function SetupDashboard() {
  const [resources, setResources] = useState<SetupResource[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const [formKey, setFormKey] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formCategory, setFormCategory] = useState('general')
  const [formDesc, setFormDesc] = useState('')
  const [formCallType, setFormCallType] = useState('')
  const [saving, setSaving] = useState(false)

  // AI outline configurator. Opens when admin clicks "AI coaching"
  // on a script-tagged resource. Pastes raw deck text, hits generate,
  // gets a structured outline back that the call analyzer uses.
  const [outlineFor, setOutlineFor] = useState<SetupResource | null>(null)
  const [outlineRaw, setOutlineRaw] = useState('')
  const [outlineDraft, setOutlineDraft] = useState('')
  const [outlineGenerating, setOutlineGenerating] = useState(false)
  const [outlineSaving, setOutlineSaving] = useState(false)
  const [outlineError, setOutlineError] = useState('')

  const openOutline = (r: SetupResource) => {
    setOutlineFor(r)
    setOutlineRaw(r.rawScriptContent ?? '')
    setOutlineDraft(r.aiScriptOutline ?? '')
    setOutlineError('')
  }
  const closeOutline = () => {
    setOutlineFor(null)
    setOutlineRaw('')
    setOutlineDraft('')
    setOutlineError('')
    setAutoFetchFailed(false)
    setAutoFetchSource(null)
  }

  // generateOutline can be called in two modes:
  //   - 'auto'   — server-side fetches the resource URL and reads it
  //                (the default; the whole point of associating a URL).
  //   - 'manual' — admin pasted content into the fallback textarea
  //                (used when auto-fetch fails, e.g. Canva).
  const [autoFetchFailed, setAutoFetchFailed] = useState(false)
  const [autoFetchSource, setAutoFetchSource] = useState<string | null>(null)
  const generateOutline = async (mode: 'auto' | 'manual' = 'auto') => {
    if (!outlineFor) return
    if (mode === 'manual' && outlineRaw.trim().length < 100) {
      setOutlineError('Paste at least ~100 characters of script content first.')
      return
    }
    setOutlineGenerating(true)
    setOutlineError('')
    setAutoFetchFailed(false)
    try {
      const res = await fetch(`/api/admin/setup-resources/${outlineFor.id}/generate-outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'manual' ? { rawScriptContent: outlineRaw } : {}
        ),
      })
      const data = await res.json() as {
        resource?: SetupResource
        error?: string
        autoFetchFailed?: boolean
        extractedSource?: string | null
      }
      if (!res.ok || !data.resource) {
        setOutlineError(data.error ?? 'Failed to generate outline')
        if (data.autoFetchFailed) setAutoFetchFailed(true)
      } else {
        setOutlineDraft(data.resource.aiScriptOutline ?? '')
        setOutlineFor(data.resource)
        setAutoFetchSource(data.extractedSource ?? null)
        fetchResources()
      }
    } finally {
      setOutlineGenerating(false)
    }
  }

  const saveOutline = async () => {
    if (!outlineFor) return
    setOutlineSaving(true)
    try {
      await fetch('/api/admin/setup-resources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: outlineFor.id,
          rawScriptContent: outlineRaw,
          aiScriptOutline: outlineDraft,
        }),
      })
      fetchResources()
      closeOutline()
    } finally {
      setOutlineSaving(false)
    }
  }

  const fetchResources = useCallback(async () => {
    const res = await fetch('/api/admin/setup-resources')
    if (res.ok) {
      const d = await res.json() as { resources: SetupResource[] }
      setResources(d.resources ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchResources() }, [fetchResources])

  const resetForm = () => {
    setFormKey('')
    setFormLabel('')
    setFormUrl('')
    setFormCategory('general')
    setFormDesc('')
    setFormCallType('')
    setEditingId(null)
    setShowAdd(false)
  }

  const startEdit = (r: SetupResource) => {
    setFormKey(r.key)
    setFormLabel(r.label)
    setFormUrl(r.url)
    setFormCategory(r.category)
    setFormDesc(r.description ?? '')
    setFormCallType(r.callType ?? '')
    setEditingId(r.id)
    setShowAdd(true)
  }

  const startAddSuggested = (s: typeof SUGGESTED_RESOURCES[0]) => {
    setFormKey(s.key)
    setFormLabel(s.label)
    setFormUrl('')
    setFormCategory(s.category)
    setFormDesc('')
    setFormCallType('')
    setEditingId(null)
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!formLabel || !formUrl) return
    setSaving(true)
    try {
      if (editingId) {
        await fetch('/api/admin/setup-resources', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, label: formLabel, url: formUrl, category: formCategory, description: formDesc || undefined, callType: formCallType || null }),
        })
      } else {
        if (!formKey) return
        await fetch('/api/admin/setup-resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: formKey, label: formLabel, url: formUrl, category: formCategory, description: formDesc || undefined, callType: formCallType || null }),
        })
      }
      resetForm()
      fetchResources()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/admin/setup-resources?id=${id}`, { method: 'DELETE' })
    fetchResources()
  }

  const existingKeys = new Set(resources.map(r => r.key))
  const unaddedSuggestions = SUGGESTED_RESOURCES.filter(s => !existingKeys.has(s.key))

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 13,
    background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#ffffff', outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: '#9BB0C4',
    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4,
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#9BB0C4', fontSize: 13 }}>Loading...</div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '0.05em' }}>
            Resource Center
          </h1>
          <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
            Manage resource links that appear in agent checklist items.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAdd(true) }}
          style={{
            padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700,
            background: '#C9A96E', border: 'none', color: '#142D48', cursor: 'pointer',
          }}
        >
          + Add Resource
        </button>
      </div>

      {/* Add form (top of page). The Edit form renders inline below
          the row being edited so admins don't lose their scroll
          position when they click Edit on a row halfway down. */}
      {showAdd && !editingId && (
        <div style={{
          padding: 20, marginBottom: 20,
          background: '#132238', border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', marginBottom: 16 }}>
            {editingId ? 'Edit Resource' : 'Add Resource'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: editingId ? '1' : 'span 2' }}>
              <div style={labelStyle}>Label</div>
              <input value={formLabel} onChange={e => {
                setFormLabel(e.target.value)
                if (!editingId) setFormKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
              }} placeholder="Phone Call Scripts" style={inputStyle} />
            </div>
            {editingId && (
              <div>
                <div style={labelStyle}>Key</div>
                <input value={formKey} disabled style={{ ...inputStyle, opacity: 0.5 }} />
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>URL</div>
              <input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Category</div>
              <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Description (optional)</div>
              <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief note" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>Use as script for</div>
              <select
                value={formCallType}
                onChange={e => setFormCallType(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {CALL_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
                Tag this resource as the standardized script for a call type. The AI call analyzer will tell agents to follow it and grade their transcripts against it. Only one resource per call type, picking a new one moves the tag.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={resetForm} style={{
              padding: '8px 16px', borderRadius: 4, fontSize: 12,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9BB0C4', cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !formLabel || !formUrl} style={{
              padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              background: '#C9A96E', border: 'none', color: '#142D48',
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Suggested resources to add */}
      {unaddedSuggestions.length > 0 && !showAdd && (
        <div style={{
          padding: '12px 16px', marginBottom: 16,
          background: 'rgba(201,169,110,0.04)',
          border: '1px solid rgba(201,169,110,0.1)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#C9A96E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Suggested resources to configure
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unaddedSuggestions.map(s => (
              <button
                key={s.key}
                onClick={() => startAddSuggested(s)}
                style={{
                  padding: '5px 12px', borderRadius: 4, fontSize: 11,
                  background: 'rgba(201,169,110,0.08)',
                  border: '1px solid rgba(201,169,110,0.15)',
                  color: '#C9A96E', cursor: 'pointer',
                }}
              >
                + {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resources table */}
      <div style={{ borderRadius: 6, overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Label', 'Key', 'Category', 'Script for', 'URL', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', fontSize: 9, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  color: '#6B8299', textAlign: 'left',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px 14px', fontSize: 12, color: '#4B5563', textAlign: 'center' }}>
                  No resources configured yet. Add one above or click a suggestion.
                </td>
              </tr>
            ) : resources.map(r => (
              <Fragment key={r.id}>
                <tr style={{ borderBottom: editingId === r.id ? 'none' : '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#ffffff' }}>{r.label}</td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: '#6B8299', fontFamily: 'monospace' }}>{r.key}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(201,169,110,0.08)', color: '#C9A96E',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>{r.category}</span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: '#9BB0C4' }}>
                  {r.callType ? (
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(74,222,128,0.08)', color: '#4ade80',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      {r.callType}
                    </span>
                  ) : (
                    <span style={{ color: '#4B5563' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: '#9BB0C4', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#9BB0C4', textDecoration: 'underline' }}>
                    {r.url.replace(/^https?:\/\//, '').slice(0, 40)}
                  </a>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.callType && (
                    <button onClick={() => openOutline(r)} style={{
                      background: 'none', border: 'none',
                      color: r.aiScriptOutline ? '#4ade80' : '#C9A96E',
                      fontSize: 11, cursor: 'pointer', marginRight: 8,
                      whiteSpace: 'nowrap',
                    }}>
                      {r.aiScriptOutline ? 'AI outline ✓' : 'AI coaching'}
                    </button>
                  )}
                  <button onClick={() => editingId === r.id ? resetForm() : startEdit(r)} style={{
                    background: 'none', border: 'none',
                    color: editingId === r.id ? '#9BB0C4' : '#C9A96E',
                    fontSize: 11, cursor: 'pointer', marginRight: 8,
                  }}>{editingId === r.id ? 'Close' : 'Edit'}</button>
                  <button onClick={() => handleDelete(r.id)} style={{
                    background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer',
                  }}>Delete</button>
                </td>
                </tr>
                {editingId === r.id && (
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td colSpan={6} style={{
                      padding: 0,
                      background: 'rgba(201,169,110,0.04)',
                      borderTop: '1px solid rgba(201,169,110,0.18)',
                    }}>
                      <div style={{ padding: 18 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#C9A96E', marginBottom: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                          Editing &middot; {r.label}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={labelStyle}>Label</div>
                            <input value={formLabel} onChange={e => setFormLabel(e.target.value)} style={inputStyle} />
                          </div>
                          <div>
                            <div style={labelStyle}>Key</div>
                            <input value={formKey} disabled style={{ ...inputStyle, opacity: 0.5 }} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={labelStyle}>URL</div>
                            <input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
                          </div>
                          <div>
                            <div style={labelStyle}>Category</div>
                            <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={labelStyle}>Description (optional)</div>
                            <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief note" style={inputStyle} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={labelStyle}>Use as script for</div>
                            <select value={formCallType} onChange={e => setFormCallType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                              {CALL_TYPE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
                              Tag this resource as the standardized script for a call type. The AI call analyzer will tell agents to follow it and grade their transcripts against it. Only one resource per call type, picking a new one moves the tag.
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                          <button onClick={resetForm} style={{
                            padding: '8px 16px', borderRadius: 4, fontSize: 12,
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#9BB0C4', cursor: 'pointer',
                          }}>Cancel</button>
                          <button onClick={handleSave} disabled={saving || !formLabel || !formUrl} style={{
                            padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                            background: '#C9A96E', border: 'none', color: '#142D48',
                            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                          }}>
                            {saving ? 'Saving...' : 'Update'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {outlineFor && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeOutline() }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(10,22,40,0.85)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '40px 16px', overflowY: 'auto',
          }}
        >
          <div style={{
            background: '#0C1E30', border: '1px solid rgba(201,169,110,0.25)',
            borderRadius: 8, width: '100%', maxWidth: 760, padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
                  AI Coaching Setup &middot; {outlineFor.callType}
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#fff', marginTop: 4 }}>{outlineFor.label}</div>
                <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, lineHeight: 1.55 }}>
                  Click <strong style={{ color: '#fff' }}>Generate from resource</strong> below: Claude will read the resource URL ({outlineFor.url ? new URL(outlineFor.url).hostname : 'no URL'}) and produce a structured NEPQ-mapped outline plus JLM coaching guidance. Cached on every analyze call so token cost stays flat.
                </div>
              </div>
              <button onClick={closeOutline} style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4, color: '#9BB0C4', fontSize: 14, cursor: 'pointer',
                width: 32, height: 32,
              }}>✕</button>
            </div>

            {outlineError && (
              <div style={{
                marginBottom: 12, padding: '10px 14px', borderRadius: 4,
                background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
                color: '#f87171', fontSize: 12, lineHeight: 1.55,
              }}>
                {outlineError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => generateOutline('auto')}
                disabled={outlineGenerating}
                style={{
                  background: '#C9A96E', color: '#142D48', border: 'none',
                  borderRadius: 4, padding: '10px 18px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: outlineGenerating ? 'wait' : 'pointer',
                  opacity: outlineGenerating ? 0.55 : 1,
                }}
              >
                {outlineGenerating ? 'Generating...' : outlineFor.aiScriptOutline ? 'Re-generate from resource' : 'Generate from resource'}
              </button>
              {autoFetchSource && !outlineGenerating && (
                <span style={{ fontSize: 11, color: '#4ade80' }}>
                  ✓ Read from {autoFetchSource}
                </span>
              )}
              {outlineFor.outlineGeneratedAt && (
                <span style={{ fontSize: 11, color: '#6B8299' }}>
                  Last generated {new Date(outlineFor.outlineGeneratedAt).toLocaleString()}
                </span>
              )}
            </div>

            {autoFetchFailed && (
              <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 4, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>
                  Auto-fetch failed &middot; manual fallback
                </div>
                <div style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 10, lineHeight: 1.5 }}>
                  Couldn&apos;t read this URL automatically. Paste the deck content below as a one-time fallback, or update the resource to a Google Doc/Slides URL (anyone-with-the-link sharing) and try Generate from resource again.
                </div>
                <textarea
                  value={outlineRaw}
                  onChange={e => setOutlineRaw(e.target.value)}
                  placeholder="Paste deck text here as fallback..."
                  style={{
                    ...inputStyle,
                    minHeight: 140, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 12, lineHeight: 1.55, resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: '#6B8299' }}>{outlineRaw.trim().length} characters</div>
                  <button
                    onClick={() => generateOutline('manual')}
                    disabled={outlineGenerating || outlineRaw.trim().length < 100}
                    style={{
                      background: 'transparent', color: '#C9A96E',
                      border: '1px solid rgba(201,169,110,0.4)',
                      borderRadius: 4, padding: '8px 14px', fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      cursor: outlineGenerating || outlineRaw.trim().length < 100 ? 'not-allowed' : 'pointer',
                      opacity: outlineGenerating || outlineRaw.trim().length < 100 ? 0.55 : 1,
                    }}
                  >
                    Generate from pasted text
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>AI-generated outline (editable)</div>
              <textarea
                value={outlineDraft}
                onChange={e => setOutlineDraft(e.target.value)}
                placeholder="Click 'Generate from resource' above to produce one. You can also edit the result by hand after."
                style={{
                  ...inputStyle,
                  minHeight: 280, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontSize: 12, lineHeight: 1.6, resize: 'vertical',
                }}
              />
              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, lineHeight: 1.55 }}>
                This is what the call analyzer reads as the standardized playbook for {outlineFor.callType} calls.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={closeOutline} style={{
                padding: '10px 16px', borderRadius: 4, fontSize: 11,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#9BB0C4', cursor: 'pointer', fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>Cancel</button>
              <button onClick={saveOutline} disabled={outlineSaving} style={{
                padding: '10px 18px', borderRadius: 4, fontSize: 11,
                background: '#C9A96E', border: 'none', color: '#142D48', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: outlineSaving ? 'wait' : 'pointer', opacity: outlineSaving ? 0.7 : 1,
              }}>
                {outlineSaving ? 'Saving...' : 'Save outline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
