'use client'

import { useCallback, useEffect, useState, Fragment } from 'react'

type RewardType = 'BADGE' | 'DISCORD_CALLOUT' | 'ARTICLE' | 'CUSTOM'

const REWARD_OPTIONS: Array<{ value: RewardType; label: string; hint: string }> = [
  { value: 'DISCORD_CALLOUT', label: '📣 Discord callout', hint: 'Posts to #announcements + DMs the agent. Default for milestones with no other reward.' },
  { value: 'BADGE',           label: '🏷 Badge',          hint: 'Adds a badge string to the agent profile. Configure key + label in payload.' },
  { value: 'ARTICLE',         label: '📰 AI article',     hint: 'Generates a personalized profile article via Claude. Optional custom prompt template in payload.' },
  { value: 'CUSTOM',          label: '🎁 Custom',         hint: 'Free-text reward (e.g. "AFF jacket"). Admin handles fulfillment manually.' },
]

interface Milestone {
  id: string
  pointThreshold: number
  title: string
  tagline: string | null
  description: string | null
  rewardType: RewardType
  rewardPayload: Record<string, unknown> | null
  iconKey: string | null
  accentColor: string | null
  active: boolean
  order: number
  createdAt: string
  updatedAt: string
  _count: { achievements: number }
}

export default function VaultClimbPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Milestone> | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeMessage, setRecomputeMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/climb/milestones')
      if (!res.ok) throw new Error()
      const json = await res.json() as { milestones: Milestone[] }
      setMilestones(json.milestones)
    } catch {
      setError('Failed to load milestones')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (m: Milestone) => {
    setEditingId(m.id)
    setDraft({ ...m })
    setShowAdd(false)
  }

  const startAdd = () => {
    setEditingId(null)
    setShowAdd(true)
    setDraft({
      pointThreshold: 0,
      title: '',
      tagline: '',
      description: '',
      rewardType: 'DISCORD_CALLOUT',
      rewardPayload: {},
      iconKey: '',
      accentColor: '#C9A96E',
      active: true,
    })
  }

  const cancel = () => {
    setEditingId(null)
    setShowAdd(false)
    setDraft(null)
    setError('')
  }

  const save = async () => {
    if (!draft || draft.pointThreshold == null || !draft.title?.trim() || !draft.rewardType) {
      setError('Threshold, title, and reward type are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = editingId
        ? `/api/admin/climb/milestones/${editingId}`
        : '/api/admin/climb/milestones'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Save failed')
      } else {
        cancel()
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string, achievementCount: number) => {
    if (!confirm(`Delete this milestone? ${achievementCount > 0 ? `${achievementCount} agent(s) have already achieved it; their records will be deleted too.` : ''}`)) return
    const res = await fetch(`/api/admin/climb/milestones/${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  const recomputeAll = async () => {
    setRecomputing(true)
    setRecomputeMessage('')
    const silent = confirm('Run recompute SILENTLY (no Discord posts, no article generation)? OK = silent. Cancel = with reward side-effects (will fire Discord posts + generate articles for everyone newly past a threshold).')
    const res = await fetch(`/api/admin/climb/recompute-all${silent ? '?silent=1' : ''}`, { method: 'POST' })
    if (res.ok) {
      const d = await res.json() as { scanned: number; totalAwarded: number }
      setRecomputeMessage(`Scanned ${d.scanned} agents. Awarded ${d.totalAwarded} new achievements.`)
      load()
    } else {
      setRecomputeMessage('Recompute failed.')
    }
    setRecomputing(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#fff',
    padding: '10px 12px', fontSize: 13,
    fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    color: '#C9A96E', marginBottom: 6,
  }
  const btn: React.CSSProperties = {
    background: '#C9A96E', color: '#142D48', border: 'none',
    borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
  }
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: '#9BB0C4',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '8px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
            🏔️ The Climb
          </h1>
          <p style={{ fontSize: 13, color: '#6B8299', marginTop: 6, maxWidth: 640, lineHeight: 1.55 }}>
            Configure point milestones and the rewards they unlock. Lifetime points are summed from <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>NewBusinessSubmission.points</code> per agent. Crossing a threshold awards the reward and posts to Discord.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={recomputeAll} disabled={recomputing} style={btnGhost}>
            {recomputing ? 'Recomputing...' : '↻ Recompute all'}
          </button>
          <button onClick={startAdd} style={btn}>+ Add milestone</button>
        </div>
      </div>

      {recomputeMessage && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 6, color: '#4ade80', fontSize: 12 }}>
          {recomputeMessage}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, color: '#f87171', fontSize: 12 }}>
          {error}
        </div>
      )}

      {showAdd && draft && (
        <div style={{
          padding: 20, marginBottom: 20,
          background: '#132238', border: '1px solid rgba(201,169,110,0.25)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 16 }}>
            New milestone
          </div>
          <MilestoneForm draft={draft} setDraft={setDraft} inputStyle={inputStyle} labelStyle={labelStyle} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={cancel} style={btnGhost}>Cancel</button>
            <button onClick={save} disabled={saving} style={btn}>{saving ? 'Saving...' : 'Create'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{ borderRadius: 8, overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Threshold', 'Title', 'Reward', 'Awarded', 'Status', ''].map(h => (
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
              {milestones.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px 14px', fontSize: 12, color: '#4B5563', textAlign: 'center' }}>
                    No milestones yet. Click + Add milestone above.
                  </td>
                </tr>
              ) : milestones.map(m => (
                <Fragment key={m.id}>
                  <tr style={{ borderBottom: editingId === m.id ? 'none' : '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                      {m.pointThreshold.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#d1d9e2' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {m.iconKey && <span style={{ fontSize: 14 }}>{m.iconKey}</span>}
                        <span>{m.title}</span>
                        {m.accentColor && (
                          <span style={{ width: 12, height: 12, borderRadius: 3, background: m.accentColor, border: '1px solid rgba(255,255,255,0.1)' }} />
                        )}
                      </div>
                      {m.tagline && <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>{m.tagline}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#9BB0C4' }}>
                      {REWARD_OPTIONS.find(o => o.value === m.rewardType)?.label ?? m.rewardType}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#9BB0C4', whiteSpace: 'nowrap' }}>
                      {m._count.achievements} {m._count.achievements === 1 ? 'agent' : 'agents'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                        background: m.active ? 'rgba(74,222,128,0.1)' : 'rgba(107,130,153,0.15)',
                        color: m.active ? '#4ade80' : '#9BB0C4',
                        border: `1px solid ${m.active ? 'rgba(74,222,128,0.3)' : 'rgba(107,130,153,0.3)'}`,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}>{m.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => editingId === m.id ? cancel() : startEdit(m)} style={{
                        background: 'none', border: 'none',
                        color: editingId === m.id ? '#9BB0C4' : '#C9A96E',
                        fontSize: 11, cursor: 'pointer', marginRight: 8,
                      }}>{editingId === m.id ? 'Close' : 'Edit'}</button>
                      <button onClick={() => remove(m.id, m._count.achievements)} style={{
                        background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer',
                      }}>Delete</button>
                    </td>
                  </tr>
                  {editingId === m.id && draft && (
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td colSpan={6} style={{ padding: 0, background: 'rgba(201,169,110,0.04)', borderTop: '1px solid rgba(201,169,110,0.18)' }}>
                        <div style={{ padding: 18 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#C9A96E', marginBottom: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            Editing &middot; {m.title}
                          </div>
                          <MilestoneForm draft={draft} setDraft={setDraft} inputStyle={inputStyle} labelStyle={labelStyle} />
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                            <button onClick={cancel} style={btnGhost}>Cancel</button>
                            <button onClick={save} disabled={saving} style={btn}>{saving ? 'Saving...' : 'Update'}</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MilestoneForm({
  draft, setDraft, inputStyle, labelStyle,
}: {
  draft: Partial<Milestone>
  setDraft: (d: Partial<Milestone>) => void
  inputStyle: React.CSSProperties
  labelStyle: React.CSSProperties
}) {
  const setField = (patch: Partial<Milestone>) => setDraft({ ...draft, ...patch })
  const payload = (draft.rewardPayload ?? {}) as Record<string, string>
  const setPayload = (patch: Record<string, string>) => setField({ rewardPayload: { ...payload, ...patch } })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <div style={labelStyle}>Threshold (points)</div>
        <input type="number" min={0} value={draft.pointThreshold ?? 0} onChange={e => setField({ pointThreshold: Number(e.target.value) })} style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>Title</div>
        <input value={draft.title ?? ''} onChange={e => setField({ title: e.target.value })} placeholder="Six-Figure Climber" style={inputStyle} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={labelStyle}>Tagline</div>
        <input value={draft.tagline ?? ''} onChange={e => setField({ tagline: e.target.value })} placeholder="Short flavor text shown on the marker" style={inputStyle} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={labelStyle}>Description</div>
        <textarea value={draft.description ?? ''} onChange={e => setField({ description: e.target.value })} rows={2} placeholder="Longer description shown when an agent clicks the marker" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
      </div>
      <div>
        <div style={labelStyle}>Icon</div>
        <input value={draft.iconKey ?? ''} onChange={e => setField({ iconKey: e.target.value })} placeholder="🏔 or ★ or ◆" style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>Accent color</div>
        <input value={draft.accentColor ?? ''} onChange={e => setField({ accentColor: e.target.value })} placeholder="#C9A96E" style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>Reward type</div>
        <select value={draft.rewardType ?? 'DISCORD_CALLOUT'} onChange={e => setField({ rewardType: e.target.value as RewardType })} style={{ ...inputStyle, cursor: 'pointer' }}>
          {REWARD_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
          {REWARD_OPTIONS.find(o => o.value === (draft.rewardType ?? 'DISCORD_CALLOUT'))?.hint}
        </div>
      </div>
      <div>
        <div style={labelStyle}>Active</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9BB0C4', height: 38 }}>
          <input type="checkbox" checked={draft.active !== false} onChange={e => setField({ active: e.target.checked })} style={{ accentColor: '#C9A96E' }} />
          Inactive milestones don&apos;t appear on the agent track and don&apos;t award.
        </label>
      </div>

      {/* Per-reward-type payload editors */}
      {draft.rewardType === 'BADGE' && (
        <div style={{ gridColumn: '1 / -1', padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#C9A96E', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Badge config</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Badge key (uppercase)</div>
              <input value={payload.key ?? ''} onChange={e => setPayload({ key: e.target.value.toUpperCase() })} placeholder="PRODUCER" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Badge label</div>
              <input value={payload.label ?? ''} onChange={e => setPayload({ label: e.target.value })} placeholder="Producer" style={inputStyle} />
            </div>
          </div>
        </div>
      )}

      {draft.rewardType === 'DISCORD_CALLOUT' && (
        <div style={{ gridColumn: '1 / -1', padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#C9A96E', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Discord callout (optional overrides)</div>
          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>Embed title (defaults to milestone title)</div>
            <input value={payload.embedTitle ?? ''} onChange={e => setPayload({ embedTitle: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Embed description</div>
            <textarea value={payload.embedDescription ?? ''} onChange={e => setPayload({ embedDescription: e.target.value })} rows={2} style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} placeholder="Override default copy. Defaults to tagline / threshold." />
          </div>
        </div>
      )}

      {draft.rewardType === 'ARTICLE' && (
        <div style={{ gridColumn: '1 / -1', padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#C9A96E', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI article prompt template</div>
          <textarea value={payload.promptTemplate ?? ''} onChange={e => setPayload({ promptTemplate: e.target.value })} rows={6} placeholder="Leave blank to use the default Claude prompt. Override here to tune voice, length, or angle. Agent stats are appended automatically." style={{ ...inputStyle, minHeight: 140, fontFamily: 'ui-monospace, monospace', fontSize: 11, resize: 'vertical' }} />
        </div>
      )}

      {draft.rewardType === 'CUSTOM' && (
        <div style={{ gridColumn: '1 / -1', padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#C9A96E', fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Custom reward note</div>
          <input value={payload.note ?? ''} onChange={e => setPayload({ note: e.target.value })} placeholder='e.g. "AFF jacket — order from ops"' style={inputStyle} />
          <div style={{ fontSize: 11, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
            Custom rewards still post a Discord callout and show on the agent&apos;s Climb tab. Physical fulfillment is your responsibility.
          </div>
        </div>
      )}
    </div>
  )
}
