'use client'

import { useState } from 'react'
import { X, UserCheck, Calendar } from 'lucide-react'

interface Props {
  ftaKey: string
  ftaLabel: string
  trainerName?: string | null
  defaultName?: string
  onClose: () => void
  onSaved: () => void
}

export default function FTALogModal({ ftaKey, ftaLabel, trainerName, defaultName, onClose, onSaved }: Props) {
  const [name, setName] = useState(defaultName ?? '')
  const [email, setEmail] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/agents/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          appointmentDate: date || undefined,
          notes: notes.trim() || undefined,
          phaseItemKey: ftaKey,
          occupation: 'FTA Contact',
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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#132238', border: '1px solid rgba(201,169,110,0.15)',
        borderRadius: 8, width: '100%', maxWidth: 420, padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>Log FTA</div>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9BB0C4', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
              Who is this appointment with?
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., John Smith"
              style={{
                marginTop: 4, width: '100%', padding: '10px 12px',
                background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                borderRadius: 4, color: '#ffffff', fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9BB0C4', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
              Email (optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="partner@email.com"
              style={{
                marginTop: 4, width: '100%', padding: '10px 12px',
                background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                borderRadius: 4, color: '#ffffff', fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9BB0C4', textTransform: 'uppercase' as const, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={11} color="#9BB0C4" /> Appointment Date
            </label>
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                marginTop: 4, width: '100%', padding: '10px 12px',
                background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                borderRadius: 4, color: '#ffffff', fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#9BB0C4', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="How did it go?"
              style={{
                marginTop: 4, width: '100%', padding: '10px 12px',
                background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
                borderRadius: 4, color: '#ffffff', fontSize: 13, resize: 'vertical',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {error && <div style={{ fontSize: 11, color: '#f87171' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 4, fontSize: 12,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9BB0C4', cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              background: '#C9A96E', border: 'none', color: '#142D48',
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
