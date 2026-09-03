'use client'

import { useEffect, useRef, useState } from 'react'
import { X, UserCheck, Calendar } from 'lucide-react'
import DateTimePicker from './DateTimePicker'

const TIMEZONES = ['EST', 'CST', 'MST', 'PST', 'HST', 'AKST'] as const

interface Props {
  ftaKey: string
  ftaLabel: string
  trainerName?: string | null
  defaultName?: string
  previewToken?: string | null
  onClose: () => void
  onSaved: () => void
}

interface FtaContactOption {
  id: string
  name: string
  phone: string | null
  occupation: string | null
}

// Records a Field Training Appointment that already happened. Two
// modes: pick an existing FTA contact (BusinessPartner where
// category='fta_contact') or add a new one inline. Either way the
// final write is a FieldTrainingAppointment in COMPLETED status,
// which auto-ticks the next fta_N item in the agent's Phase 2
// checklist via the existing PATCH side-effect.
export default function FTALogModal({ ftaLabel, trainerName, defaultName, previewToken, onClose, onSaved }: Props) {
  const withPreview = (url: string) => previewToken
    ? `${url}${url.includes('?') ? '&' : '?'}preview=${encodeURIComponent(previewToken)}`
    : url
  const [contacts, setContacts] = useState<FtaContactOption[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [mode, setMode] = useState<'pick' | 'new'>('pick')
  const [pickedContactId, setPickedContactId] = useState('')

  // New-contact form fields. Only used when mode === 'new'.
  const [form, setForm] = useState({
    name: defaultName ?? '',
    phone: '',
    timeZone: '',
    age: '',
    married: false,
    children: false,
    homeowner: false,
    occupation: '',
  })
  const [appointmentDate, setAppointmentDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  // Pull the agent's classified FTA contacts so the picker has data.
  // If none exist yet we flip the form into "new contact" mode by
  // default so the agent isn't stuck staring at an empty dropdown.
  useEffect(() => {
    fetch(withPreview('/api/agents/partners?category=fta_contact'))
      .then(r => r.ok ? r.json() : { partners: [] })
      .then((d: { partners?: FtaContactOption[] }) => {
        const list = d.partners ?? []
        setContacts(list)
        if (list.length === 0) setMode('new')
      })
      .catch(() => setContacts([]))
      .finally(() => setContactsLoaded(true))
  }, [])

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (savingRef.current) return
    if (!appointmentDate) { setError('Pick an appointment date / time'); return }
    if (mode === 'pick' && !pickedContactId) { setError('Pick an FTA contact'); return }
    if (mode === 'new' && !form.name.trim()) { setError('Name is required'); return }

    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      let businessPartnerId = pickedContactId

      // Create a BusinessPartner first if the agent is adding a new
      // contact. Stamp it as fta_contact so it shows up in the picker
      // for next time.
      if (mode === 'new') {
        const bpRes = await fetch(withPreview('/api/agents/partners'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone || undefined,
            timeZone: form.timeZone || undefined,
            age: form.age || undefined,
            married: form.married,
            children: form.children,
            homeowner: form.homeowner,
            occupation: form.occupation || undefined,
            category: 'fta_contact',
          }),
        })
        if (!bpRes.ok) {
          const d = await bpRes.json().catch(() => ({})) as { error?: string }
          setError(d.error ?? 'Failed to add contact')
          return
        }
        const bp = await bpRes.json() as { id: string }
        businessPartnerId = bp.id
      }

      // Create the FTA itself (initially SCHEDULED).
      const ftaRes = await fetch(withPreview('/api/agents/fta'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessPartnerId,
          appointmentDate,
          notes: notes.trim() || undefined,
        }),
      })
      if (!ftaRes.ok) {
        const d = await ftaRes.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Failed to log FTA')
        return
      }
      const { fta } = await ftaRes.json() as { fta: { id: string } }

      // Flip to COMPLETED. PATCH triggers the auto-tick that fills the
      // lowest unchecked fta_N Phase 2 item, so the agent's checklist
      // reflects this appointment without a second manual click.
      await fetch(withPreview(`/api/agents/fta/${fta.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })

      onSaved()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    marginTop: 4, width: '100%', padding: '8px 10px',
    background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#ffffff', fontSize: 12, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, color: '#9BB0C4',
    textTransform: 'uppercase' as const, letterSpacing: '0.1em',
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 10px', borderRadius: 4,
    background: active ? 'rgba(201,169,110,0.15)' : 'transparent',
    border: `1px solid ${active ? 'rgba(201,169,110,0.4)' : 'rgba(255,255,255,0.08)'}`,
    color: active ? '#C9A96E' : '#9BB0C4',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    cursor: 'pointer',
  })

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

        {/* Mode tabs: pick existing FTA contact, or add a new one */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setMode('pick')}
            disabled={contacts.length === 0}
            style={{ ...tabBtn(mode === 'pick'), opacity: contacts.length === 0 ? 0.5 : 1 }}
          >
            Pick from your contacts {contactsLoaded && contacts.length > 0 && `(${contacts.length})`}
          </button>
          <button type="button" onClick={() => setMode('new')} style={tabBtn(mode === 'new')}>
            + New contact
          </button>
        </div>

        {mode === 'pick' && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>FTA Contact *</label>
            {contactsLoaded && contacts.length === 0 ? (
              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
                No FTA contacts yet. Switch to <strong style={{ color: '#C9A96E' }}>+ New contact</strong> above to add one inline; it&apos;ll be saved to your book for next time.
              </div>
            ) : (
              <select
                value={pickedContactId}
                onChange={e => setPickedContactId(e.target.value)}
                style={{ ...inp, cursor: 'pointer' }}
              >
                <option value="">Choose...</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.occupation ? ` · ${c.occupation}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {mode === 'new' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. John Smith" style={inp} />
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
              <input value={form.age} onChange={e => set('age', e.target.value)} placeholder="e.g. 30s" style={inp} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={lbl}>Occupation</label>
              <input value={form.occupation} onChange={e => set('occupation', e.target.value)} style={inp} />
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
          </div>
        )}

        {/* Common appointment fields shared by both modes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={10} color="#9BB0C4" /> Appt Date *
            </label>
            <DateTimePicker value={appointmentDate} onChange={setAppointmentDate} required />
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="How did the appointment go?" style={{ ...inp, resize: 'vertical' }} />
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
