'use client'

// Public team page editor.
// Three sections (Leadership / Directors / Associates), drag-reorder
// within each section, full CRUD, photo upload to Vercel Blob. Edits
// land on /api/vault/team-page/* and the public /team page re-reads
// on every request, so changes are live within seconds.

import { useEffect, useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'

type Section = 'LEADERSHIP' | 'DIRECTOR' | 'ASSOCIATE'

interface Member {
  id: string
  section: Section
  sortOrder: number
  name: string
  title: string | null
  credentials: string | null
  specialty: string | null
  location: string | null
  initials: string | null
  imageUrl: string | null
  bio: string | null
  calendly: string | null
  isActive: boolean
}

const SECTION_META: Record<Section, { label: string; sub: string }> = {
  LEADERSHIP: { label: 'Leadership',       sub: 'Large hero cards. Used for Vick & Melinee at the top of the team page.' },
  DIRECTOR:   { label: 'Directors',        sub: 'Side-by-side cards with a long bio and a Book-a-Call link.' },
  ASSOCIATE:  { label: 'Senior Associates', sub: 'Grid of square cards with specialty and location.' },
}
const SECTIONS: Section[] = ['LEADERSHIP', 'DIRECTOR', 'ASSOCIATE']

export default function TeamPageEditor() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Member | { id: null; section: Section } | null>(null)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/vault/team-page')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.members) setMembers(d.members) })
      .finally(() => setLoading(false))
  }, [])

  const showFlash = (kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text })
    setTimeout(() => setFlash(null), 2500)
  }

  const bySection = (s: Section) =>
    members.filter(m => m.section === s).sort((a, b) => a.sortOrder - b.sortOrder)

  // Reorder client-side, then persist. Drag is intra-section only.
  const handleDrop = async (overId: string, section: Section) => {
    if (!dragId || dragId === overId) { setDragId(null); return }
    const list = bySection(section)
    if (!list.find(m => m.id === dragId) || !list.find(m => m.id === overId)) {
      setDragId(null); return
    }
    const next = list.filter(m => m.id !== dragId)
    const insertAt = next.findIndex(m => m.id === overId)
    const dragged = list.find(m => m.id === dragId)!
    next.splice(insertAt, 0, dragged)
    const ids = next.map(m => m.id)
    setMembers(prev => prev.map(m => {
      if (m.section !== section) return m
      const idx = ids.indexOf(m.id)
      return idx === -1 ? m : { ...m, sortOrder: idx }
    }))
    setDragId(null)
    const res = await fetch('/api/vault/team-page/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, ids }),
    })
    if (!res.ok) showFlash('err', 'Reorder failed; refresh to re-sync.')
  }

  const saveMember = async (
    target: Member | { id: null; section: Section },
    patch: Partial<Member>,
  ) => {
    if (target.id === null) {
      const res = await fetch('/api/vault/team-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: target.section, ...patch }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showFlash('err', j.error || 'Create failed')
        return null
      }
      const { member } = await res.json() as { member: Member }
      setMembers(prev => [...prev, member])
      showFlash('ok', 'Added.')
      return member
    } else {
      const res = await fetch(`/api/vault/team-page/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showFlash('err', j.error || 'Save failed')
        return null
      }
      const { member } = await res.json() as { member: Member }
      setMembers(prev => prev.map(m => m.id === member.id ? member : m))
      showFlash('ok', 'Saved.')
      return member
    }
  }

  const uploadPhoto = async (id: string, file: File): Promise<Member | null> => {
    const fd = new FormData()
    fd.append('photo', file)
    const res = await fetch(`/api/vault/team-page/${id}/photo`, { method: 'POST', body: fd })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      showFlash('err', j.error || 'Photo upload failed')
      return null
    }
    const { member } = await res.json() as { member: Member }
    setMembers(prev => prev.map(m => m.id === member.id ? member : m))
    showFlash('ok', 'Photo updated.')
    return member
  }

  const deleteMember = async (id: string) => {
    if (!confirm('Remove this member from the team page?')) return
    const res = await fetch(`/api/vault/team-page/${id}`, { method: 'DELETE' })
    if (!res.ok) { showFlash('err', 'Delete failed'); return }
    setMembers(prev => prev.filter(m => m.id !== id))
    setEditing(null)
    showFlash('ok', 'Removed.')
  }

  const page: React.CSSProperties = { padding: 24, maxWidth: 1200, margin: '0 auto', color: '#fff', fontFamily: 'inherit' }
  const h1: React.CSSProperties   = { fontSize: 20, fontWeight: 700, margin: 0 }
  const sub: React.CSSProperties  = { fontSize: 12, color: '#6B8299', marginTop: 4 }
  const sectionWrap: React.CSSProperties = { marginTop: 32, padding: 20, background: '#132238', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 8 }
  const sectionHead: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C9A96E', margin: 0 }
  const sectionDesc: React.CSSProperties = { fontSize: 11, color: '#6B8299', marginTop: 4 }
  const gold: React.CSSProperties = { background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={h1}>Team Page</h1>
          <p style={sub}>Add, remove, reorder and edit anyone shown on <code style={{ color: '#C9A96E' }}>/team</code>. Changes go live within seconds.</p>
        </div>
        <a href="/team" target="_blank" rel="noopener noreferrer" style={{ ...gold, background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.4)' }}>View public page &nearr;</a>
      </div>

      {flash && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 6, fontSize: 12,
          background: flash.kind === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${flash.kind === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: flash.kind === 'ok' ? '#86efac' : '#fca5a5',
        }}>{flash.text}</div>
      )}

      {loading ? (
        <div style={{ marginTop: 40, color: '#6B8299', fontSize: 13 }}>Loading…</div>
      ) : (
        SECTIONS.map(section => (
          <div key={section} style={sectionWrap}>
            <div style={sectionHead}>
              <div>
                <h2 style={sectionTitle}>{SECTION_META[section].label}</h2>
                <p style={sectionDesc}>{SECTION_META[section].sub}</p>
              </div>
              <button onClick={() => setEditing({ id: null, section })} style={gold}>+ Add member</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {bySection(section).map(m => (
                <Card
                  key={m.id}
                  m={m}
                  isDragging={dragId === m.id}
                  onDragStart={() => setDragId(m.id)}
                  onDragOver={e => { if (dragId && dragId !== m.id) e.preventDefault() }}
                  onDrop={() => handleDrop(m.id, section)}
                  onEdit={() => setEditing(m)}
                />
              ))}
              {bySection(section).length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 18, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 6, color: '#6B8299', fontSize: 12, textAlign: 'center' }}>
                  No one in this section yet. Click &apos;Add member&apos; to put someone here.
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {editing && (
        <EditModal
          target={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const saved = await saveMember(editing, patch)
            if (saved) setEditing(null)
          }}
          onUploadPhoto={async (file) => {
            if (editing.id === null) {
              showFlash('err', 'Save the basics first, then upload a photo.')
              return
            }
            const updated = await uploadPhoto(editing.id, file)
            if (updated) setEditing(updated)
          }}
          onDelete={editing.id ? () => deleteMember(editing.id as string) : undefined}
        />
      )}
    </div>
  )
}

function Card({
  m, isDragging, onDragStart, onDragOver, onDrop, onEdit,
}: {
  m: Member
  isDragging: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onEdit: () => void
}) {
  const roleLine =
    m.section === 'ASSOCIATE' ? [m.specialty, m.location].filter(Boolean).join(' · ')
    : [m.title, m.credentials].filter(Boolean).join(' · ')

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        position: 'relative',
        background: '#0A1628',
        border: '1px solid rgba(201,169,110,0.15)',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : (m.isActive ? 1 : 0.6),
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '1/1', background: 'linear-gradient(135deg, #142D48, #2A5280)' }}>
        {m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imageUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A96E', fontFamily: 'var(--font-serif, serif)', fontSize: 36, fontWeight: 300 }}>
            {m.initials || m.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, left: 6, padding: '3px 6px', borderRadius: 3, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>≡ drag</div>
        {!m.isActive && (
          <div style={{ position: 'absolute', top: 6, right: 6, padding: '3px 6px', borderRadius: 3, background: 'rgba(248,113,113,0.85)', color: '#fff', fontSize: 9, fontWeight: 700 }}>HIDDEN</div>
        )}
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{m.name}</div>
        <div style={{ fontSize: 10, color: '#9BB0C4', marginTop: 4, lineHeight: 1.4, minHeight: 14 }}>{roleLine || '—'}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={onEdit} style={{ flex: 1, background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.4)', color: '#C9A96E', borderRadius: 3, padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>EDIT</button>
        </div>
      </div>
    </div>
  )
}

const SECTION_ASPECT: Record<Section, number> = {
  LEADERSHIP: 3 / 4,
  DIRECTOR: 4 / 5,
  ASSOCIATE: 1,
}

async function getCroppedBlob(src: string, crop: Area, mimeType = 'image/jpeg'): Promise<Blob> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = src })
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return new Promise(res => canvas.toBlob(b => res(b!), mimeType, 0.92))
}

function CropModal({ imageSrc, aspect, onDone, onCancel }: {
  imageSrc: string
  aspect: number
  onDone: (blob: Blob) => void
  onCancel: () => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels)
  }, [])

  const handleApply = async () => {
    if (!croppedArea) return
    const blob = await getCroppedBlob(imageSrc, croppedArea)
    onDone(blob)
  }

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 500, background: '#132238', borderRadius: 8,
        border: '1px solid rgba(201,169,110,0.2)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Crop Photo</div>
          <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>Drag to reposition, scroll to zoom</div>
        </div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', background: '#0A1628' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { width: '100%', height: '100%' },
              cropAreaStyle: { border: '2px solid #C9A96E' },
            }}
          />
        </div>
        <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: '#6B8299', flexShrink: 0 }}>Zoom</span>
          <input
            type="range" min={1} max={3} step={0.05} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#C9A96E' }}
          />
        </div>
        <div style={{
          padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button onClick={onCancel} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleApply} style={{
            background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4,
            padding: '7px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>Apply Crop</button>
        </div>
      </div>
    </div>
  )
}

function EditModal({
  target, onClose, onSave, onUploadPhoto, onDelete,
}: {
  target: Member | { id: null; section: Section }
  onClose: () => void
  onSave: (patch: Partial<Member>) => Promise<void>
  onUploadPhoto: (file: File) => Promise<void>
  onDelete?: () => void
}) {
  const isNew = target.id === null
  const section = target.section
  const initial: Partial<Member> = isNew
    ? { name: '', title: '', credentials: '', specialty: '', location: '', initials: '', bio: '', calendly: '', isActive: true }
    : { ...(target as Member) }
  const [form, setForm] = useState<Partial<Member>>(initial)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showField = (k: 'title' | 'credentials' | 'specialty' | 'location' | 'initials' | 'bio' | 'calendly') => {
    if (section === 'ASSOCIATE') return ['specialty', 'location', 'initials', 'calendly'].includes(k)
    return ['title', 'credentials', 'bio', 'calendly'].includes(k)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    try {
      const patch: Partial<Member> = {
        name: form.name, title: form.title ?? null, credentials: form.credentials ?? null,
        specialty: form.specialty ?? null, location: form.location ?? null, initials: form.initials ?? null,
        bio: form.bio ?? null, calendly: form.calendly ?? null, isActive: form.isActive ?? true,
      }
      await onSave(patch)
    } finally { setSaving(false) }
  }

  const handleFileSelect = (file: File) => {
    const url = URL.createObjectURL(file)
    setCropSrc(url)
  }

  const handleCropDone = async (blob: Blob) => {
    setCropSrc(null)
    setUploading(true)
    try {
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' })
      await onUploadPhoto(file)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#fff', outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
        background: '#132238', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 8, padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
            {isNew ? `Add to ${SECTION_META[section].label}` : `Edit ${(target as Member).name}`}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6B8299', fontSize: 18, cursor: 'pointer' }}>&times;</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 6, overflow: 'hidden', background: 'linear-gradient(135deg, #142D48, #2A5280)' }}>
              {!isNew && (target as Member).imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(target as Member).imageUrl as string} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A96E', fontFamily: 'var(--font-serif, serif)', fontSize: 32 }}>
                  {form.initials || (form.name || '').split(' ').map(p => p[0]).slice(0, 2).join('') || '—'}
                </div>
              )}
            </div>
            <label style={{ display: 'block', marginTop: 8 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={isNew || uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                style={{ display: 'none' }}
              />
              <span style={{
                display: 'block', textAlign: 'center', padding: '7px 10px', fontSize: 11, fontWeight: 700,
                background: isNew ? 'rgba(107,130,153,0.15)' : 'rgba(201,169,110,0.15)',
                border: `1px solid ${isNew ? 'rgba(107,130,153,0.3)' : 'rgba(201,169,110,0.4)'}`,
                color: isNew ? '#6B8299' : '#C9A96E', borderRadius: 4,
                cursor: isNew ? 'not-allowed' : 'pointer',
              }}>{uploading ? 'Uploading…' : (isNew ? 'Save first to upload' : 'Replace photo')}</span>
            </label>
            <p style={{ fontSize: 10, color: '#6B8299', marginTop: 6, lineHeight: 1.4 }}>JPG, PNG, WEBP or GIF up to 8 MB.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div>
              <div style={lbl}>Name *</div>
              <input style={inp} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jane Smith" />
            </div>
            {showField('title') && (
              <div>
                <div style={lbl}>Title</div>
                <input style={inp} value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Chief Operations Officer / Marketing Director" />
              </div>
            )}
            {showField('credentials') && (
              <div>
                <div style={lbl}>Credentials</div>
                <input style={inp} value={form.credentials ?? ''} onChange={e => setForm(f => ({ ...f, credentials: e.target.value }))} placeholder="MBA, EMD" />
              </div>
            )}
            {showField('specialty') && (
              <div>
                <div style={lbl}>Specialty</div>
                <input style={inp} value={form.specialty ?? ''} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} placeholder="Insurance Planning" />
              </div>
            )}
            {showField('location') && (
              <div>
                <div style={lbl}>Location</div>
                <input style={inp} value={form.location ?? ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Houston, TX" />
              </div>
            )}
            {showField('initials') && (
              <div>
                <div style={lbl}>Initials (shown when no photo)</div>
                <input style={inp} maxLength={3} value={form.initials ?? ''} onChange={e => setForm(f => ({ ...f, initials: e.target.value.toUpperCase() }))} placeholder="JS" />
              </div>
            )}
            {showField('calendly') && (
              <div>
                <div style={lbl}>Calendly link</div>
                <input style={inp} value={form.calendly ?? ''} onChange={e => setForm(f => ({ ...f, calendly: e.target.value }))} placeholder="https://calendly.com/..." />
              </div>
            )}
            {showField('bio') && (
              <div>
                <div style={lbl}>Bio</div>
                <textarea
                  style={{ ...inp, minHeight: 120, lineHeight: 1.5, resize: 'vertical' }}
                  value={form.bio ?? ''}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  placeholder="A paragraph or two about this person."
                />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isActive ?? true} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              Visible on the public team page
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            {onDelete && (
              <button onClick={onDelete} style={{ background: 'transparent', border: '1px solid rgba(248,113,113,0.4)', color: '#fca5a5', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Delete member</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.name?.trim()} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '7px 16px', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving || !form.name?.trim() ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>

        {cropSrc && (
          <CropModal
            imageSrc={cropSrc}
            aspect={SECTION_ASPECT[section]}
            onDone={handleCropDone}
            onCancel={() => { setCropSrc(null); if (fileRef.current) fileRef.current.value = '' }}
          />
        )}
      </div>
    </div>
  )
}
