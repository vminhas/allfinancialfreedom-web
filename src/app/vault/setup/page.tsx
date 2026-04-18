'use client'

import { useState, useEffect, useCallback } from 'react'

interface SetupResource {
  id: string
  key: string
  label: string
  url: string
  category: string
  description: string | null
  updatedAt: string
}

const CATEGORIES = ['scripts', 'training', 'tools', 'forms', 'general'] as const

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
  const [saving, setSaving] = useState(false)

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
    setEditingId(null)
    setShowAdd(false)
  }

  const startEdit = (r: SetupResource) => {
    setFormKey(r.key)
    setFormLabel(r.label)
    setFormUrl(r.url)
    setFormCategory(r.category)
    setFormDesc(r.description ?? '')
    setEditingId(r.id)
    setShowAdd(true)
  }

  const startAddSuggested = (s: typeof SUGGESTED_RESOURCES[0]) => {
    setFormKey(s.key)
    setFormLabel(s.label)
    setFormUrl('')
    setFormCategory(s.category)
    setFormDesc('')
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
          body: JSON.stringify({ id: editingId, label: formLabel, url: formUrl, category: formCategory, description: formDesc || undefined }),
        })
      } else {
        if (!formKey) return
        await fetch('/api/admin/setup-resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: formKey, label: formLabel, url: formUrl, category: formCategory, description: formDesc || undefined }),
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
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '0.05em' }}>
            Setup Dashboard
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

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{
          padding: 20, marginBottom: 20,
          background: '#132238', border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', marginBottom: 16 }}>
            {editingId ? 'Edit Resource' : 'Add Resource'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Key</div>
              <input
                value={formKey}
                onChange={e => setFormKey(e.target.value)}
                disabled={!!editingId}
                placeholder="scripts_phone"
                style={{ ...inputStyle, opacity: editingId ? 0.5 : 1 }}
              />
            </div>
            <div>
              <div style={labelStyle}>Label</div>
              <input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="Phone Call Scripts" style={inputStyle} />
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
      <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Label', 'Key', 'Category', 'URL', ''].map(h => (
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
                <td colSpan={5} style={{ padding: '24px 14px', fontSize: 12, color: '#4B5563', textAlign: 'center' }}>
                  No resources configured yet. Add one above or click a suggestion.
                </td>
              </tr>
            ) : resources.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#ffffff' }}>{r.label}</td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: '#6B8299', fontFamily: 'monospace' }}>{r.key}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(201,169,110,0.08)', color: '#C9A96E',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>{r.category}</span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: '#9BB0C4', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#9BB0C4', textDecoration: 'underline' }}>
                    {r.url.replace(/^https?:\/\//, '').slice(0, 40)}
                  </a>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button onClick={() => startEdit(r)} style={{
                    background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer', marginRight: 8,
                  }}>Edit</button>
                  <button onClick={() => handleDelete(r.id)} style={{
                    background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer',
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
