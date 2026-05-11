'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'

type Anchor = 'ICA_DATE' | 'ONBOARDING' | 'PHASE_START' | 'FIXED'
type ReqType = 'PHASE_ITEM' | 'MILESTONE' | 'RECRUITS' | 'POLICIES' | 'MANUAL' | 'CUSTOM_TEXT'

interface Requirement {
  id?: string
  order: number
  label: string
  type: ReqType
  phaseItemKey: string | null
  milestoneKey: string | null
  count: number | null
  defaultCompleted?: boolean
}

interface Contest {
  id: string
  title: string
  description: string | null
  rewardAmount: number | null
  rewardLabel: string | null
  anchor: Anchor
  durationDays: number | null
  fixedStartAt: string | null
  fixedEndAt: string | null
  eligibleFromAt: string | null
  eligibleToAt: string | null
  active: boolean
  discordChannelId: string | null
  discordTrackerMessageId: string | null
  trackerShowMissed: boolean
  createdAt: string
  updatedAt: string
  requirements: Requirement[]
}

interface Participant {
  agentProfileId: string
  firstName: string
  lastName: string
  agentCode: string
  startsAt: string
  endsAt: string
  daysRemaining: number
  expired: boolean
  completedCount: number
  totalCount: number
  qualified: boolean
}

const ANCHOR_LABEL: Record<Anchor, string> = {
  ICA_DATE: 'ICA date',
  ONBOARDING: 'Portal onboarding',
  PHASE_START: 'Phase start',
  FIXED: 'Fixed window',
}

const REQ_TYPE_LABEL: Record<ReqType, string> = {
  PHASE_ITEM: 'Checklist item complete',
  MILESTONE: 'Recognition milestone awarded',
  RECRUITS: 'Recruits in window',
  POLICIES: 'Policies in window',
  MANUAL: 'Admin checks per agent',
  CUSTOM_TEXT: 'Display only',
}

