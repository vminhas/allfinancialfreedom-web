'use client'

import { useEffect, useState, useCallback, useRef, type RefObject } from 'react'
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

interface LeadershipPerson {
  id: string
  firstName: string
  lastName: string
  title: string
  avatarUrl: string | null
}

interface OrgData {
  tree: OrgNode[]
  leadership: LeadershipPerson[]
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
  const f = (first ?? '').replace(/[^a-zA-Z]/g, '')
  const l = (last ?? '').replace(/[^a-zA-Z]/g, '')
  return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase()
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

interface FlatAgent { agentCode: string; firstName: string; lastName: string; phase: number }

// ─── Leadership Card ──────────────────────────────────────────────────────────

function LeadershipCard({ leaders, onUpdated }: { leaders: LeadershipPerson[]; onUpdated: () => void }) {
  const isMobile = useIsMobile()
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploading, setUploading] = useState<string | null>(null)

  const uploadAvatar = async (who: string, file: File) => {
    setUploading(who)
    const fd = new FormData()
    fd.append('who', who)
    fd.append('avatar', file)
    try {
      const res = await fetch('/api/admin/leadership-avatar', { method: 'POST', body: fd })
      if (res.ok) onUpdated()
    } catch { /* silent */ }
    setUploading(null)
  }

