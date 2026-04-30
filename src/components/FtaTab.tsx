'use client'

import { useEffect, useState, useCallback } from 'react'
import DateTimePicker from './DateTimePicker'
import { formatPhoneAsTyped } from '@/lib/contact-validation'

const card = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14 }
const inputStyle = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' as const }
const fieldLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C9A96E', display: 'block', marginBottom: 4 }

const CATEGORIES = [
  { value: 'UNDER_50', label: 'Under 50' },
  { value: 'FIFTY_PLUS', label: '50+' },
  { value: 'FIFTY_NINE_HALF_PLUS', label: '59½+' },
  { value: 'JUST_RETIRED', label: 'Just Retired' },
  { value: 'TRANSITIONING_JOBS', label: 'Transitioning Jobs' },
  { value: 'RECEIVED_INHERITANCE', label: 'Received Inheritance' },
] as const

interface Fta {
  id: string
  name: string
  phone: string | null
  timeZone: string | null
  age: number | null
  married: boolean | null
  children: number | null
  homeowner: boolean | null
  occupation60kPlus: boolean | null
  appointmentDate: string
  notes: string | null
  category: string | null
}

export default function FtaTab({ isMobile }: { isMobile: boolean }) {
  const [ftas, setFtas] = useState<Fta[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const refresh = useCallback(() => {
    fetch('/api/agents/fta')
      .then(r => r.ok ? r.json() : { ftas: [] })
      .then((d: { ftas: Fta[] }) => { setFtas(d.ftas ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const remove = async (id: string) => {
    if (!confirm('Delete this appointment?')) return
    const res = await fetch(`/api/agents/fta/${id}`, { method: 'DELETE' })
    if (res.ok) refresh()
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={sectionLabel}>Field Training Appointments ({ftas.length})</div>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Add FTA'}
        </button>
      </div>

      {showForm && <FtaForm isMobile={isMobile} onSaved={() => { refresh(); setShowForm(false) }} />}

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        ftas.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No appointments yet.</div> :
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Name', 'Phone', 'Date', 'Age', 'Category', ''].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {ftas.map(f => (
              <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{f.name}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{f.phone ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(f.appointmentDate).toLocaleString()}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{f.age ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 11, color: '#C9A96E' }}>{CATEGORIES.find(c => c.value === f.category)?.label ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 11 }}>
                  <button onClick={() => remove(f.id)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    </div>
  )
}

function FtaForm({ isMobile, onSaved }: { isMobile: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', phone: '', timeZone: '', age: '', married: '', children: '', homeowner: '',
    occupation60kPlus: '', appointmentDate: '', notes: '', category: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { ...form }
      // Convert booleans/numbers
      for (const k of ['married', 'homeowner', 'occupation60kPlus']) {
        body[k] = form[k as keyof typeof form] === '' ? null : form[k as keyof typeof form] === 'yes'
      }
      for (const k of ['age', 'children']) {
        body[k] = form[k as keyof typeof form] === '' ? null : Number(form[k as keyof typeof form])
      }
      if (!body.category) body.category = null
      const res = await fetch('/api/agents/fta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Save failed')
        return
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }
  const yesNoSelect = (key: keyof typeof form) => (
    <select style={inputStyle} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )

  return (
    <form onSubmit={submit} style={{ marginBottom: 20, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
      <div style={grid}>
        <div><label style={fieldLabel}>Name *</label><input required style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Appointment Date *</label>
          <DateTimePicker value={form.appointmentDate} onChange={v => setForm(f => ({ ...f, appointmentDate: v }))} required />
        </div>
        <div><label style={fieldLabel}>Phone</label><input type="tel" inputMode="numeric" placeholder="e.g. (555) 123-4567" style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: formatPhoneAsTyped(e.target.value) }))} /></div>
        <div><label style={fieldLabel}>Time Zone</label><input style={inputStyle} value={form.timeZone} onChange={e => setForm(f => ({ ...f, timeZone: e.target.value }))} placeholder="EST / CST / MST / PST" /></div>
        <div><label style={fieldLabel}>Age</label><input type="number" style={inputStyle} value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Married</label>{yesNoSelect('married')}</div>
        <div><label style={fieldLabel}>Children</label><input type="number" style={inputStyle} value={form.children} onChange={e => setForm(f => ({ ...f, children: e.target.value }))} /></div>
        <div><label style={fieldLabel}>Homeowner</label>{yesNoSelect('homeowner')}</div>
        <div><label style={fieldLabel}>Occupation 60k+</label>{yesNoSelect('occupation60kPlus')}</div>
        <div><label style={fieldLabel}>Category</label>
          <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            <option value="">—</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}>
          <label style={fieldLabel}>Notes</label>
          <textarea style={{ ...inputStyle, height: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      {error && <div style={{ marginTop: 12, color: '#EF4444', fontSize: 12 }}>{error}</div>}
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </form>
  )
}
