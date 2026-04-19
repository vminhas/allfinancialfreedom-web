'use client'

import { useState, useEffect, useCallback } from 'react'
import { PHASE_LABELS, PHASE_GROUPS, SYSTEM_PROGRESSIONS } from '@/lib/agent-constants'
import { useIsMobile } from '@/lib/useIsMobile'
import MarkdownDescription from '@/components/MarkdownDescription'
import { AVAILABLE_ICONS } from '@/lib/checklist-icons'

interface PhaseItemDef {
  id: string
  phase: number
  itemKey: string
  label: string
  description: string
  duration: string | null
  groupKey: string | null
  sortOrder: number
  adminOnly: boolean
  actionJson: string | null
  coordinatorTopic: string | null
  linkedProgression: string | null
}

const PROGRESSION_OPTIONS = SYSTEM_PROGRESSIONS.map(p => ({ key: p.key, label: p.label }))

interface PhaseGroupDef {
  id: string; phase: number; groupKey: string; label: string
  icon: string | null; description: string | null; showTrainer: boolean; sortOrder: number
}

interface ProgressionDef {
  id: string; key: string; label: string; description: string
  icon: string | null; achievedWhen: string; sortOrder: number
}

export default function ChecklistEditorPage() {
  const isMobile = useIsMobile()
  const [editorTab, setEditorTab] = useState<'items' | 'groups' | 'progressions'>('items')
  const [items, setItems] = useState<PhaseItemDef[]>([])
  const [groupDefs, setGroupDefs] = useState<PhaseGroupDef[]>([])
  const [progressionDefs, setProgressionDefs] = useState<ProgressionDef[]>([])
  const [loading, setLoading] = useState(true)
  const [activePhase, setActivePhase] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    itemKey: '', label: '', description: '', duration: '',
    groupKey: '', adminOnly: false, coordinatorTopic: '', linkedProgression: '',
  })

  const fetchItems = useCallback(async () => {
    const [itemsRes, groupsRes, progsRes] = await Promise.all([
      fetch('/api/admin/phase-items'),
      fetch('/api/admin/phase-groups'),
      fetch('/api/admin/progressions'),
    ])
    if (itemsRes.ok) { const d = await itemsRes.json() as { items: PhaseItemDef[] }; setItems(d.items ?? []) }
    if (groupsRes.ok) { const d = await groupsRes.json() as { groups: PhaseGroupDef[] }; setGroupDefs(d.groups ?? []) }
    if (progsRes.ok) { const d = await progsRes.json() as { progressions: ProgressionDef[] }; setProgressionDefs(d.progressions ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const phaseItems = items.filter(i => i.phase === activePhase).sort((a, b) => a.sortOrder - b.sortOrder)
  const groups = PHASE_GROUPS[activePhase] ?? []

  const resetForm = () => {
    setForm({ itemKey: '', label: '', description: '', duration: '', groupKey: '', adminOnly: false, coordinatorTopic: '', linkedProgression: '' })
    setEditingId(null)
    setShowAdd(false)
  }

  const startEdit = (item: PhaseItemDef) => {
    setForm({
      itemKey: item.itemKey,
      label: item.label,
      description: item.description,
      duration: item.duration ?? '',
      groupKey: item.groupKey ?? '',
      adminOnly: item.adminOnly,
      coordinatorTopic: item.coordinatorTopic ?? '',
      linkedProgression: item.linkedProgression ?? '',
    })
    setEditingId(item.id)
    setShowAdd(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingId) {
        await fetch('/api/admin/phase-items', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            label: form.label,
            description: form.description,
            duration: form.duration || null,
            groupKey: form.groupKey || null,
            adminOnly: form.adminOnly,
            coordinatorTopic: form.coordinatorTopic || null,
            linkedProgression: form.linkedProgression || null,
          }),
        })
      } else {
        const key = form.itemKey || form.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        await fetch('/api/admin/phase-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: activePhase,
            itemKey: key,
            label: form.label,
            description: form.description,
            duration: form.duration || undefined,
            groupKey: form.groupKey || undefined,
            adminOnly: form.adminOnly,
            coordinatorTopic: form.coordinatorTopic || undefined,
            linkedProgression: form.linkedProgression || undefined,
          }),
        })
      }
      resetForm()
      fetchItems()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this checklist item? This cannot be undone.')) return
    await fetch(`/api/admin/phase-items?id=${id}`, { method: 'DELETE' })
    fetchItems()
  }

  const moveItem = async (id: string, direction: 'up' | 'down') => {
    const idx = phaseItems.findIndex(i => i.id === id)
    if (idx < 0) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === phaseItems.length - 1) return

    const newItems = [...phaseItems]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    ;[newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]]

    const orderedIds = newItems.map(i => i.id)
    await fetch('/api/admin/phase-items/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    })
    fetchItems()
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#ffffff', outline: 'none',
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: '#9BB0C4',
    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4,
  }

  if (loading) return <div style={{ padding: 32, color: '#6B8299' }}>Loading...</div>

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0 }}>Checklist Editor</h1>
        <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
          Manage checklist items, groups, and progression badges. Changes apply to all agents.
        </p>
      </div>

      {/* Editor tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
        {(['items', 'groups', 'progressions'] as const).map(t => (
          <button key={t} onClick={() => { setEditorTab(t); resetForm() }} style={{
            padding: '8px 18px', borderRadius: 4, fontSize: 12, fontWeight: 600,
            background: editorTab === t ? 'rgba(201,169,110,0.12)' : 'transparent',
            border: `1px solid ${editorTab === t ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: editorTab === t ? '#C9A96E' : '#6B8299', cursor: 'pointer',
          }}>{t === 'items' ? 'Items' : t === 'groups' ? 'Groups' : 'Progressions'}</button>
        ))}
      </div>

      {editorTab === 'items' && <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => { resetForm(); setShowAdd(true) }}
          style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >+ Add Item</button>
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(ph => (
          <button
            key={ph}
            onClick={() => setActivePhase(ph)}
            style={{
              padding: '6px 16px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: activePhase === ph ? 'rgba(201,169,110,0.12)' : 'transparent',
              border: `1px solid ${activePhase === ph ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: activePhase === ph ? '#C9A96E' : '#6B8299', cursor: 'pointer',
            }}
          >
            Phase {ph}: {PHASE_LABELS[ph]?.title}
            <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>
              ({items.filter(i => i.phase === ph).length})
            </span>
          </button>
        ))}
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{
          padding: 20, marginBottom: 16,
          background: '#132238', border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 16 }}>
            {editingId ? 'Edit Item' : `Add Item to Phase ${activePhase}`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: editingId ? undefined : isMobile ? undefined : 'span 2' }}>
              <div style={lbl}>Label *</div>
              <input value={form.label} onChange={e => {
                setForm(f => ({
                  ...f, label: e.target.value,
                  itemKey: editingId ? f.itemKey : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
                }))
              }} style={inp} placeholder="e.g., Complete Training Module" />
            </div>
            {editingId && (
              <div>
                <div style={lbl}>Key (auto-generated)</div>
                <input value={form.itemKey} disabled style={{ ...inp, opacity: 0.4 }} />
              </div>
            )}
            <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={lbl}>Description *</div>
                <div style={{ fontSize: 9, color: '#4B5563' }}>Supports formatting (see tips below)</div>
              </div>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} placeholder="What the agent needs to do..." />
              <div style={{
                marginTop: 6, padding: '8px 12px', borderRadius: 4,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                fontSize: 10, color: '#4B5563', lineHeight: 1.8,
              }}>
                <span style={{ color: '#6B8299', fontWeight: 600 }}>Formatting tips:</span>{' '}
                <code style={{ color: '#C9A96E', background: 'rgba(201,169,110,0.08)', padding: '1px 4px', borderRadius: 2 }}>[link text](https://url.com)</code> for clickable links{' · '}
                <code style={{ color: '#C9A96E', background: 'rgba(201,169,110,0.08)', padding: '1px 4px', borderRadius: 2 }}>**bold text**</code> for bold{' · '}
                <code style={{ color: '#C9A96E', background: 'rgba(201,169,110,0.08)', padding: '1px 4px', borderRadius: 2 }}>*italic text*</code> for italic{' · '}
                Start a line with <code style={{ color: '#C9A96E', background: 'rgba(201,169,110,0.08)', padding: '1px 4px', borderRadius: 2 }}>- </code> for bullet points
              </div>
              {form.description && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Preview</div>
                  <div style={{
                    padding: '10px 14px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,169,110,0.1)',
                  }}>
                    <MarkdownDescription text={form.description} style={{ fontSize: 12, color: '#9BB0C4' }} />
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={lbl}>Duration</div>
              <input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} style={inp} placeholder="e.g., 1 Hour" />
            </div>
            <div>
              <div style={lbl}>Group</div>
              <select value={form.groupKey} onChange={e => setForm(f => ({ ...f, groupKey: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">No group</option>
                {groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Coordinator Topic</div>
              <select value={form.coordinatorTopic} onChange={e => setForm(f => ({ ...f, coordinatorTopic: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">None</option>
                <option value="SCHEDULE_EXAM">Schedule Exam</option>
                <option value="PASS_POST_LICENSING">Post-Licensing</option>
                <option value="FINGERPRINTS_APPLY">Fingerprints</option>
                <option value="GFI_APPOINTMENTS">GFI / Carriers</option>
                <option value="CE_COURSES">CE Courses</option>
                <option value="EO_INSURANCE">E&O Insurance</option>
                <option value="DIRECT_DEPOSIT">Direct Deposit</option>
                <option value="GENERAL">General</option>
              </select>
            </div>
            <div>
              <div style={lbl}>Linked Progression Badge</div>
              <select value={form.linkedProgression} onChange={e => setForm(f => ({ ...f, linkedProgression: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">None</option>
                {PROGRESSION_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: isMobile ? 0 : 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.adminOnly} onChange={e => setForm(f => ({ ...f, adminOnly: e.target.checked }))} />
                Admin-only (requires approval)
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={resetForm} style={{ padding: '8px 16px', borderRadius: 4, fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.label || !form.description} style={{
              padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              background: '#C9A96E', border: 'none', color: '#142D48',
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {phaseItems.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#4B5563', fontSize: 13 }}>
            No items in Phase {activePhase}. Click &quot;+ Add Item&quot; to create one.
          </div>
        ) : phaseItems.map((item, idx) => {
          const group = groups.find(g => g.key === item.groupKey)
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 16px', borderRadius: 6,
              background: '#132238', border: '1px solid rgba(255,255,255,0.05)',
            }}>
              {/* Reorder buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0, paddingTop: 2 }}>
                <button onClick={() => moveItem(item.id, 'up')} disabled={idx === 0} style={{
                  background: 'none', border: 'none', color: idx === 0 ? '#2a3a4d' : '#6B8299',
                  cursor: idx === 0 ? 'default' : 'pointer', fontSize: 11, padding: '0 4px', lineHeight: 1,
                }}>&#9650;</button>
                <button onClick={() => moveItem(item.id, 'down')} disabled={idx === phaseItems.length - 1} style={{
                  background: 'none', border: 'none', color: idx === phaseItems.length - 1 ? '#2a3a4d' : '#6B8299',
                  cursor: idx === phaseItems.length - 1 ? 'default' : 'pointer', fontSize: 11, padding: '0 4px', lineHeight: 1,
                }}>&#9660;</button>
              </div>

              {/* Item content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{item.label}</span>
                  {item.duration && (
                    <span style={{ fontSize: 9, color: '#6B8299', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>{item.duration}</span>
                  )}
                  {group && (
                    <span style={{ fontSize: 8, color: '#C9A96E', padding: '1px 6px', background: 'rgba(201,169,110,0.08)', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{group.label}</span>
                  )}
                  {item.adminOnly && (
                    <span style={{ fontSize: 8, color: '#f59e0b', padding: '1px 6px', background: 'rgba(245,158,11,0.08)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 600 }}>Admin Only</span>
                  )}
                  {item.coordinatorTopic && (
                    <span style={{ fontSize: 8, color: '#9B6DFF', padding: '1px 6px', background: 'rgba(155,109,255,0.08)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 600 }}>LC</span>
                  )}
                  {item.linkedProgression && (
                    <span style={{ fontSize: 8, color: '#4ade80', padding: '1px 6px', background: 'rgba(74,222,128,0.08)', borderRadius: 3, fontWeight: 600 }}>
                      {PROGRESSION_OPTIONS.find(p => p.key === item.linkedProgression)?.label ?? item.linkedProgression}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                  {item.description}
                </div>
                <div style={{ fontSize: 9, color: '#4B5563', marginTop: 4 }}>
                  Key: {item.itemKey}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, paddingTop: 2 }}>
                <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>Edit</button>
                <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>
      </>}

      {/* Groups editor */}
      {editorTab === 'groups' && (
        <GroupsEditor groups={groupDefs} onRefresh={fetchItems} isMobile={isMobile} />
      )}

      {/* Progressions editor */}
      {editorTab === 'progressions' && (
        <ProgressionsEditor progressions={progressionDefs} onRefresh={fetchItems} isMobile={isMobile} />
      )}
    </div>
  )
}