  return (
    <div style={{
      display: 'flex', gap: 16, flexWrap: 'wrap',
      padding: '20px 24px',
      background: '#1B3A5C',
      border: '1px solid rgba(201,169,110,0.3)',
      borderRadius: 12,
      boxShadow: '0 0 30px rgba(201,169,110,0.08)',
    }}>
      {leaders.map(leader => {
        const who = leader.id === '_vick' ? 'vick' : 'melinee'
        return (
          <div key={leader.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flex: isMobile ? '1 1 100%' : '1 1 auto' }}>
            <div
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => fileRefs.current[who]?.click()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {leader.avatarUrl ? (
                <img src={leader.avatarUrl} alt="" style={{
                  width: 52, height: 52, borderRadius: '50%', objectFit: 'cover',
                  border: '2px solid #C9A96E',
                }} />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'rgba(201,169,110,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: '#C9A96E',
                  border: '2px solid #C9A96E',
                }}>
                  {initials(leader.firstName, leader.lastName)}
                </div>
              )}
              <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 20, height: 20, borderRadius: '50%',
                background: '#C9A96E', color: '#142D48',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, border: '2px solid #1B3A5C',
              }}>
                {uploading === who ? '...' : '📷'}
              </div>
              <input
                ref={el => { fileRefs.current[who] = el }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(who, f) }}
              />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{leader.firstName} {leader.lastName}</div>
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 3,
                background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.35)', color: '#C9A96E',
              }}>
                {leader.title}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, onSelect, showTrainers, expandedSet, onAvatarUploaded }: {
  node: OrgNode
  depth: number
  onSelect: (node: OrgNode) => void
  showTrainers: boolean
  expandedSet: Set<string> | 'all'
  onAvatarUploaded: () => void
}) {
  const isExpanded = expandedSet === 'all' || expandedSet.has(node.id)
  const [localExpanded, setLocalExpanded] = useState(isExpanded)
  const color = PHASE_COLORS[node.phase] ?? '#C9A96E'
  const descendantCount = countDescendants(node)
  const isMobile = useIsMobile()
  const isLeadership = node.id.startsWith('_')
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('avatar', file)
    try {
      const res = await fetch(`/api/admin/agents/${node.id}/avatar`, { method: 'POST', body: fd })
      if (res.ok) onAvatarUploaded()
    } catch { /* silent */ }
    setUploading(false)
  }

  useEffect(() => {
    setLocalExpanded(expandedSet === 'all' || expandedSet.has(node.id))
  }, [expandedSet, node.id])

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 0 }}>
      {depth > 0 && !isMobile && (
        <div style={{ width: 32, minWidth: 32, borderBottom: `2px solid ${color}40`, alignSelf: 'flex-start', marginTop: 32 }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: isMobile ? '100%' : 'auto' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: isLeadership ? '16px 20px' : '12px 16px',
            background: isLeadership ? '#1B3A5C' : '#132238',
            border: `1px solid ${isLeadership ? '#C9A96E50' : `${color}30`}`,
            borderRadius: 10,
            cursor: 'pointer',
            minWidth: isMobile ? '100%' : isLeadership ? 280 : 240,
            marginLeft: isMobile ? depth * 16 : 0,
            transition: 'border-color 0.15s, background 0.15s',
            boxShadow: isLeadership ? '0 0 20px rgba(201,169,110,0.1)' : '0 2px 8px rgba(0,0,0,0.15)',
          }}
          onClick={e => { e.stopPropagation(); onSelect(node) }}
        >
          <div
            style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); avatarFileRef.current?.click() }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {node.avatarUrl ? (
              <img src={node.avatarUrl} alt="" style={{
                width: isLeadership ? 48 : 40, height: isLeadership ? 48 : 40, borderRadius: '50%',
                objectFit: 'cover', border: `2px solid ${isLeadership ? '#C9A96E' : `${color}40`}`,
              }} />
            ) : (
              <div style={{
                width: isLeadership ? 48 : 40, height: isLeadership ? 48 : 40, borderRadius: '50%',
                background: `${color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: isLeadership ? 15 : 13, fontWeight: 700, color,
                border: `2px solid ${isLeadership ? '#C9A96E' : `${color}40`}`,
              }}>
                {initials(node.firstName, node.lastName)}
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 18, height: 18, borderRadius: '50%',
              background: '#C9A96E', color: '#142D48',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, border: '2px solid #132238',
            }}>
              {uploading ? '·' : '📷'}
            </div>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f) }}
            />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.firstName} {node.lastName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 3,
                background: `${color}18`, border: `1px solid ${color}35`, color,
              }}>
                {node.title}
              </span>
              {node.state && <span style={{ fontSize: 10, color: '#6B8299' }}>{node.state}</span>}
            </div>
            {showTrainers && node.cft && (
              <div style={{ fontSize: 9, color: '#9B6DFF', marginTop: 3 }}>
                Trainer: {node.cft}
              </div>
            )}
          </div>

          {node.children.length > 0 && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '6px' }}
              onClick={e => { e.stopPropagation(); setLocalExpanded(!localExpanded) }}
            >
              <span style={{ fontSize: 10, color: '#6B8299', fontWeight: 600 }}>{descendantCount}</span>
              <span style={{ fontSize: 11, color: '#6B8299', transition: 'transform 0.2s', transform: localExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          )}
        </div>

        {localExpanded && node.children.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10,
            paddingLeft: isMobile ? 0 : 18,
            borderLeft: isMobile ? 'none' : `2px solid ${color}15`,
          }}>
            {node.children.map(child => (
              <TreeNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} showTrainers={showTrainers} expandedSet={expandedSet} onAvatarUploaded={onAvatarUploaded} />
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
  allAgents: FlatAgent[]
  onSave: () => void
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const isLeadership = node.id.startsWith('_')
  const fileRef = useRef<HTMLInputElement>(null)
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
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(node.avatarUrl)

  const trainers = allAgents.filter(a => a.phase >= 3)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (isLeadership) { onClose(); return }
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

  const uploadAvatar = async (file: File) => {
    if (isLeadership) return
    setUploading(true)
    const fd = new FormData()
    fd.append('avatar', file)
    try {
      const res = await fetch(`/api/admin/agents/${node.id}/avatar`, { method: 'POST', body: fd })
      if (res.ok) {
        const d = await res.json() as { avatarUrl: string }
        setAvatarPreview(d.avatarUrl)
        onSave()
      }
    } catch { /* silent */ }
    setUploading(false)
  }

  const color = PHASE_COLORS[node.phase] ?? '#C9A96E'

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: isMobile ? '100%' : 400,
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
          <div
            style={{ position: 'relative', cursor: isLeadership ? 'default' : 'pointer' }}
            onClick={() => !isLeadership && fileRef.current?.click()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatarPreview ? (
              <img src={avatarPreview} alt="" style={{
                width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                border: `2px solid ${color}40`,
              }} />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: `${color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, color, border: `2px solid ${color}40`,
              }}>
                {initials(node.firstName, node.lastName)}
              </div>
            )}
            {!isLeadership && (
              <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 22, height: 22, borderRadius: '50%',
                background: '#C9A96E', color: '#142D48',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, border: '2px solid #142D48',
              }}>
                {uploading ? '...' : '📷'}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 2 }}>
              {isLeadership ? 'Leadership' : 'Edit Agent'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>{node.firstName} {node.lastName}</div>
            <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>{isLeadership ? node.title : node.agentCode}</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,169,110,0.25)',
          borderRadius: 6, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#C9A96E', fontSize: 14,
        }}>✕</button>
      </div>

      {/* Form */}
      {isLeadership ? (
        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#6B8299', fontSize: 13, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>👑</div>
          <div>{node.firstName} {node.lastName}</div>
          <div style={{ fontSize: 11 }}>{node.title} · All Financial Freedom</div>
          {!isLeadership && <div style={{ fontSize: 10, color: '#4B5563' }}>Click the avatar to upload a photo</div>}
        </div>
      ) : (
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
              <option value="">Vick & Melinee Minhas (Leadership)</option>
              {allAgents.filter(a => a.agentCode !== node.agentCode && a.phase >= node.phase).map(a => (
                <option key={a.agentCode} value={a.agentCode}>{a.firstName} {a.lastName} — {PHASE_TITLES[a.phase]}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Trainer</label>
            <select value={form.cft} onChange={set('cft')} style={{ ...inputStyle, appearance: 'auto' }}>
              <option value="">No trainer assigned</option>
              <option value="Vick Minhas">Vick Minhas — CEO</option>
              <option value="Melinee Minhas">Melinee Minhas — COO</option>
              {trainers.map(a => (
                <option key={a.agentCode} value={`${a.firstName} ${a.lastName}`}>
                  {a.firstName} {a.lastName} — {PHASE_TITLES[a.phase]}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>
              {error}
            </div>
          )}
        </div>
      )}

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
        }}>{isLeadership ? 'Close' : 'Cancel'}</button>
        {!isLeadership && (
          <button onClick={save} disabled={saving} style={{
            background: saved ? 'rgba(74,222,128,0.2)' : saving ? 'rgba(201,169,110,0.4)' : '#C9A96E',
            color: saved ? '#4ade80' : '#142D48', border: saved ? '1px solid rgba(74,222,128,0.4)' : 'none',
            borderRadius: 4, padding: '12px 22px', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: saving ? 'wait' : 'pointer', flex: 2,
          }}>
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Add Agent Panel ──────────────────────────────────────────────────────────

function AddAgentPanel({ allAgents, onCreated, onClose }: {
  allAgents: FlatAgent[]
  onCreated: () => void
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', agentCode: '',
    state: '', phone: '', recruiterId: '',
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
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, agentCode: form.agentCode,
          state: form.state || undefined, phone: form.phone || undefined,
          recruiterId: form.recruiterId || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to create'); setSubmitting(false); return
      }
      onCreated()
    } catch { setError('Network error'); setSubmitting(false) }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: isMobile ? '100%' : 400, background: '#142D48',
      borderLeft: '1px solid rgba(201,169,110,0.15)', zIndex: 50,
      display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        padding: '20px 24px 16px', borderBottom: '1px solid rgba(201,169,110,0.1)',
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
          <div><label style={labelStyle}>First Name *</label><input required value={form.firstName} onChange={set('firstName')} style={inputStyle} /></div>
          <div><label style={labelStyle}>Last Name *</label><input required value={form.lastName} onChange={set('lastName')} style={inputStyle} /></div>
        </div>
        <div><label style={labelStyle}>Email *</label><input required type="email" value={form.email} onChange={set('email')} style={inputStyle} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={labelStyle}>Agent Code *</label><input required value={form.agentCode} onChange={set('agentCode')} placeholder="e.g. AFF1234" style={{ ...inputStyle, fontFamily: 'monospace' }} /></div>
          <div><label style={labelStyle}>Phone</label><input value={form.phone} onChange={set('phone')} style={inputStyle} /></div>
        </div>
        <div><label style={labelStyle}>State</label>
          <select value={form.state} onChange={set('state')} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="">—</option>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>Reports To (Mentor)</label>
          <select value={form.recruiterId} onChange={set('recruiterId')} style={{ ...inputStyle, appearance: 'auto' }}>
            <option value="">Vick & Melinee Minhas (Leadership)</option>
            {allAgents.map(a => (<option key={a.agentCode} value={a.agentCode}>{a.firstName} {a.lastName} ({a.agentCode})</option>))}
          </select>
        </div>
        {error && <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>{error}</div>}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#9BB0C4', borderRadius: 4, padding: '12px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', flex: 1 }}>Cancel</button>
          <button type="submit" disabled={submitting} style={{ background: submitting ? 'rgba(201,169,110,0.4)' : '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '12px 22px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: submitting ? 'wait' : 'pointer', flex: 2 }}>
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
  const [expandedSet, setExpandedSet] = useState<Set<string> | 'all'>('all')
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/agents/org-tree')
    if (res.ok) setData(await res.json() as OrgData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const allAgents = data ? flattenTree(data.tree) : []

  const collapseAll = () => setExpandedSet(new Set())
  const expandAll = () => setExpandedSet('all')

  return (
    <div style={{ padding: isMobile ? '20px 16px' : '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>Organization</div>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff', margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Team Structure</h1>
          <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0' }}>Click any person to edit their profile, assign a trainer, or upload a photo.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={expandAll} style={{
            background: 'transparent', color: '#6B8299', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4, padding: '10px 14px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', minHeight: 40,
          }}>Expand All</button>
          <button onClick={collapseAll} style={{
            background: 'transparent', color: '#6B8299', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4, padding: '10px 14px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', minHeight: 40,
          }}>Collapse All</button>
          <button onClick={() => setShowTrainers(!showTrainers)} style={{
            background: showTrainers ? 'rgba(155,109,255,0.15)' : 'transparent',
            color: showTrainers ? '#9B6DFF' : '#6B8299',
            border: `1px solid ${showTrainers ? 'rgba(155,109,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 4, padding: '10px 14px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', minHeight: 40,
          }}>{showTrainers ? '✓ Trainers' : 'Trainers'}</button>
          <button onClick={() => { setSelectedNode(null); setShowAddAgent(true) }} style={{
            background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4,
            padding: '10px 18px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', minHeight: 40,
          }}>+ Add Agent</button>
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
          {/* Leadership duo card */}
          {data.leadership && data.leadership.length > 0 && (
            <LeadershipCard leaders={data.leadership} onUpdated={load} />
          )}

          {/* Agent tree (skip the synthetic _leadership root, render its children directly) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {data.tree.flatMap(root =>
              root.id.startsWith('_')
                ? root.children.map(child => (
                    <TreeNode key={child.id} node={child} depth={0} onSelect={n => { setShowAddAgent(false); setSelectedNode(n) }} showTrainers={showTrainers} expandedSet={expandedSet} onAvatarUploaded={load} />
                  ))
                : [<TreeNode key={root.id} node={root} depth={0} onSelect={n => { setShowAddAgent(false); setSelectedNode(n) }} showTrainers={showTrainers} expandedSet={expandedSet} onAvatarUploaded={load} />]
            )}
          </div>
        </div>
      )}

      {data && data.tree.length === 0 && !loading && (
        <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center' }}>
          No agents found. Click &quot;+ Add Agent&quot; to add your first team member.
        </div>
      )}

      {(selectedNode || showAddAgent) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 49 }}
          onClick={() => { setSelectedNode(null); setShowAddAgent(false) }} />
      )}

      {selectedNode && (
        <EditPanel key={selectedNode.id} node={selectedNode} allAgents={allAgents}
          onSave={() => { load(); setSelectedNode(null) }} onClose={() => setSelectedNode(null)} />
      )}

      {showAddAgent && (
        <AddAgentPanel allAgents={allAgents}
          onCreated={() => { load(); setShowAddAgent(false) }} onClose={() => setShowAddAgent(false)} />
      )}
    </div>
  )
}

function flattenTree(nodes: OrgNode[]): FlatAgent[] {
  const result: FlatAgent[] = []
  function walk(n: OrgNode) {
    if (!n.id.startsWith('_')) result.push({ agentCode: n.agentCode, firstName: n.firstName, lastName: n.lastName, phase: n.phase })
    for (const c of n.children) walk(c)
  }
  for (const n of nodes) walk(n)
  return result
}
