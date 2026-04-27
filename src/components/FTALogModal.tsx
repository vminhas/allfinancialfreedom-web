'use client'

import { useState } from 'react'
import { X, UserCheck, Calendar } from 'lucide-react'

const TIMEZONES = ['EST', 'CST', 'MST', 'PST', 'HST', 'AKST'] as const

interface Props {
  ftaKey: string
  ftaLabel: string
  trainerName?: string | null
  defaultName?: string
  onClose: () => void
  onSaved: () => void
}

export default function FTALogModal({ ftaKey, ftaLabel, trainerName, defaultName, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: defaultName ?? '',
    phone: '',
    timeZone: '',
    age: '',
    married: false,
    children: false,
    homeowner: false,
    occupation: '',
    appointmentDate: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/agents/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          appointmentDate: form.appointmentDate || undefined,
          notes: form.notes.trim() || undefined,
          phaseItemKey: ftaKey,
          category: 'fta_contact',
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Failed to save')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    marginTop: 4, width: '100%', padding: '8px 10px',
    background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#ffffff', fontSize: 12, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, color: '#9BB0C4',
    textTransform: 'uppercase' as const, letterSpacing: '0.1em',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#132238', border: '1px solid rgba(201,169,110,0.15)',
        borderRadius: 8, width: '100%', maxWidth: 520, padding: 24,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>Log Field Training</div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>{ftaLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#6B8299" />
          </button>
        </div>

        {trainerName && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
            padding: '8px 12px', background: 'rgba(201,169,110,0.06)',
            border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4,
          }}>
            <UserCheck size={14} color="#C9A96E" />
            <span style={{ fontSize: 11, color: '#C9A96E' }}>Training with: {trainerName}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g., John Smith" style={inp} />
          </div>
          <div>
            <label style={lbl}>Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Time Zone</label>
            <select value={form.timeZone} onChange={e => set('timeZone', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="">Select</option>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Age</label>
            <input value={form.age} onChange={e => set('age', e.target.value)} placeholder="e.g., 30s" style={inp} />
          </div>
          <div>
            <label style={lbl}>Occupation</label>
            <input value={form.occupation} onChange={e => set('occupation', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={10} color="#9BB0C4" /> Appt Date
            </label>
            <input type="datetime-local" value={form.appointmentDate} onChange={e => set('appointmentDate', e.target.value)} style={inp} />
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 16, paddingTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.married} onChange={e => set('married', e.target.checked)} /> Married
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.children} onChange={e => set('children', e.target.checked)} /> Children
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.homeowner} onChange={e => set('homeowner', e.target.checked)} /> Homeowner
            </label>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="How did the appointment go?" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        {error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 4, fontSize: 12,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            color: '#9BB0C4', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700,
            background: '#C9A96E', border: 'none', color: '#142D48',
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Saving...' : 'Log Training'}</button>
        </div>
      </div>
    </div>
  )
}