function GroupsEditor({ groups, onRefresh, isMobile }: { groups: PhaseGroupDef[]; onRefresh: () => void; isMobile: boolean }) {
  const [activePhase, setActivePhase] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ groupKey: '', label: '', icon: '', description: '', showTrainer: false })
  const [saving, setSaving] = useState(false)

  const phaseGroups = groups.filter(g => g.phase === activePhase).sort((a, b) => a.sortOrder - b.sortOrder)
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', outline: 'none' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }

  const resetForm = () => { setForm({ groupKey: '', label: '', icon: '', description: '', showTrainer: false }); setEditingId(null); setShowAdd(false) }

  const handleSave = async () => {
    setSaving(true)
    if (editingId) {
      await fetch('/api/admin/phase-groups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, label: form.label, icon: form.icon || null, description: form.description || null, showTrainer: form.showTrainer }) })
    } else {
      const key = form.groupKey || form.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      await fetch('/api/admin/phase-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: activePhase, groupKey: key, label: form.label, icon: form.icon || undefined, description: form.description || undefined, showTrainer: form.showTrainer }) })
    }
    resetForm(); setSaving(false); onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[1,2,3,4,5].map(ph => (
            <button key={ph} onClick={() => setActivePhase(ph)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: activePhase === ph ? 'rgba(201,169,110,0.12)' : 'transparent', border: `1px solid ${activePhase === ph ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.06)'}`, color: activePhase === ph ? '#C9A96E' : '#6B8299', cursor: 'pointer' }}>Phase {ph}</button>
          ))}
        </div>
        <button onClick={() => { resetForm(); setShowAdd(true) }} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add Group</button>
      </div>

      {showAdd && (
        <div style={{ padding: 16, marginBottom: 12, background: '#132238', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div><div style={lbl}>Label *</div><input value={form.label} onChange={e => { setForm(f => ({ ...f, label: e.target.value, groupKey: editingId ? f.groupKey : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') })) }} style={inp} /></div>
            <div><div style={lbl}>Icon</div><select value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}><option value="">None</option>{AVAILABLE_ICONS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
            <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}><div style={lbl}>Description</div><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inp} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}><input type="checkbox" checked={form.showTrainer} onChange={e => setForm(f => ({ ...f, showTrainer: e.target.checked }))} /> Show trainer</label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={resetForm} style={{ padding: '6px 14px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.label} style={{ padding: '6px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: 'pointer' }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {phaseGroups.map(g => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 6, background: '#132238', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{g.label}</span>
                {g.icon && <span style={{ fontSize: 9, color: '#C9A96E', padding: '1px 6px', background: 'rgba(201,169,110,0.08)', borderRadius: 3 }}>{g.icon}</span>}
                {g.showTrainer && <span style={{ fontSize: 8, color: '#4ade80', padding: '1px 6px', background: 'rgba(74,222,128,0.08)', borderRadius: 3 }}>Trainer</span>}
              </div>
              {g.description && <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>{g.description}</div>}
              <div style={{ fontSize: 9, color: '#4B5563', marginTop: 2 }}>Key: {g.groupKey}</div>
            </div>
            <button onClick={() => { setForm({ groupKey: g.groupKey, label: g.label, icon: g.icon ?? '', description: g.description ?? '', showTrainer: g.showTrainer }); setEditingId(g.id); setShowAdd(true) }} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>Edit</button>
            <button onClick={async () => { if (!confirm('Delete this group?')) return; await fetch(`/api/admin/phase-groups?id=${g.id}`, { method: 'DELETE' }); onRefresh() }} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressionsEditor({ progressions, onRefresh, isMobile }: { progressions: ProgressionDef[]; onRefresh: () => void; isMobile: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ key: '', label: '', description: '', icon: '', achievedWhen: '' })
  const [saving, setSaving] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', outline: 'none' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }

  const resetForm = () => { setForm({ key: '', label: '', description: '', icon: '', achievedWhen: '' }); setEditingId(null); setShowAdd(false) }

  const handleSave = async () => {
    setSaving(true)
    if (editingId) {
      await fetch('/api/admin/progressions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, label: form.label, description: form.description, icon: form.icon || null, achievedWhen: form.achievedWhen }) })
    } else {
      const key = form.key || form.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      await fetch('/api/admin/progressions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, label: form.label, description: form.description, icon: form.icon || undefined, achievedWhen: form.achievedWhen }) })
    }
    resetForm(); setSaving(false); onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#6B8299' }}>
          {progressions.length} progression badges. These appear as achievement badges in the agent portal.
        </div>
        <button onClick={() => { resetForm(); setShowAdd(true) }} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add Badge</button>
      </div>

      {showAdd && (
        <div style={{ padding: 16, marginBottom: 12, background: '#132238', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div><div style={lbl}>Label *</div><input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value, key: editingId ? f.key : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') }))} style={inp} /></div>
            <div><div style={lbl}>Icon</div><select value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}><option value="">None</option>{AVAILABLE_ICONS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
            <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}><div style={lbl}>Description *</div><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inp} placeholder="What this badge represents" /></div>
            <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}>
              <div style={lbl}>Unlock Condition *</div>
              <select value={form.achievedWhen} onChange={e => setForm(f => ({ ...f, achievedWhen: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Select a condition</option>
                <option value="always">Always (automatic)</option>
                <optgroup label="Phase 1 Items">
                  <option value="phase1_pass_license_test">Pass License Test</option>
                  <option value="phase1_business_marketing_plan">Business Marketing Plan</option>
                </optgroup>
                <optgroup label="Phase 2 Items">
                  <option value="phase2_fta_10">Complete 10 FTAs</option>
                  <option value="phase2_associate_promotion">Associate Promotion</option>
                  <option value="phase2_first_1000">Net License / First $1K</option>
                  <option value="phase2_net_license_and_appointed">Licensed &amp; Appointed</option>
                  <option value="phase2_client1_or_policies">First Client or Policy</option>
                </optgroup>
                <optgroup label="Phase 3 Items">
                  <option value="phase3_cft_classes">CFT Classes</option>
                  <option value="phase3_cft_coordinator_signoff">CFT Certification</option>
                </optgroup>
                <optgroup label="Phase 4+">
                  <option value="phase4_any_item">Reach Phase 4</option>
                  <option value="phase4_45k_points">45K Points</option>
                  <option value="phase5_150k_net_6mo">150K Net (6 months)</option>
                </optgroup>
                <optgroup label="Milestones">
                  <option value="milestone_50k_watch">$50K Watch</option>
                  <option value="milestone_100k_ring">$100K Ring</option>
                </optgroup>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={resetForm} style={{ padding: '6px 14px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.label || !form.description || !form.achievedWhen} style={{ padding: '6px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: 'pointer' }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {progressions.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 6, background: '#132238', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#C9A96E', fontWeight: 700, flexShrink: 0 }}>
              {p.icon ? p.icon.slice(0, 2) : p.label.slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{p.label}</div>
              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 1 }}>{p.description}</div>
              <div style={{ fontSize: 9, color: '#4B5563', marginTop: 2 }}>Achieved when: {p.achievedWhen}</div>
            </div>
            <button onClick={() => { setForm({ key: p.key, label: p.label, description: p.description, icon: p.icon ?? '', achievedWhen: p.achievedWhen }); setEditingId(p.id); setShowAdd(true) }} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>Edit</button>
            <button onClick={async () => { if (!confirm('Delete this badge?')) return; await fetch(`/api/admin/progressions?id=${p.id}`, { method: 'DELETE' }); onRefresh() }} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
