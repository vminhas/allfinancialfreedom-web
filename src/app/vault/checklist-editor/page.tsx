'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PHASE_LABELS, PHASE_GROUPS, SYSTEM_PROGRESSIONS } from '@/lib/agent-constants'
import { useIsMobile } from '@/lib/useIsMobile'
import MarkdownDescription from '@/components/MarkdownDescription'
import { AVAILABLE_ICONS } from '@/lib/checklist-icons'

interface SlotDef {
  id: string
  label: string
  slotType: 'business_partner' | 'field_appointment'
  sortOrder: number
}

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
  videoUrl: string | null
  videoTitle: string | null
  videos: Array<{ url: string; title?: string | null }>
  postToActivity: boolean
  pingAdmin: boolean
  postToAnnouncements: boolean
  slotRequiredCount: number | null
  slots: SlotDef[]
}

const PROGRESSION_OPTIONS = SYSTEM_PROGRESSIONS.map(p => ({ key: p.key, label: p.label }))

interface PhaseGroupDef {
  id: string; phase: number; groupKey: string; label: string
  icon: string | null; description: string | null; showTrainer: boolean; sortOrder: number
  // Banner videos shown at the top of this step on the agent dashboard.
  // orientation defaults to 'landscape' but should be 'portrait' for
  // phone-shot vertical recordings (Melinee's selfie intros from her
  // phone) so the player doesn't letterbox them into a tiny center
  // strip on mobile. Stored as JSON array in the DB.
  videos?: Array<{ url: string; title: string | null; orientation?: 'landscape' | 'portrait' }>
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
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragSrcIdx = useRef<number | null>(null)

