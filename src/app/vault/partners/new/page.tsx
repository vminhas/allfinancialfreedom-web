'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// Hand off a lead to an agent. Vick (or another leader) meets someone at
// a conference, picks the receiving agent, fills in the contact details,
// and the row lands in that agent's Business Partners list as if they'd
// added it themselves. Avoids giving leadership their own AgentProfiles
// just to track contacts that ultimately need to be worked by a producer.

interface AgentOption {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
}

const PHASE_TITLE: Record<number, string> = {
  1: 'Getting Started', 2: 'Field Training', 3: 'CFT', 4: 'MD', 5: 'EMD',
}

// Categories mirror what the agent-side BP form uses. PARTNER_PROSPECT and
// FTA_CONTACT are the two most common destinations for a leadership
// hand-off. Business Partner covers both recruit prospects and
// financial-services leads (same pipeline in practice).
const CATEGORIES: Array<{ value: string; label: string; help: string }> = [
  { value: 'business_partner_prospect', label: 'Business Partner Prospect', help: 'Potential team or financial-services prospect.' },
  { value: 'fta_contact', label: 'FTA Contact', help: 'Field Training Appointment candidate.' },
  { value: '', label: 'Leave for agent to classify', help: 'Lands in their queue as PENDING.' },
]

const EMPTY_FORM = {
  name: '', email: '', phone: '', timeZone: '', age: '',
  married: false, children: false, homeowner: false,
  occupation: '', characterTraits: '',
  category: 'business_partner_prospect',
  appointmentDate: '', firstCallDate: '', secondCallDate: '',
  bookedAppt: false, notes: '',
}

