'use client'

import { useState, useEffect } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface Template {
  id: string; key: string; label: string; subject: string
  bodyHtml: string; description: string | null
}

export default function EmailTemplatesPage() {
  const isMobile = useIsMobile()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ subject: '', bodyHtml: '', label: '', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/email-templates').then(r => r.json())
      .then((d: { templates: Template[] }) => { setTemplates(d.templates ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const startEdit = (t: Template) => {
    setForm({ subject: t.subject, bodyHtml: t.bodyHtml, label: t.label, description: t.description ?? '' })
    setEditingId(t.id)
  }

  const handleSave = async () => {
    if (!editingId) return
    setSaving(true)
    await fetch('/api/admin/email-templates', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...form }),
    })
    setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, ...form } : t))
    setEditingId(null)
    setSaving(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', outline: 'none' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }

  return (
    <div style={{ padding: isMobile ? 16 : '24px 32px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0 }}>Email Templates</h1>
        <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
          Customize the emails sent to agents. Use {'{{variables}}'} for dynamic content.
        </p>
      </div>

      {loading ? <div style={{ color: '#6B8299' }}>Loading...</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              padding: '16px 20px', borderRadius: 6,
              background: '#132238', border: `1px solid ${editingId === t.id ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.05)'}`,
            }}>
              {editingId === t.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={lbl}>Template Name</div>
                    <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <div style={lbl}>Description</div>
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <div style={lbl}>Subject Line</div>
                    <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={lbl}>Body (HTML)</div>
                      <div style={{ fontSize: 9, color: '#4B5563' }}>
                        Variables: {'{{firstName}}'}, {'{{inviteUrl}}'}, {'{{phase}}'}, {'{{portalUrl}}'}
                      </div>
                    </div>
                    <textarea value={form.bodyHtml} onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))} rows={8} style={{ ...inp, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', borderRadius: 4, fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 2 }}>{t.label}</div>
                    {t.description && <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 6 }}>{t.description}</div>}
                    <div style={{ fontSize: 11, color: '#9BB0C4' }}>
                      Subject: <span style={{ color: '#C9A96E' }}>{t.subject}</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#4B5563', marginTop: 4 }}>Key: {t.key}</div>
                  </div>
                  <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      }
    </div>
  )
}
