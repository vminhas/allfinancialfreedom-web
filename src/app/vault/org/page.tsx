'use client'

import { useEffect, useState, useCallback } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface OrgNode {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  title: string
  state: string | null
  avatarUrl: string | null
  status: string
  recruiterId: string | null
  cft: string | null
  children: OrgNode[]
}

interface OrgData {
  tree: OrgNode[]
  stats: {
    totalAgents: number
    byPhase: { phase: number; title: string; count: number }[]
  }
}

const PHASE_COLORS: Record<number, string> = {
  1: '#C9A96E', 2: '#60a5fa', 3: '#f59e0b', 4: '#9B6DFF', 5: '#4ade80', 6: '#C9A96E',
}

const PHASE_TITLES: Record<number, string> = {
  1: 'Agent', 2: 'Associate', 3: 'Certified Field Trainer',
  4: 'Marketing Director', 5: 'Executive Marketing Director',
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

function initials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase()
}

function countDescendants(node: OrgNode): number {
  let count = node.children.length
  for (const c of node.children) count += countDescendants(c)
  return count
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
  borderRadius: 4, color: '#d1d9e2', padding: '10px 12px', fontSize: 13,
  fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
  textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5,
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, onSelect, showTrainers }: {
  node: OrgNode
  depth: number
  onSelect: (node: OrgNode) => void
  showTrainers: boolean
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const color = PHASE_COLORS[node.phase] ?? '#C9A96E'
  const descendantCount = countDescendants(node)
  const isMobile = useIsMobile()
  const isLeadership = node.id.startsWith('_')

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 0 }}>
      {depth > 0 && !isMobile && (
        <div style={{ width: 32, minWidth: 32, borderBottom: `2px solid ${color}40`, alignSelf: 'flex-start', marginTop: 28 }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: isLeadership ? '14px 18px' : '10px 14px',
            background: isLeadership ? '#1B3A5C' : '#132238',
            border: `1px solid ${isLeadership ? '#C9A96E50' : `${color}30`}`,
            borderRadius: 8,
            cursor: 'pointer',
            minWidth: isMobile ? '100%' : isLeadership ? 260 : 220,
            marginLeft: isMobile ? depth * 16 : 0,
            transition: 'border-color 0.15s, background 0.15s',
            boxShadow: isLeadership ? '0 0 20px rgba(201,169,110,0.1)' : 'none',
          }}
          onClick={e => {
            if (!isLeadership) { e.stopPropagation(); onSelect(node) }
            else if (node.children.length > 0) setExpanded(!expanded)
          }}
        >
          <div style={{
            width: isLeadership ? 44 : 36, height: isLeadership ? 44 : 36, borderRadius: '50%',
            background: node.avatarUrl ? `url(${node.avatarUrl}) center/cover` : `${color}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isLeadership ? 14 : 12, fontWeight: 700, color, flexShrink: 0,
            border: `2px solid ${isLeadership ? '#C9A96E' : `${color}40`}`,
          }}>
            {!node.avatarUrl && initials(node.firstName, node.lastName)}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.firstName} {node.lastName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 6px', borderRadius: 3,
                background: `${color}18`, border: `1px solid ${color}35`, color,
              }}>
                {node.title}
              </span>
              {node.state && <span style={{ fontSize: 9, color: '#6B8299' }}>{node.state}</span>}
            </div>
            {showTrainers && node.cft && (
              <div style={{ fontSize: 9, color: '#9B6DFF', marginTop: 2 }}>
                Trainer: {node.cft}
              </div>
            )}
          </div>

          {node.children.length > 0 && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '4px' }}
              onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
            >
              <span style={{ fontSize: 9, color: '#6B8299', fontWeight: 600 }}>{descendantCount}</span>
              <span style={{ fontSize: 10, color: '#6B8299', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          )}
        </div>

        {expanded && node.children.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6,
            paddingLeft: isMobile ? 0 : 16,
            borderLeft: isMobile ? 'none' : `2px solid ${color}20`,
          }}>
            {node.children.map(child => (
              <TreeNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} showTrainers={showTrainers} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit Panel ───────────────────────────────────────────────────────────────

function EditPanel({ node, allAgents, onSave, onClose }: {
  node: OrgNode
  allAgents: { agentCode: string; firstName: string; lastName: string }[]
  onSave: () => void
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    firstName: node.firstName,
    lastName: node.lastName,
    phase: node.phase,
    state: node.state ?? '',
    recruiterId: node.recruiterId ?? '',
    cft: node.cft ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch(`/api/admin/agents/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phase: parseInt(String(form.phase)),
          state: form.state || null,
          recruiterId: form.recruiterId || null,
          cft: form.cft || null,
        }),
      })
      if (!res.ok) { setError('Failed to save'); setSaving(false); return }
      setSaved(true)
      onSave()
      setTimeout(() => setSaved(false), 2000)
    } catch { setError('Network error') }
    setSaving(false)
  }

  const color = PHASE_COLORS[node.phase] ?? '#C9A96E'

  return (
    <div style={{
      position: 'fixed',
      top: 0, right: 0, bottom: 0,
      width: isMobile ? '100%' : 380,
      background: '#142D48',
      borderLeft: '1px solid rgba(201,169,110,0.15)',
      zIndex: 50,
      display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: node.avatarUrl ? `url(${node.avatarUrl}) center/cover` : `${color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color, border: `2px solid ${color}40`,
          }}>
            {!node.avatarUrl && initials(node.firstName, node.lastName)}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 2 }}>Edit Agent</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>{node.firstName} {node.lastName}</div>
            <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>{node.agentCode}</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,169,110,0.25)',
          borderRadius: 6, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#C9A96E', fontSize: 14,
        }}>✕</button>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>First Name</label>
            <input value={form.firstName} onChange={set('firstName')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input value={form.lastName} onChange={set('lastName')} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Phase / Title</label>
          <select value={form.phase} onChange={set('phase')} style={{ ...inputStyle, appearance: 'auto' }}>
            {[1,2,3,4,5].map(p => (
              <option key={p} value={p}>Phase {p} — {PHASE_TITLES[p]}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>State</label>
          <select value={form.state} onChange={set('state')} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="">—</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Reports To (Mentor)</label>
          <select value={form.recruiterId} onChange={set('recruiterId')} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="">None (top level)</option>
            {allAgents.filter(a => a.agentCode !== node.agentCode).map(a => (
              <option key={a.agentCode} value={a.agentCode}>{a.firstName} {a.lastName} ({a.agentCode})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Trainer (CFT)</label>
          <input value={form.cft} onChange={set('cft')} placeholder="Trainer name" style={inputStyle} />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid rgba(201,169,110,0.1)',
        display: 'flex', gap: 10,
      }}>
        <button onClick={onClose} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
          color: '#9BB0C4', borderRadius: 4, padding: '12px 18px', fontSize: 11,
          fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', flex: 1,
        }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{
          background: saved ? 'rgba(74,222,128,0.2)' : saving ? 'rgba(201,169,110,0.4)' : '#C9A96E',
          color: saved ? '#4ade80' : '#142D48', border: saved ? '1px solid rgba(74,222,128,0.4)' : 'none',
          borderRadius: 4, padding: '12px 22px', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          cursor: saving ? 'wait' : 'pointer', flex: 2,
        }}>
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Add Agent Panel ──────────────────────────────────────────────────────────

function AddAgentPanel({ allAgents, defaultRecruiterId, onCreated, onClose }: {
  allAgents: { agentCode: string; firstName: string; lastName: string }[]
  defaultRecruiterId?: string
  onCreated: () => void
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', agentCode: '',
    state: '', phone: '', recruiterId: defaultRecruiterId ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName || !form.email || !form.agentCode) {
      setError('First name, last name, email, and agent code are required'); return
    }
    setSubmitting(true); setError('')

    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          agentCode: form.agentCode,
          state: form.state || undefined,
          phone: form.phone || undefined,
          recruiterId: form.recruiterId || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to create'); setSubmitting(false); return
      }
      onCreated()
    } catch {
      setError('Network error'); setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: isMobile ? '100%' : 380,
      background: '#142D48',
      borderLeft: '1px solid rgba(201,169,110,0.15)',
      zIndex: 50,
      display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>New Agent</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>Add to Team</div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,169,110,0.25)',
          borderRadius: 6, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#C9A96E', fontSize: 14,
        }}>✕</button>
      </div>

      <form onSubmit={submit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>First Name *</label>
            <input required value={form.firstName} onChange={set('firstName')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input required value={form.lastName} onChange={set('lastName')} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Email *</label>
          <input required type="email" value={form.email} onChange={set('email')} style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Agent Code *</label>
            <input required value={form.agentCode} onChange={set('agentCode')} placeholder="e.g. AFF1234" style={{ ...inputStyle, fontFamily: 'monospace' }} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={form.phone} onChange={set('phone')} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>State</label>
          <select value={form.state} onChange={set('state')} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="">—</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Reports To (Mentor)</label>
          <select value={form.recruiterId} onChange={set('recruiterId')} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="">None (top level)</option>
            {allAgents.map(a => (
              <option key={a.agentCode} value={a.agentCode}>{a.firstName} {a.lastName} ({a.agentCode})</option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: '#9BB0C4', borderRadius: 4, padding: '12px 18px', fontSize: 11,
            fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', flex: 1,
          }}>Cancel</button>
          <button type="submit" disabled={submitting} style={{
            background: submitting ? 'rgba(201,169,110,0.4)' : '#C9A96E',
            color: '#142D48', border: 'none', borderRadius: 4, padding: '12px 22px', fontSize: 11,
            fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: submitting ? 'wait' : 'pointer', flex: 2,
          }}>
            {submitting ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrgPage() {
  const [data, setData] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [showTrainers, setShowTrainers] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/agents/org-tree')
    if (res.ok) setData(await res.json() as OrgData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const allAgents = data ? flattenTree(data.tree) : []

  return (
    <div style={{ padding: isMobile ? '20px 16px' : '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
            Organization
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff', margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            Team Structure
          </h1>
          <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0' }}>
            Click any agent to edit. Changes sync to their portal automatically.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {data && data.stats.totalAgents === 0 && (
            <button
              onClick={async () => {
                setSeeding(true); setSeedResult(null)
                try {
                  const res = await fetch('/api/admin/agents/seed-org', { method: 'POST' })
                  const d = await res.json() as { created: number; updated: number; skipped: number; errors: string[] }
                  setSeedResult(`Created ${d.created}, updated ${d.updated}, skipped ${d.skipped}${d.errors.length ? ` (${d.errors.length} errors)` : ''}`)
                  load()
                } catch { setSeedResult('Failed') }
                setSeeding(false)
              }}
              disabled={seeding}
              style={{
                background: seeding ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.12)',
                color: '#4ade80',
                border: '1px solid rgba(74,222,128,0.35)',
                borderRadius: 4, padding: '12px 16px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', cursor: seeding ? 'wait' : 'pointer',
                minHeight: 44, whiteSpace: 'nowrap',
              }}
            >
              {seeding ? 'Seeding...' : 'Seed 57 Agents'}
            </button>
          )}
          {seedResult && (
            <span style={{ fontSize: 10, color: '#4ade80' }}>{seedResult}</span>
          )}
          <button
            onClick={() => setShowTrainers(!showTrainers)}
            style={{
              background: showTrainers ? 'rgba(155,109,255,0.15)' : 'transparent',
              color: showTrainers ? '#9B6DFF' : '#6B8299',
              border: `1px solid ${showTrainers ? 'rgba(155,109,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 4, padding: '12px 16px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              minHeight: 44, whiteSpace: 'nowrap',
            }}
          >
            {showTrainers ? '✓ Trainers' : 'Show Trainers'}
          </button>
          <button
            onClick={() => { setSelectedNode(null); setShowAddAgent(true) }}
            style={{
              background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4,
              padding: '12px 20px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              minHeight: 44, whiteSpace: 'nowrap',
            }}
          >
            + Add Agent
          </button>
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
          <div style={{ padding: '12px 18px', background: '#132238', borderRadius: 6, border: '1px solid rgba(201,169,110,0.12)' }}>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#fff', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{data.stats.totalAgents}</div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E' }}>Total Agents</div>
          </div>
          {data.stats.byPhase.filter(p => p.count > 0).map(p => (
            <div key={p.phase} style={{ padding: '12px 18px', background: '#132238', borderRadius: 6, border: `1px solid ${PHASE_COLORS[p.phase]}20` }}>
              <div style={{ fontSize: 22, fontWeight: 300, color: PHASE_COLORS[p.phase], fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{p.count}</div>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299' }}>{p.title}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tree */}
      {loading && <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center' }}>Loading team structure...</div>}

      {data && (
        <div style={{ overflowX: 'auto', padding: '20px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.tree.map(root => (
              <TreeNode key={root.id} node={root} depth={0} onSelect={n => { setShowAddAgent(false); setSelectedNode(n) }} showTrainers={showTrainers} />
            ))}
          </div>
        </div>
      )}

      {data && data.tree.length === 0 && !loading && (
        <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center' }}>
          No agents found. Click &quot;+ Add Agent&quot; to add your first team member.
        </div>
      )}

      {/* Backdrop */}
      {(selectedNode || showAddAgent) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
          onClick={() => { setSelectedNode(null); setShowAddAgent(false) }}
        />
      )}

      {/* Edit Panel */}
      {selectedNode && (
        <EditPanel
          key={selectedNode.id}
          node={selectedNode}
          allAgents={allAgents}
          onSave={() => { load(); setSelectedNode(null) }}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Add Agent Panel */}
      {showAddAgent && (
        <AddAgentPanel
          allAgents={allAgents}
          onCreated={() => { load(); setShowAddAgent(false) }}
          onClose={() => setShowAddAgent(false)}
        />
      )}
    </div>
  )
}

function flattenTree(nodes: OrgNode[]): { agentCode: string; firstName: string; lastName: string }[] {
  const result: { agentCode: string; firstName: string; lastName: string }[] = []
  function walk(n: OrgNode) {
    if (!n.id.startsWith('_')) result.push({ agentCode: n.agentCode, firstName: n.firstName, lastName: n.lastName })
    for (const c of n.children) walk(c)
  }
  for (const n of nodes) walk(n)
  return result
}