export default function ContestsAdminPage() {
  const [contests, setContests] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Contest>>({})
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [participantsForId, setParticipantsForId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [postText, setPostText] = useState<string | null>(null)
  const [postCount, setPostCount] = useState<number>(0)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/contests')
    if (res.ok) {
      const d = await res.json() as { contests: Contest[] }
      setContests(d.contests)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const startCreate = () => {
    setShowAdd(true); setEditing(null)
    setForm({
      title: '', description: '',
      rewardAmount: 500, rewardLabel: '$500',
      anchor: 'ICA_DATE', durationDays: 60,
      active: true,
    })
    setRequirements([
      { order: 0, label: 'Get GFI Code',                 type: 'MANUAL',     phaseItemKey: null, milestoneKey: null, count: null },
      { order: 1, label: 'Complete Digital PFR',         type: 'PHASE_ITEM', phaseItemKey: 'pfr', milestoneKey: null, count: null },
      { order: 2, label: '3 Recruits',                   type: 'RECRUITS',   phaseItemKey: null, milestoneKey: null, count: 3 },
      { order: 3, label: '3 Policies',                   type: 'POLICIES',   phaseItemKey: null, milestoneKey: null, count: 3 },
      { order: 4, label: 'Pass Life License',            type: 'PHASE_ITEM', phaseItemKey: 'pass_license_test', milestoneKey: null, count: null },
      { order: 5, label: 'Make 1st $1,000 (Net Licensed)', type: 'MILESTONE', phaseItemKey: null, milestoneKey: 'first_1000', count: null },
    ])
  }

  const startEdit = (c: Contest) => {
    setShowAdd(false); setEditing(c.id)
    setForm({ ...c, fixedStartAt: c.fixedStartAt?.slice(0, 10), fixedEndAt: c.fixedEndAt?.slice(0, 10), eligibleFromAt: c.eligibleFromAt?.slice(0, 10), eligibleToAt: c.eligibleToAt?.slice(0, 10) })
    setRequirements(c.requirements.map((r, i) => ({ ...r, order: r.order ?? i })))
  }

  const cancel = () => { setShowAdd(false); setEditing(null); setForm({}); setRequirements([]); setError('') }

  const save = async () => {
    setSaving(true); setError('')
    const payload = { ...form, requirements }
    const url = editing ? `/api/admin/contests/${editing}` : '/api/admin/contests'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Save failed')
    } else {
      cancel()
      load()
    }
    setSaving(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this contest? Manual-check rows for it will also be removed.')) return
    await fetch(`/api/admin/contests/${id}`, { method: 'DELETE' })
    load()
  }

  const openParticipants = async (id: string) => {
    setParticipantsForId(id); setParticipants([])
    const res = await fetch(`/api/admin/contests/${id}`)
    if (res.ok) {
      const d = await res.json() as { participants: Participant[] }
      setParticipants(d.participants ?? [])
    }
  }

  const bulkCheck = async (cId: string, requirementId: string, completed: boolean) => {
    const verb = completed ? 'mark complete for' : 'clear for'
    if (!confirm(`This will ${verb} every eligible agent now AND auto-${completed ? 'check' : 'uncheck'} for any new agent who joins later. Continue?`)) return
    const res = await fetch(`/api/admin/contests/${cId}/bulk-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirementId, completed }),
    })
    if (res.ok) {
      const d = await res.json() as { affected: number }
      alert(`Done. ${d.affected} agent${d.affected === 1 ? '' : 's'} updated. New joiners will inherit this state automatically.`)
      openParticipants(cId)
      load()
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string }
      alert(`Failed: ${d.error ?? 'unknown'}`)
    }
  }

  const syncTracker = async (cId: string, currentChannelId: string | null) => {
    const channelId = prompt('Discord channel ID to post the live tracker in:', currentChannelId ?? '')
    if (!channelId?.trim()) return
    const res = await fetch(`/api/admin/contests/${cId}/sync-tracker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: channelId.trim() }),
    })
    if (res.ok) {
      const d = await res.json() as { counts: { total: number; earned: number; inProgress: number; atRisk: number; missed: number } }
      alert(`Tracker synced. ${d.counts.total} eligible · ${d.counts.earned} earned · ${d.counts.atRisk} at risk.`)
      load()
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string }
      alert(`Sync failed: ${d.error ?? 'unknown'}`)
    }
  }

  const generatePost = async (id: string) => {
    setPostText(null); setPostCount(0)
    const res = await fetch(`/api/admin/contests/${id}/at-risk-post`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thresholdDays: 7 }),
    })
    if (res.ok) {
      const d = await res.json() as { text: string; atRiskCount: number }
      setPostText(d.text); setPostCount(d.atRiskCount)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#d1d9e2', padding: '10px 14px', fontSize: 13, fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6,
  }
  const btn: React.CSSProperties = {
    padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 28, padding: '20px 0 18px', borderBottom: '1px solid rgba(201,169,110,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>All Financial Freedom</div>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 300, color: '#fff', margin: '0 0 4px' }}>Contests &amp; Bonuses</h1>
          <p style={{ fontSize: 12, color: '#6B8299', margin: 0, maxWidth: 760, lineHeight: 1.55 }}>
            Time-boxed bonuses with per-agent countdowns. Anchors: ICA date, portal onboarding, phase start, or a fixed window. Most requirements auto-track; MANUAL is checked off per agent.
          </p>
        </div>
        <button onClick={startCreate} style={{ ...btn, background: '#C9A96E', color: '#142D48', border: 'none' }}>
          + New contest
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 4, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 12 }}>
          {error}
        </div>
      )}

      {(showAdd || editing) && (
        <ContestForm
          form={form} setForm={setForm}
          requirements={requirements} setRequirements={setRequirements}
          onSave={save} onCancel={cancel} saving={saving} editing={!!editing}
          inputStyle={inputStyle} labelStyle={labelStyle} btn={btn}
        />
      )}

      {loading && <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>}

      {!loading && contests.length === 0 && !showAdd && (
        <div style={{ padding: '48px 16px', textAlign: 'center', color: '#6B8299', fontSize: 13, border: '1px dashed rgba(201,169,110,0.2)', borderRadius: 6 }}>
          No contests yet. Create the first one above.
        </div>
      )}

      {!loading && contests.map(c => (
        <Fragment key={c.id}>
          <div style={{
            marginBottom: 12, padding: 18, borderRadius: 6,
            background: '#0C1E30', border: `1px solid ${c.active ? 'rgba(201,169,110,0.25)' : 'rgba(255,255,255,0.06)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.title}</span>
                  {c.rewardLabel && <span style={{ fontSize: 11, color: '#C9A96E', fontWeight: 600 }}>{c.rewardLabel}</span>}
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 8px', borderRadius: 999,
                    background: c.active ? 'rgba(74,222,128,0.12)' : 'rgba(107,130,153,0.15)',
                    color: c.active ? '#4ade80' : '#9BB0C4',
                    textTransform: 'uppercase',
                  }}>{c.active ? 'Active' : 'Inactive'}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6B8299' }}>
                  {ANCHOR_LABEL[c.anchor]}
                  {c.durationDays && ` · ${c.durationDays} days`}
                  {c.anchor === 'FIXED' && c.fixedStartAt && c.fixedEndAt && ` · ${new Date(c.fixedStartAt).toLocaleDateString()} – ${new Date(c.fixedEndAt).toLocaleDateString()}`}
                  {' · '}{c.requirements.length} requirement{c.requirements.length === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => openParticipants(c.id)} style={{ ...btn, background: 'transparent', color: '#9BB0C4', border: '1px solid rgba(255,255,255,0.12)' }}>
                  Participants
                </button>
                <button onClick={() => syncTracker(c.id, c.discordChannelId)} style={{ ...btn, background: 'transparent', color: '#5865F2', border: '1px solid rgba(88,101,242,0.4)' }}>
                  {c.discordTrackerMessageId ? 'Sync to Discord' : 'Post to Discord'}
                </button>
                <button onClick={() => generatePost(c.id)} style={{ ...btn, background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
                  At-risk post
                </button>
                <button onClick={() => startEdit(c)} style={{ ...btn, background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.3)' }}>
                  Edit
                </button>
                <button onClick={() => remove(c.id)} style={{ ...btn, background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                  Delete
                </button>
              </div>
            </div>

            {participantsForId === c.id && (
              <div style={{ marginTop: 14, padding: '12px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Bulk-check rail: each MANUAL requirement gets a
                    one-click 'mark complete for everyone' button.
                    Used for things like 'Get GFI Code' that are
                    implicitly true for the whole portal cohort. */}
                {c.requirements.filter(r => r.type === 'MANUAL').length > 0 && (
                  <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#C9A96E', textTransform: 'uppercase', marginBottom: 8 }}>
                      Bulk actions &middot; manual requirements
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {c.requirements.filter(r => r.type === 'MANUAL').map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#fff' }}>{r.label}</span>
                            {r.defaultCompleted && (
                              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '2px 8px', borderRadius: 999, background: 'rgba(74,222,128,0.12)', color: '#4ade80', textTransform: 'uppercase', border: '1px solid rgba(74,222,128,0.4)' }}>
                                Auto-checks new joiners
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => bulkCheck(c.id, r.id!, true)}
                              style={{ ...btn, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.4)' }}
                            >
                              ✓ Mark all done {!r.defaultCompleted && '+ auto-check future'}
                            </button>
                            <button
                              onClick={() => bulkCheck(c.id, r.id!, false)}
                              style={{ ...btn, background: 'transparent', color: '#9BB0C4', border: '1px solid rgba(255,255,255,0.12)' }}
                            >
                              Clear all
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#C9A96E', marginBottom: 8, textTransform: 'uppercase' }}>
                  Eligible agents ({participants.length})
                </div>
                {participants.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#6B8299' }}>No eligible agents yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {['Agent', 'Code', 'Days left', 'Progress', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6B8299', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map(p => (
                        <tr key={p.agentProfileId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '8px 12px', color: '#fff' }}>{p.firstName} {p.lastName}</td>
                          <td style={{ padding: '8px 12px', color: '#6B8299', fontFamily: 'monospace' }}>{p.agentCode}</td>
                          <td style={{ padding: '8px 12px', color: p.expired ? '#f87171' : p.daysRemaining <= 7 ? '#f59e0b' : '#9BB0C4' }}>
                            {p.expired ? 'expired' : `${p.daysRemaining}d`}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#9BB0C4' }}>{p.completedCount}/{p.totalCount}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {p.qualified ? <span style={{ color: '#4ade80', fontWeight: 700 }}>✓ Earned</span>
                              : p.expired ? <span style={{ color: '#f87171' }}>Missed</span>
                              : <span style={{ color: '#9BB0C4' }}>In progress</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </Fragment>
      ))}

      {postText !== null && (
        <div onClick={() => setPostText(null)} style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(10,22,40,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0C1E30', border: '1px solid rgba(248,113,113,0.4)',
            borderRadius: 8, width: '100%', maxWidth: 720, padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f87171' }}>At-risk post</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 4 }}>{postCount} agents flagged (≤7 days remaining, not yet qualified)</div>
              </div>
              <button onClick={() => setPostText(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#9BB0C4', borderRadius: 4, width: 32, height: 32, cursor: 'pointer' }}>✕</button>
            </div>
            <textarea
              value={postText}
              readOnly
              style={{ ...inputStyle, minHeight: 320, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, lineHeight: 1.55 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => { navigator.clipboard.writeText(postText); }} style={{ ...btn, background: '#C9A96E', color: '#142D48', border: 'none' }}>
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContestForm({
  form, setForm, requirements, setRequirements, onSave, onCancel, saving, editing,
  inputStyle, labelStyle, btn,
}: {
  form: Partial<Contest>
  setForm: (f: Partial<Contest>) => void
  requirements: Requirement[]
  setRequirements: (r: Requirement[]) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  editing: boolean
  inputStyle: React.CSSProperties
  labelStyle: React.CSSProperties
  btn: React.CSSProperties
}) {
  const updateReq = (i: number, patch: Partial<Requirement>) => {
    const next = [...requirements]
    next[i] = { ...next[i], ...patch }
    setRequirements(next)
  }
  const addReq = () => setRequirements([
    ...requirements,
    { order: requirements.length, label: '', type: 'MANUAL', phaseItemKey: null, milestoneKey: null, count: null },
  ])
  const removeReq = (i: number) => setRequirements(requirements.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginBottom: 18, padding: 20, borderRadius: 6, background: '#132238', border: '1px solid rgba(201,169,110,0.25)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#C9A96E', marginBottom: 16, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {editing ? 'Edit contest' : 'New contest'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={form.title ?? ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="$500 Fast Start Bonus" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Description (optional)</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Reward label</label>
          <input style={inputStyle} value={form.rewardLabel ?? ''} onChange={e => setForm({ ...form, rewardLabel: e.target.value })} placeholder="$500" />
        </div>
        <div>
          <label style={labelStyle}>Reward amount ($)</label>
          <input type="number" style={inputStyle} value={form.rewardAmount ?? ''} onChange={e => setForm({ ...form, rewardAmount: e.target.value === '' ? null : parseInt(e.target.value) })} />
        </div>
        <div>
          <label style={labelStyle}>Active</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.active === false ? 'no' : 'yes'} onChange={e => setForm({ ...form, active: e.target.value === 'yes' })}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ToggleSwitch
            checked={form.trackerShowMissed === true}
            onChange={v => setForm({ ...form, trackerShowMissed: v })}
          />
          <div>
            <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>Show &lsquo;Missed&rsquo; section in Discord tracker</div>
            <div style={{ fontSize: 11, color: '#6B8299' }}>Off by default. When on, the live tracker embed includes a section listing agents who ran out of time.</div>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Anchor</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.anchor ?? 'ICA_DATE'} onChange={e => setForm({ ...form, anchor: e.target.value as Anchor })}>
            <option value="ICA_DATE">ICA date</option>
            <option value="ONBOARDING">Portal onboarding</option>
            <option value="PHASE_START">Phase start</option>
            <option value="FIXED">Fixed window</option>
          </select>
        </div>
        {form.anchor !== 'FIXED' ? (
          <div>
            <label style={labelStyle}>Duration (days)</label>
            <input type="number" style={inputStyle} value={form.durationDays ?? ''} onChange={e => setForm({ ...form, durationDays: parseInt(e.target.value) || null })} />
          </div>
        ) : (
          <>
            <div>
              <label style={labelStyle}>Window start</label>
              <input type="date" style={inputStyle} value={form.fixedStartAt ?? ''} onChange={e => setForm({ ...form, fixedStartAt: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Window end</label>
              <input type="date" style={inputStyle} value={form.fixedEndAt ?? ''} onChange={e => setForm({ ...form, fixedEndAt: e.target.value })} />
            </div>
          </>
        )}
        <div>
          <label style={labelStyle}>Eligible from (optional)</label>
          <input type="date" style={inputStyle} value={form.eligibleFromAt ?? ''} onChange={e => setForm({ ...form, eligibleFromAt: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Eligible to (optional)</label>
          <input type="date" style={inputStyle} value={form.eligibleToAt ?? ''} onChange={e => setForm({ ...form, eligibleToAt: e.target.value })} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#C9A96E', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Requirements</div>
          <button onClick={addReq} style={{ ...btn, background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.4)' }}>+ Requirement</button>
        </div>
        {requirements.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.2fr 0.7fr auto', gap: 10, marginBottom: 8 }}>
            <input style={inputStyle} value={r.label} onChange={e => updateReq(i, { label: e.target.value })} placeholder="Label" />
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={r.type} onChange={e => updateReq(i, { type: e.target.value as ReqType })}>
              {(Object.keys(REQ_TYPE_LABEL) as ReqType[]).map(t => <option key={t} value={t}>{REQ_TYPE_LABEL[t]}</option>)}
            </select>
            {r.type === 'PHASE_ITEM' ? (
              <input style={inputStyle} value={r.phaseItemKey ?? ''} onChange={e => updateReq(i, { phaseItemKey: e.target.value })} placeholder="phaseItem key (e.g. pfr)" />
            ) : r.type === 'MILESTONE' ? (
              <input style={inputStyle} value={r.milestoneKey ?? ''} onChange={e => updateReq(i, { milestoneKey: e.target.value })} placeholder="milestone key (e.g. first_1000)" />
            ) : (
              <div />
            )}
            {(r.type === 'RECRUITS' || r.type === 'POLICIES') ? (
              <input type="number" style={inputStyle} value={r.count ?? ''} onChange={e => updateReq(i, { count: parseInt(e.target.value) || null })} placeholder="N" />
            ) : (
              <div />
            )}
            <button onClick={() => removeReq(i)} style={{ background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', borderRadius: 4, padding: '0 12px', fontSize: 14, cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ ...btn, background: 'transparent', color: '#9BB0C4', border: '1px solid rgba(255,255,255,0.12)' }}>Cancel</button>
        <button onClick={onSave} disabled={saving} style={{ ...btn, background: '#C9A96E', color: '#142D48', border: 'none', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 44, height: 24,
        background: checked ? '#4ade80' : 'rgba(255,255,255,0.12)',
        borderRadius: 999, border: 'none',
        cursor: 'pointer', transition: 'background 180ms ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff',
          transition: 'left 180ms ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}