export default function NewPartnerHandoffPage() {
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [agentSearch, setAgentSearch] = useState('')
  const [agentId, setAgentId] = useState<string>('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Recently-saved partners shown as a confirmation log so the admin
  // doesn't lose track when handing off a stack of leads in one sitting.
  const [recentlyAdded, setRecentlyAdded] = useState<Array<{ id: string; name: string; agentName: string }>>([])

  useEffect(() => {
    fetch('/api/admin/partners')
      .then(r => r.json() as Promise<{ agents: AgentOption[] }>)
      .then(d => setAgents(d.agents ?? []))
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false))
  }, [])

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase()
    if (!q) return agents
    return agents.filter(a => {
      const full = `${a.firstName} ${a.lastName}`.toLowerCase()
      return full.includes(q) || a.agentCode.toLowerCase().includes(q)
    })
  }, [agents, agentSearch])

  const selectedAgent = agents.find(a => a.id === agentId) ?? null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId) {
      setError('Pick an agent to assign this lead to.')
      return
    }
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentProfileId: agentId, ...form, category: form.category || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `${res.status}`)
      }
      const partner = await res.json() as { id: string; name: string }
      setRecentlyAdded(prev => [
        { id: partner.id, name: partner.name, agentName: selectedAgent ? `${selectedAgent.firstName} ${selectedAgent.lastName}` : '' },
        ...prev,
      ].slice(0, 8))
      // Keep the agent picker selection so a leader handing off five leads
      // to the same agent doesn't have to re-pick every time. Only the
      // contact fields reset.
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 36px) clamp(16px, 4vw, 32px)', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>
          Lead Hand-off
        </p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0, lineHeight: 1.1 }}>
          Assign a Business Partner to an agent
        </h1>
        <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5, maxWidth: 640 }}>
          Use this when a leader meets someone in the field and wants to hand the lead off to a specific producing agent. The contact lands in that agent&apos;s Business Partners tab and they can run with it.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Pick the receiving agent. */}
        <Section title="Step 1 · Receiving agent" subtitle="Whose Business Partners list should this lead go into?">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 220 }}>
              <Label>Search by name or code</Label>
              <input
                type="text"
                value={agentSearch}
                onChange={e => setAgentSearch(e.target.value)}
                placeholder="Mercedes Grubb, D2161, etc."
                style={inputStyle}
                disabled={agentsLoading}
              />
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 220 }}>
              <Label>Agent {agentsLoading ? '(loading...)' : `(${filteredAgents.length} match${filteredAgents.length === 1 ? '' : 'es'})`}</Label>
              <select
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
                style={inputStyle}
                disabled={agentsLoading}
                size={Math.min(8, Math.max(3, filteredAgents.length))}
              >
                <option value="">{agentsLoading ? 'Loading agents...' : 'Pick an agent'}</option>
                {filteredAgents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.lastName}, {a.firstName} &middot; {a.agentCode} &middot; {PHASE_TITLE[a.phase] ?? `Phase ${a.phase}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedAgent && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'rgba(201,169,110,0.08)',
              border: '1px solid rgba(201,169,110,0.3)',
              borderRadius: 6,
              fontSize: 12, color: '#E0C485',
            }}>
              Lead will be assigned to <strong>{selectedAgent.firstName} {selectedAgent.lastName}</strong> ({selectedAgent.agentCode}, {PHASE_TITLE[selectedAgent.phase] ?? `Phase ${selectedAgent.phase}`}).
            </div>
          )}
        </Section>

        {/* Step 2: Contact details. Mirrors the agent-side BP form's
            field set so handed-off rows are indistinguishable from
            agent-authored rows once they arrive. */}
        <Section title="Step 2 · Contact details" subtitle="Only the name is required. Fill in whatever you have.">
          <Grid cols={2}>
            <Field label="Full name" required>
              <input type="text" value={form.name} onChange={e => setField('name', e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Time zone">
              <input type="text" value={form.timeZone} onChange={e => setField('timeZone', e.target.value)} placeholder="ET, CT, MT, PT" style={inputStyle} />
            </Field>
            <Field label="Age">
              <input type="text" value={form.age} onChange={e => setField('age', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Occupation">
              <input type="text" value={form.occupation} onChange={e => setField('occupation', e.target.value)} style={inputStyle} />
            </Field>
          </Grid>

          <Grid cols={3} style={{ marginTop: 10 }}>
            <Toggle label="Married" value={form.married} onChange={v => setField('married', v)} />
            <Toggle label="Has children" value={form.children} onChange={v => setField('children', v)} />
            <Toggle label="Homeowner" value={form.homeowner} onChange={v => setField('homeowner', v)} />
          </Grid>

          <Field label="Character traits" style={{ marginTop: 10 }}>
            <input type="text" value={form.characterTraits} onChange={e => setField('characterTraits', e.target.value)} placeholder="Driven, family-first, business-minded..." style={inputStyle} />
          </Field>

          <Field label="Notes" style={{ marginTop: 10 }}>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              rows={3}
              placeholder="Where you met, what they're looking for, anything the agent should know."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 70, fontFamily: 'inherit' }}
            />
          </Field>
        </Section>

        {/* Step 3: Category controls which tab/lane the row lands in. */}
        <Section title="Step 3 · Classification" subtitle="Pre-classify so the agent doesn't have to.">
          <div style={{ display: 'grid', gap: 8 }}>
            {CATEGORIES.map(cat => (
              <label
                key={cat.value || 'none'}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '10px 12px',
                  background: form.category === cat.value ? 'rgba(201,169,110,0.10)' : 'rgba(0,0,0,0.15)',
                  border: `1px solid ${form.category === cat.value ? 'rgba(201,169,110,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 6, cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
              >
                <input
                  type="radio"
                  name="category"
                  value={cat.value}
                  checked={form.category === cat.value}
                  onChange={() => setField('category', cat.value)}
                  style={{ marginTop: 3, accentColor: '#C9A96E' }}
                />
                <div>
                  <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>{cat.label}</div>
                  <div style={{ color: '#6B8299', fontSize: 11, marginTop: 2 }}>{cat.help}</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 12,
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.4)',
            borderRadius: 6,
            color: '#fca5a5', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={saving || !agentId || !form.name.trim()}
            style={{
              padding: '10px 22px',
              background: saving || !agentId || !form.name.trim()
                ? 'rgba(201,169,110,0.3)'
                : 'linear-gradient(180deg, #E0C485 0%, #C9A96E 100%)',
              color: '#142D48', fontSize: 12, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.12em',
              border: 'none', borderRadius: 5,
              cursor: saving || !agentId || !form.name.trim() ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {saving ? 'Assigning...' : 'Assign lead'}
          </button>
          <Link
            href="/vault/tracker"
            style={{ color: '#9BB0C4', fontSize: 12, textDecoration: 'none', padding: '10px 14px' }}
          >
            Done, back to tracker
          </Link>
        </div>
      </form>

      {recentlyAdded.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
            Just assigned
          </div>
          <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.12)', overflow: 'hidden' }}>
            {recentlyAdded.map(r => (
              <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#ffffff', fontSize: 13 }}>{r.name}</span>
                <span style={{ color: '#9BB0C4', fontSize: 11 }}>to {r.agentName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Form atoms ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(0,0,0,0.25)',
  color: '#ffffff',
  fontSize: 13,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  outline: 'none',
  fontFamily: 'inherit',
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 16, marginBottom: 16,
      background: '#142D48', borderRadius: 8,
      border: '1px solid rgba(201,169,110,0.12)',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#ffffff', fontSize: 14, fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ color: '#6B8299', fontSize: 11, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#9BB0C4', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{children}</div>
}

function Field({ label, required, style, children }: { label: string; required?: boolean; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={style}>
      <Label>{label}{required && <span style={{ color: '#C9A96E', marginLeft: 3 }}>*</span>}</Label>
      {children}
    </div>
  )
}

function Grid({ cols, style, children }: { cols: number; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 3 ? 160 : 220}px, 1fr))`,
      gap: 10,
      ...style,
    }}>
      {children}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px',
      background: 'rgba(0,0,0,0.25)',
      border: `1px solid ${value ? 'rgba(201,169,110,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 4, cursor: 'pointer',
      fontSize: 12, color: value ? '#E0C485' : '#9BB0C4',
    }}>
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: '#C9A96E' }}
      />
      {label}
    </label>
  )
}
