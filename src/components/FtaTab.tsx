'use client'

import { useEffect, useState, useCallback } from 'react'
import DateTimePicker from './DateTimePicker'
import { CallButton } from './ContactActions'
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

type FtaStatus = 'SCHEDULED' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED' | 'NO_SHOW'

const STATUS_META: Record<FtaStatus, { label: string; color: string; bg: string }> = {
  SCHEDULED:   { label: 'Scheduled',   color: '#60A5FA', bg: 'rgba(96,165,250,0.10)' },
  RESCHEDULED: { label: 'Rescheduled', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  COMPLETED:   { label: 'Completed',   color: '#4ADE80', bg: 'rgba(74,222,128,0.10)' },
  CANCELLED:   { label: 'Cancelled',   color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
  NO_SHOW:     { label: 'No-Show',     color: '#9BB0C4', bg: 'rgba(155,176,196,0.10)' },
}

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
  status: FtaStatus
  outcomeNotes: string | null
  originalDate: string | null
  completedAt: string | null
  cancelledAt: string | null
  businessPartner: { id: string; name: string; phone: string | null; occupation: string | null; category: string | null } | null
}

interface FtaContactOption {
  id: string
  name: string
  phone: string | null
  occupation: string | null
}

export default function FtaTab({ isMobile }: { isMobile: boolean }) {
  const [ftas, setFtas] = useState<Fta[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetch('/api/agents/fta')
      .then(r => r.ok ? r.json() : { ftas: [] })
      .then((d: { ftas: Fta[] }) => { setFtas(d.ftas ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const setStatus = async (id: string, status: FtaStatus) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/agents/fta/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) refresh()
    } finally { setBusyId(null) }
  }

  const reschedule = async (id: string) => {
    const next = window.prompt('New appointment date (YYYY-MM-DDTHH:MM, local time):')
    if (!next) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/agents/fta/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESCHEDULED', appointmentDate: next }),
      })
      if (res.ok) refresh()
    } finally { setBusyId(null) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this appointment record entirely? Use Cancel/No-show if you just want to mark it as didn\'t happen.')) return
    const res = await fetch(`/api/agents/fta/${id}`, { method: 'DELETE' })
    if (res.ok) refresh()
  }

  // Bucket the appointments. Upcoming = future-dated, not in a terminal
  // state. Awaiting outcome = past-dated, still showing as scheduled or
  // rescheduled (the agent hasn't told us yet whether it actually happened).
  const now = Date.now()
  const upcoming  = ftas.filter(f => (f.status === 'SCHEDULED' || f.status === 'RESCHEDULED') && new Date(f.appointmentDate).getTime() >= now).sort((a,b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime())
  const awaiting  = ftas.filter(f => (f.status === 'SCHEDULED' || f.status === 'RESCHEDULED') && new Date(f.appointmentDate).getTime() <  now).sort((a,b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime())
  const completed = ftas.filter(f => f.status === 'COMPLETED').sort((a,b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime())
  const noShow    = ftas.filter(f => f.status === 'CANCELLED' || f.status === 'NO_SHOW').sort((a,b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime())

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={sectionLabel}>Field Training Appointments</div>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Schedule FTA'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#6B8299', marginBottom: 18, lineHeight: 1.5 }}>
        Track every booked appointment. Only <strong style={{ color: '#4ade80' }}>Completed</strong> ones count toward your Phase 2 Field Training checklist, so mark them as soon as they happen, and use Reschedule or Cancel if plans change.
      </p>

      {showForm && <FtaForm isMobile={isMobile} onSaved={() => { refresh(); setShowForm(false) }} />}

      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> : (
        <>
          <CountSummary completed={completed.length} />
          <Section title="Upcoming"          count={upcoming.length}  rows={upcoming}  busyId={busyId} onSetStatus={setStatus} onReschedule={reschedule} onDelete={remove} kind="upcoming"  />
          <Section title="Awaiting outcome"  count={awaiting.length}  rows={awaiting}  busyId={busyId} onSetStatus={setStatus} onReschedule={reschedule} onDelete={remove} kind="awaiting"  />
          <Section title="Completed"         count={completed.length} rows={completed} busyId={busyId} onSetStatus={setStatus} onReschedule={reschedule} onDelete={remove} kind="completed" />
          <Section title="Cancelled / No-show" count={noShow.length}  rows={noShow}    busyId={busyId} onSetStatus={setStatus} onReschedule={reschedule} onDelete={remove} kind="terminal"  />
          {ftas.length === 0 && (
            <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
              No appointments yet. Tap &ldquo;+ Schedule FTA&rdquo; to add your first.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CountSummary({ completed }: { completed: number }) {
  const target = 10
  const pct = Math.min(100, Math.round((completed / target) * 100))
  return (
    <div style={{ marginBottom: 22, padding: '12px 14px', background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.18)', borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#9BB0C4', letterSpacing: '0.06em' }}>
          Toward your 10 Field Trainings
        </div>
        <div style={{ fontSize: 13, color: '#4ADE80', fontWeight: 700 }}>
          {completed} / {target}
        </div>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#4ADE80', borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function Section({
  title, count, rows, busyId, kind, onSetStatus, onReschedule, onDelete,
}: {
  title: string
  count: number
  rows: Fta[]
  busyId: string | null
  kind: 'upcoming' | 'awaiting' | 'completed' | 'terminal'
  onSetStatus: (id: string, s: FtaStatus) => void
  onReschedule: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (count === 0) return null
  const accentByKind: Record<typeof kind, string> = {
    upcoming: '#60A5FA', awaiting: '#F59E0B', completed: '#4ADE80', terminal: '#9BB0C4',
  }
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ ...sectionLabel, fontSize: 9, color: accentByKind[kind], marginBottom: 8 }}>
        {title} &middot; {count}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(f => {
          const meta = STATUS_META[f.status]
          const busy = busyId === f.id
          const dateStr = new Date(f.appointmentDate).toLocaleString()
          const origStr = f.originalDate ? new Date(f.originalDate).toLocaleString() : null
          return (
            <div key={f.id} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>
                    {f.businessPartner?.name ?? f.name}
                    {f.businessPartner && (
                      <span title="Linked to an FTA contact in your book" style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9B6DFF', padding: '1px 6px', borderRadius: 999, background: 'rgba(155,109,255,0.10)', border: '1px solid rgba(155,109,255,0.3)' }}>
                        Linked
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>
                      {dateStr}
                      {origStr && origStr !== dateStr && (
                        <span style={{ color: '#6B8299', marginLeft: 6 }}>(orig {origStr})</span>
                      )}
                      {(f.businessPartner?.phone ?? f.phone) && <span style={{ color: '#6B8299' }}> &middot; {f.businessPartner?.phone ?? f.phone}</span>}
                    </span>
                    <CallButton phone={f.businessPartner?.phone ?? f.phone} size="sm" />
                  </div>
                  {f.outcomeNotes && (
                    <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 4, fontStyle: 'italic' }}>&ldquo;{f.outcomeNotes}&rdquo;</div>
                  )}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '3px 8px', borderRadius: 999, color: meta.color, background: meta.bg, border: `1px solid ${meta.color}40`,
                }}>{meta.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {f.status !== 'COMPLETED' && (
                  <ActionButton color="#4ADE80" onClick={() => onSetStatus(f.id, 'COMPLETED')} disabled={busy}>Mark completed</ActionButton>
                )}
                {(f.status === 'SCHEDULED' || f.status === 'RESCHEDULED') && (
                  <ActionButton color="#F59E0B" onClick={() => onReschedule(f.id)} disabled={busy}>Reschedule</ActionButton>
                )}
                {f.status !== 'CANCELLED' && f.status !== 'NO_SHOW' && (
                  <>
                    <ActionButton color="#EF4444" onClick={() => onSetStatus(f.id, 'CANCELLED')} disabled={busy}>Cancel</ActionButton>
                    <ActionButton color="#9BB0C4" onClick={() => onSetStatus(f.id, 'NO_SHOW')} disabled={busy}>No-show</ActionButton>
                  </>
                )}
                {(f.status === 'CANCELLED' || f.status === 'NO_SHOW' || f.status === 'COMPLETED') && (
                  <ActionButton color="#60A5FA" onClick={() => onSetStatus(f.id, 'SCHEDULED')} disabled={busy}>Reopen</ActionButton>
                )}
                <ActionButton color="#6B8299" onClick={() => onDelete(f.id)} disabled={busy}>Delete</ActionButton>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActionButton({ children, color, disabled, onClick }: { children: React.ReactNode; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent', border: `1px solid ${color}40`,
        color, borderRadius: 4, padding: '4px 10px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}
    >{children}</button>
  )
}

function FtaForm({ isMobile, onSaved }: { isMobile: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    businessPartnerId: '',
    name: '', phone: '', timeZone: '', age: '', married: '', children: '', homeowner: '',
    occupation60kPlus: '', appointmentDate: '', notes: '', category: '',
  })
  const [contacts, setContacts] = useState<FtaContactOption[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pull the agent's FTA-classified contacts so the form can offer them
  // as the first thing to pick. Falls back to manual entry if they
  // haven't classified anyone yet (or want a one-off).
  useEffect(() => {
    fetch('/api/agents/partners?category=fta_contact')
      .then(r => r.ok ? r.json() : { partners: [] })
      .then((d: { partners?: FtaContactOption[] }) => setContacts(d.partners ?? []))
      .catch(() => setContacts([]))
      .finally(() => setContactsLoading(false))
  }, [])

  const pickContact = (id: string) => {
    if (!id) {
      setForm(f => ({ ...f, businessPartnerId: '', name: '', phone: '' }))
      return
    }
    const c = contacts.find(x => x.id === id)
    if (!c) return
    setForm(f => ({
      ...f,
      businessPartnerId: id,
      name: c.name,
      phone: c.phone ?? '',
    }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.businessPartnerId && !form.name.trim()) {
      setError('Pick an FTA contact or enter a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { ...form }
      if (!body.businessPartnerId) delete body.businessPartnerId
      // Auto-complete back-logged FTAs. If the agent picks an
      // appointment date in the past, treat this as a record of a
      // completed appointment, not a future booking. The server fires
      // the same auto-tick on the Phase 2 fta_N checklist item that
      // the PATCH-to-COMPLETED path does, so the checklist stays in
      // sync without making the agent click "Mark completed" as a
      // second step. Mercedes (D2161) flagged this on 2026-05-06.
      if (typeof body.appointmentDate === 'string' && body.appointmentDate) {
        const when = new Date(body.appointmentDate)
        if (!isNaN(when.getTime()) && when.getTime() <= Date.now()) {
          body.status = 'COMPLETED'
        }
      }
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
      {/* FTA contact picker. Pulls from the agent's classified
          fta_contact BPs. Picking one auto-fills name + phone but
          leaves them editable in case the agent wants to override. */}
      <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(155,109,255,0.05)', border: '1px solid rgba(155,109,255,0.2)', borderRadius: 6 }}>
        <label style={fieldLabel}>FTA Contact</label>
        {contactsLoading ? (
          <div style={{ color: '#6B8299', fontSize: 11 }}>Loading your contacts...</div>
        ) : contacts.length === 0 ? (
          <div style={{ color: '#6B8299', fontSize: 11, lineHeight: 1.5 }}>
            No FTA contacts yet. Classify someone in the Partners / FTA tab as an FTA contact first, or enter a name below for a one-off.
          </div>
        ) : (
          <select
            value={form.businessPartnerId}
            onChange={e => pickContact(e.target.value)}
            style={inputStyle}
          >
            <option value="">Choose from your FTA contacts...</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.occupation ? ` · ${c.occupation}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={grid}>
        <div><label style={fieldLabel}>Name {form.businessPartnerId ? '' : '*'}</label><input required={!form.businessPartnerId} style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
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