  const [form, setForm] = useState({
    itemKey: '', label: '', description: '', duration: '',
    groupKey: '', adminOnly: false, coordinatorTopic: '', linkedProgression: '',
    videos: [] as Array<{ url: string; title: string }>,
    postToActivity: true, pingAdmin: false, postToAnnouncements: false,
  })
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null)
  // Scrolled into view whenever the editor opens (top-level for "Add" or
  // inline for "Edit"), so the admin can always see the form they just
  // opened even if they were scrolled deep into a long phase.
  const formRef = useRef<HTMLDivElement | null>(null)

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
    setForm({ itemKey: '', label: '', description: '', duration: '', groupKey: '', adminOnly: false, coordinatorTopic: '', linkedProgression: '', videos: [], postToActivity: true, pingAdmin: false, postToAnnouncements: false })
    setEditingId(null)
    setShowAdd(false)
    setVideoUploadError(null)
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
      videos: (Array.isArray(item.videos) && item.videos.length
        ? item.videos.map(v => ({ url: v.url, title: v.title ?? '' }))
        : item.videoUrl
          ? [{ url: item.videoUrl, title: item.videoTitle ?? '' }]
          : []
      ),
      postToActivity: item.postToActivity,
      pingAdmin: item.pingAdmin,
      postToAnnouncements: item.postToAnnouncements,
    })
    setEditingId(item.id)
    setShowAdd(true)
    setVideoUploadError(null)
  }

  // Scroll the editor into view whenever it opens or switches to a different
  // item. Without this, clicking Edit on a row that's far below the form's
  // top-of-page anchor produced a "nothing happened" experience.
  useEffect(() => {
    if (!showAdd) return
    // requestAnimationFrame so the DOM has settled before we measure.
    const r = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(r)
  }, [showAdd, editingId])

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
            videos: form.videos.filter(v => v.url.trim()).map(v => ({ url: v.url.trim(), title: v.title.trim() || null })),
            postToActivity: form.postToActivity,
            pingAdmin: form.pingAdmin,
            postToAnnouncements: form.postToAnnouncements,
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
            videos: form.videos.filter(v => v.url.trim()).map(v => ({ url: v.url.trim(), title: v.title.trim() || null })),
            postToActivity: form.postToActivity,
            pingAdmin: form.pingAdmin,
            postToAnnouncements: form.postToAnnouncements,
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

  const handleDrop = async (dropIdx: number) => {
    const fromIdx = dragSrcIdx.current
    if (fromIdx === null || fromIdx === dropIdx) { setDragOverId(null); dragSrcIdx.current = null; return }
    const newItems = [...phaseItems]
    const [moved] = newItems.splice(fromIdx, 1)
    newItems.splice(dropIdx, 0, moved)
    dragSrcIdx.current = null
    setDragOverId(null)
    await fetch('/api/admin/phase-items/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newItems.map(i => i.id) }),
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
        {[1, 2, 3, 4, 5, 6].map(ph => (
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

      {/* Add/Edit form. The ref lets us scrollIntoView when the form opens
          so a "Click Edit on a row buried far below" workflow doesn't leave
          the form invisible above the viewport. */}
      {showAdd && (
        <div ref={formRef} style={{
          padding: 20, marginBottom: 16,
          background: '#132238',
          border: editingId ? '1px solid rgba(201,169,110,0.45)' : '1px solid rgba(201,169,110,0.15)',
          borderLeft: editingId ? '3px solid #C9A96E' : '1px solid rgba(201,169,110,0.15)',
          borderRadius: 6,
          // Soft gold glow when editing so it's unmistakable that this form
          // belongs to the highlighted row in the list below.
          boxShadow: editingId ? '0 0 0 4px rgba(201,169,110,0.06)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {editingId ? (
                <>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#C9A96E', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '3px 8px', background: 'rgba(201,169,110,0.12)', borderRadius: 3 }}>Editing</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>{form.label || items.find(i => i.id === editingId)?.label || 'Item'}</span>
                </>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>Add Item to Phase {activePhase}</span>
              )}
            </div>
            <button
              onClick={resetForm}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}
              title="Close editor"
            >
              ✕ Close
            </button>
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

          {/* Discord notifications — fan-out config for when an agent
              ticks this item off. The activity-channel post is on by
              default; the other two are opt-in. */}
          <div style={{ marginTop: 18, padding: '14px 16px', background: 'rgba(96,165,250,0.04)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 6 }}>
            <div style={{ ...lbl, marginBottom: 10 }}>Discord notifications on completion</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.postToActivity} onChange={e => setForm(f => ({ ...f, postToActivity: e.target.checked }))} />
                Post to <code style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>#agent-activity</code>
                <span style={{ fontSize: 10, color: '#6B8299' }}>(default on, gives the team a live activity feed)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.pingAdmin} onChange={e => setForm(f => ({ ...f, pingAdmin: e.target.checked }))} />
                Ping admin (Vick)
                <span style={{ fontSize: 10, color: '#6B8299' }}>(use for milestones worth a personal congrats)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.postToAnnouncements} onChange={e => setForm(f => ({ ...f, postToAnnouncements: e.target.checked }))} />
                Broadcast to <code style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>#announcements</code>
                <span style={{ fontSize: 10, color: '#6B8299' }}>(public celebratory post, all agents see it)</span>
              </label>
            </div>
          </div>

          {/* Walkthrough videos — admins can attach one or more Loom URLs,
              Drive shares, or uploaded video files. Rendered in order on the
              agent side. Uploads append a new row; URL fields can be edited
              in place. */}
          <div style={{ marginTop: 18, padding: '14px 16px', background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6 }}>
            <div style={{ ...lbl, marginBottom: 10 }}>Walkthrough videos (optional)</div>

            {form.videos.length === 0 && (
              <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 10, fontStyle: 'italic' }}>
                No videos attached. Use &quot;+ Add video URL&quot; or upload a file below.
              </div>
            )}

            {form.videos.map((v, idx) => (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto',
                gap: 8, marginBottom: 8, alignItems: 'start',
              }}>
                <div>
                  {idx === 0 && <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>Loom / Drive / direct video URL</div>}
                  <input
                    value={v.url}
                    onChange={e => setForm(f => ({ ...f, videos: f.videos.map((vv, i) => i === idx ? { ...vv, url: e.target.value } : vv) }))}
                    placeholder="https://www.loom.com/share/..."
                    style={inp}
                  />
                </div>
                <div>
                  {idx === 0 && <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>Button label (defaults to &quot;Watch the walkthrough&quot;)</div>}
                  <input
                    value={v.title}
                    onChange={e => setForm(f => ({ ...f, videos: f.videos.map((vv, i) => i === idx ? { ...vv, title: e.target.value } : vv) }))}
                    placeholder="e.g. How to schedule your exam"
                    style={inp}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: idx === 0 ? 18 : 0 }}>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, videos: f.videos.filter((_, i) => i !== idx) }))}
                    title="Remove video"
                    style={{ padding: '6px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, videos: [...f.videos, { url: '', title: '' }] }))}
                style={{ padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'transparent', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                + Add video URL
              </button>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 4,
                background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)',
                color: '#C9A96E', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: uploadingVideo ? 'wait' : 'pointer',
                opacity: uploadingVideo ? 0.6 : 1,
              }}>
                {uploadingVideo ? 'Uploading...' : '↑ Upload video file'}
                <input
                  type="file"
                  accept="video/mp4,video/quicktime"
                  disabled={uploadingVideo}
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setUploadingVideo(true)
                    setVideoUploadError(null)
                    try {
                      const fd = new FormData()
                      fd.append('file', file)
                      if (form.itemKey) fd.append('itemKey', form.itemKey)
                      const res = await fetch('/api/admin/phase-items/upload-video', { method: 'POST', body: fd })
                      const d = await res.json().catch(() => ({})) as { url?: string; error?: string }
                      if (!res.ok || !d.url) {
                        setVideoUploadError(d.error ?? 'Upload failed')
                      } else {
                        // Append the upload as a new entry. Admins can rename
                        // it in the title field after.
                        setForm(f => ({ ...f, videos: [...f.videos, { url: d.url!, title: '' }] }))
                      }
                    } catch {
                      setVideoUploadError('Network error')
                    } finally {
                      setUploadingVideo(false)
                      e.target.value = ''
                    }
                  }}
                  style={{ display: 'none' }}
                />
              </label>
              <span style={{ fontSize: 10, color: '#6B8299', lineHeight: 1.5 }}>
                Loom and Google Drive URLs embed inline. <strong style={{ color: '#9BB0C4' }}>Both must be set to &quot;Anyone with the link can view&quot;</strong> in their share settings or the iframe shows a sign-in prompt instead of the player. Uploaded files: <strong style={{ color: '#9BB0C4' }}>MP4 (H.264) or MOV only, max 500MB.</strong> WebM and MKV won&apos;t play on Safari/iOS — convert before uploading.
              </span>
            </div>
            {videoUploadError && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#EF4444' }}>{videoUploadError}</div>
            )}
          </div>

          {/* Slots — only visible when editing an existing item */}
          {editingId && (
            <SlotsEditor
              itemId={editingId}
              slots={(items.find(i => i.id === editingId)?.slots ?? [])}
              requiredCount={items.find(i => i.id === editingId)?.slotRequiredCount ?? null}
              onRefresh={fetchItems}
              isMobile={isMobile}
            />
          )}

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
          const prevGroup = idx > 0 ? phaseItems[idx - 1].groupKey : null
          const showGroupHeader = item.groupKey !== prevGroup
          const isEditingThis = editingId === item.id
          const isDragOver = dragOverId === item.id && dragSrcIdx.current !== idx
          return (
            <div key={item.id}>
              {showGroupHeader && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px 6px',
                  marginTop: idx === 0 ? 0 : 8,
                }}>
                  <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: '#6B8299',
                    padding: '2px 8px', borderRadius: 3,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {group?.label ?? '(No group)'}
                  </span>
                  <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>
              )}
            <div
              draggable
              onDragStart={() => { dragSrcIdx.current = idx }}
              onDragOver={e => { e.preventDefault(); setDragOverId(item.id) }}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { dragSrcIdx.current = null; setDragOverId(null) }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 16px', borderRadius: 6,
                background: isEditingThis ? 'rgba(201,169,110,0.06)' : '#132238',
                border: isDragOver
                  ? '1px solid rgba(201,169,110,0.6)'
                  : isEditingThis ? '1px solid rgba(201,169,110,0.45)' : '1px solid rgba(255,255,255,0.05)',
                borderLeft: isDragOver
                  ? '3px solid #C9A96E'
                  : isEditingThis ? '3px solid #C9A96E' : '1px solid rgba(255,255,255,0.05)',
                boxShadow: isEditingThis ? '0 0 0 4px rgba(201,169,110,0.06)' : 'none',
                opacity: dragSrcIdx.current === idx ? 0.4 : 1,
                transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
                cursor: 'grab',
              }}>
              {/* Drag handle */}
              <div style={{ flexShrink: 0, paddingTop: 3, color: '#3a5068', fontSize: 14, lineHeight: 1, userSelect: 'none', cursor: 'grab' }}>
                ⠿
              </div>

              {/* Item content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  {isEditingThis && (
                    <span style={{ fontSize: 8, color: '#C9A96E', padding: '2px 7px', background: 'rgba(201,169,110,0.18)', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.12em' }}>Editing</span>
                  )}
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
                  {item.pingAdmin && (
                    <span style={{ fontSize: 8, color: '#60a5fa', padding: '1px 6px', background: 'rgba(96,165,250,0.1)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 600 }}>Pings Admin</span>
                  )}
                  {item.postToAnnouncements && (
                    <span style={{ fontSize: 8, color: '#60a5fa', padding: '1px 6px', background: 'rgba(96,165,250,0.1)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 600 }}>Announces</span>
                  )}
                  {!item.postToActivity && (
                    <span style={{ fontSize: 8, color: '#6B8299', padding: '1px 6px', background: 'rgba(107,130,153,0.1)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 600 }}>Silent</span>
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
                {isEditingThis ? (
                  <button
                    onClick={resetForm}
                    style={{ background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', fontSize: 11, cursor: 'pointer', padding: '2px 10px', borderRadius: 3, fontWeight: 600 }}
                  >
                    Close
                  </button>
                ) : (
                  <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>Edit</button>
                )}
                <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Delete</button>
              </div>
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
  const [form, setForm] = useState({ groupKey: '', label: '', icon: '', description: '', showTrainer: false, videoUrl: '', videoTitle: '', videoOrientation: 'landscape' as 'landscape' | 'portrait' })
  const [saving, setSaving] = useState(false)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const dragGroupSrcIdx = useRef<number | null>(null)

  const phaseGroups = groups.filter(g => g.phase === activePhase).sort((a, b) => a.sortOrder - b.sortOrder)

  const handleGroupDrop = async (dropIdx: number) => {
    const fromIdx = dragGroupSrcIdx.current
    if (fromIdx === null || fromIdx === dropIdx) { setDragOverGroupId(null); dragGroupSrcIdx.current = null; return }
    const newGroups = [...phaseGroups]
    const [moved] = newGroups.splice(fromIdx, 1)
    newGroups.splice(dropIdx, 0, moved)
    dragGroupSrcIdx.current = null
    setDragOverGroupId(null)
    await fetch('/api/admin/phase-groups/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newGroups.map(g => g.id) }),
    })
    onRefresh()
  }
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', outline: 'none' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }

  const resetForm = () => { setForm({ groupKey: '', label: '', icon: '', description: '', showTrainer: false, videoUrl: '', videoTitle: '', videoOrientation: 'landscape' }); setEditingId(null); setShowAdd(false) }

  const handleSave = async () => {
    setSaving(true)
    // Build the videos array from the URL + title + orientation fields.
    // Empty URL means no video; we send an explicit empty array so
    // unsetting a previously-saved video clears it from the DB.
    const videos = form.videoUrl.trim()
      ? [{ url: form.videoUrl.trim(), title: form.videoTitle.trim() || null, orientation: form.videoOrientation }]
      : []
    if (editingId) {
      await fetch('/api/admin/phase-groups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, label: form.label, icon: form.icon || null, description: form.description || null, showTrainer: form.showTrainer, videos }) })
    } else {
      const key = form.groupKey || form.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const created = await fetch('/api/admin/phase-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: activePhase, groupKey: key, label: form.label, icon: form.icon || undefined, description: form.description || undefined, showTrainer: form.showTrainer }) })
      // Group POST doesn't accept videos at create time (POST handler
      // is minimal). Patch the new row with videos via PUT if we have any.
      if (created.ok && videos.length > 0) {
        const newGroup = await created.json() as { id: string }
        await fetch('/api/admin/phase-groups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: newGroup.id, videos }) })
      }
    }
    resetForm(); setSaving(false); onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[1,2,3,4,5,6].map(ph => (
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
            <div style={{ gridColumn: isMobile ? undefined : 'span 2' }}>
              <div style={lbl}>Banner Video URL</div>
              <input
                value={form.videoUrl}
                onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                placeholder="Loom share URL, Google Drive video, or Vercel Blob URL"
                style={inp}
              />
              <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
                Optional. Shown at the top of this step on the agent dashboard. Leave blank for no video.
              </div>
            </div>
            <div>
              <div style={lbl}>Video Title</div>
              <input
                value={form.videoTitle}
                onChange={e => setForm(f => ({ ...f, videoTitle: e.target.value }))}
                placeholder='e.g. "Welcome to AFF"'
                style={inp}
              />
            </div>
            <div>
              <div style={lbl}>Orientation</div>
              <select
                value={form.videoOrientation}
                onChange={e => setForm(f => ({ ...f, videoOrientation: e.target.value as 'landscape' | 'portrait' }))}
                style={{ ...inp, cursor: 'pointer' }}
              >
                <option value="landscape">Landscape (16:9, desktop screen recording)</option>
                <option value="portrait">Portrait (9:16, phone-shot selfie video)</option>
              </select>
              <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
                Pick portrait for vertical phone recordings so they don&rsquo;t letterbox on mobile.
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}><input type="checkbox" checked={form.showTrainer} onChange={e => setForm(f => ({ ...f, showTrainer: e.target.checked }))} /> Show trainer</label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={resetForm} style={{ padding: '6px 14px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.label} style={{ padding: '6px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#C9A96E', border: 'none', color: '#142D48', cursor: 'pointer' }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {phaseGroups.map((g, gIdx) => (
          <div
            key={g.id}
            draggable
            onDragStart={() => { dragGroupSrcIdx.current = gIdx }}
            onDragOver={e => { e.preventDefault(); setDragOverGroupId(g.id) }}
            onDrop={() => handleGroupDrop(gIdx)}
            onDragEnd={() => { dragGroupSrcIdx.current = null; setDragOverGroupId(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 6,
              background: '#132238',
              border: dragOverGroupId === g.id && dragGroupSrcIdx.current !== gIdx
                ? '1px solid rgba(201,169,110,0.6)'
                : '1px solid rgba(255,255,255,0.05)',
              opacity: dragGroupSrcIdx.current === gIdx ? 0.4 : 1,
              cursor: 'grab',
              transition: 'border-color 0.15s, opacity 0.15s',
            }}>
            {/* Drag handle */}
            <div style={{ color: '#3a5068', fontSize: 14, flexShrink: 0, userSelect: 'none', cursor: 'grab' }}>⠿</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{g.label}</span>
                {g.icon && <span style={{ fontSize: 9, color: '#C9A96E', padding: '1px 6px', background: 'rgba(201,169,110,0.08)', borderRadius: 3 }}>{g.icon}</span>}
                {g.showTrainer && <span style={{ fontSize: 8, color: '#4ade80', padding: '1px 6px', background: 'rgba(74,222,128,0.08)', borderRadius: 3 }}>Trainer</span>}
                {Array.isArray(g.videos) && g.videos.length > 0 && (
                  <span title={g.videos[0].title ?? g.videos[0].url} style={{ fontSize: 8, color: '#60a5fa', padding: '1px 6px', background: 'rgba(96,165,250,0.10)', borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>
                    ▶ Video
                  </span>
                )}
              </div>
              {g.description && <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>{g.description}</div>}
              <div style={{ fontSize: 9, color: '#4B5563', marginTop: 2 }}>Key: {g.groupKey}</div>
            </div>
            <button onClick={() => {
              const firstVideo = Array.isArray(g.videos) ? g.videos[0] : undefined
              setForm({
                groupKey: g.groupKey, label: g.label,
                icon: g.icon ?? '', description: g.description ?? '',
                showTrainer: g.showTrainer,
                videoUrl: firstVideo?.url ?? '',
                videoTitle: firstVideo?.title ?? '',
                videoOrientation: firstVideo?.orientation === 'portrait' ? 'portrait' : 'landscape',
              })
              setEditingId(g.id); setShowAdd(true)
            }} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>Edit</button>
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

// ── Slots editor ─────────────────────────────────────────────────────────────
function SlotsEditor({ itemId, slots, requiredCount, onRefresh, isMobile }: {
  itemId: string
  slots: SlotDef[]
  requiredCount: number | null
  onRefresh: () => void
  isMobile: boolean
}) {
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editType, setEditType] = useState<'business_partner' | 'field_appointment'>('business_partner')
  const [saving, setSaving] = useState(false)

  const [addLabel, setAddLabel] = useState('')
  const [addType, setAddType] = useState<'business_partner' | 'field_appointment'>('business_partner')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const [reqCount, setReqCount] = useState<string>(requiredCount !== null ? String(requiredCount) : '')
  const [savingReq, setSavingReq] = useState(false)

  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: 12, background: '#0A1628',
    border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', outline: 'none',
  }

  const startEdit = (slot: SlotDef) => {
    setEditingSlotId(slot.id)
    setEditLabel(slot.label)
    setEditType(slot.slotType)
  }

  const handleSaveEdit = async () => {
    if (!editingSlotId || !editLabel.trim()) return
    setSaving(true)
    await fetch('/api/admin/phase-items/slots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingSlotId, label: editLabel.trim(), slotType: editType }),
    })
    setSaving(false)
    setEditingSlotId(null)
    onRefresh()
  }

  const handleAdd = async () => {
    if (!addLabel.trim()) return
    setAdding(true)
    await fetch('/api/admin/phase-items/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phaseItemDefinitionId: itemId, label: addLabel.trim(), slotType: addType }),
    })
    setAddLabel('')
    setShowAdd(false)
    setAdding(false)
    onRefresh()
  }

  const handleDelete = async (slotId: string) => {
    if (!confirm('Delete this slot? Any agent fulfillments linked to it will also be removed.')) return
    await fetch(`/api/admin/phase-items/slots?id=${slotId}`, { method: 'DELETE' })
    onRefresh()
  }

  const handleSaveReqCount = async () => {
    setSavingReq(true)
    const parsed = reqCount.trim() === '' ? null : parseInt(reqCount.trim(), 10)
    await fetch('/api/admin/phase-items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, slotRequiredCount: isNaN(parsed as number) ? null : parsed }),
    })
    setSavingReq(false)
    onRefresh()
  }

  return (
    <div style={{ marginTop: 18, padding: '14px 16px', background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.18)', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9B6DFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Milestone Slots ({slots.length})
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd(s => !s); setEditingSlotId(null) }}
          style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'transparent', border: '1px solid rgba(155,109,255,0.3)', color: '#9B6DFF', cursor: 'pointer' }}
        >
          {showAdd ? 'Cancel' : '+ Add Slot'}
        </button>
      </div>

      <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 10, lineHeight: 1.5 }}>
        Each slot is a named placeholder an agent fills by linking a real BP or FTA record.
        Items with slots cannot be manually checked — completion is driven by linked records.
      </div>

      {/* Existing slots */}
      {slots.map(slot => (
        <div key={slot.id} style={{ marginBottom: 4 }}>
          {editingSlotId === slot.id ? (
            /* Inline edit form */
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto auto', gap: 6, padding: '8px 10px', background: 'rgba(155,109,255,0.1)', border: '1px solid rgba(155,109,255,0.3)', borderRadius: 4, alignItems: 'center' }}>
              <input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                style={{ ...inp }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingSlotId(null) }}
                autoFocus
              />
              <select
                value={editType}
                onChange={e => setEditType(e.target.value as 'business_partner' | 'field_appointment')}
                style={{ ...inp, cursor: 'pointer' }}
              >
                <option value="business_partner">Business Partner</option>
                <option value="field_appointment">Field Appointment</option>
              </select>
              <button onClick={handleSaveEdit} disabled={saving || !editLabel.trim()} style={{ padding: '7px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#9B6DFF', border: 'none', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {saving ? '...' : 'Save'}
              </button>
              <button onClick={() => setEditingSlotId(null)} style={{ padding: '7px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          ) : (
            /* Display row */
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.12)', borderRadius: 4 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{slot.label}</span>
                <span style={{ marginLeft: 8, fontSize: 9, color: '#9B6DFF', padding: '1px 6px', background: 'rgba(155,109,255,0.12)', borderRadius: 3, textTransform: 'uppercase', fontWeight: 600 }}>
                  {slot.slotType === 'business_partner' ? 'Business Partner' : 'Field Appointment'}
                </span>
              </div>
              <button onClick={() => startEdit(slot)} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>Edit</button>
              <button onClick={() => handleDelete(slot.id)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>Remove</button>
            </div>
          )}
        </div>
      ))}

      {/* Add new slot form */}
      {showAdd && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto', gap: 8, marginTop: 8, alignItems: 'end' }}>
          <input
            value={addLabel}
            onChange={e => setAddLabel(e.target.value)}
            placeholder='e.g. "Business Partner 1"'
            style={{ ...inp, width: '100%' }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            autoFocus
          />
          <select
            value={addType}
            onChange={e => setAddType(e.target.value as 'business_partner' | 'field_appointment')}
            style={{ ...inp, cursor: 'pointer' }}
          >
            <option value="business_partner">Business Partner</option>
            <option value="field_appointment">Field Appointment</option>
          </select>
          <button onClick={handleAdd} disabled={adding || !addLabel.trim()} style={{ padding: '7px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#9B6DFF', border: 'none', color: '#ffffff', cursor: adding ? 'wait' : 'pointer', opacity: adding ? 0.7 : 1, whiteSpace: 'nowrap' }}>
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {/* Required count — only shown when there are 2+ slots */}
      {slots.length >= 2 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(155,109,255,0.15)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9B6DFF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Completion Requirement
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#9BB0C4' }}>Agent must fill</span>
            <input
              type="number"
              min={1}
              max={slots.length}
              value={reqCount}
              onChange={e => setReqCount(e.target.value)}
              placeholder={String(slots.length)}
              style={{ ...inp, width: 56, textAlign: 'center' }}
            />
            <span style={{ fontSize: 11, color: '#9BB0C4' }}>of {slots.length} slots</span>
            <span style={{ fontSize: 10, color: '#4B5563' }}>
              (leave blank = all {slots.length} required)
            </span>
            <button
              onClick={handleSaveReqCount}
              disabled={savingReq}
              style={{ padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.3)', color: '#9B6DFF', cursor: 'pointer' }}
            >
              {savingReq ? 'Saving...' : 'Save'}
            </button>
          </div>
          {requiredCount !== null && requiredCount < slots.length && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#4ade80' }}>
              Currently: any {requiredCount} of {slots.length} slots completes this task (OR logic)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
