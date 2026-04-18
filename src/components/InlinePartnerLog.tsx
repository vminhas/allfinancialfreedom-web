'use client'

import { useState } from 'react'
import { UserPlus, Check } from 'lucide-react'

interface Props {
  phaseItemKey: string
  onSaved: () => void
}

export default function InlinePartnerLog({ phaseItemKey, onSaved }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/agents/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          phaseItemKey,
          occupation: 'Recruit',
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Failed to save')
        return
      }
      setSaved(true)
      setName('')
      setPhone('')
      onSaved()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div style={{
        marginTop: 10, padding: '8px 12px',
        background: 'rgba(74,222,128,0.06)',
        border: '1px solid rgba(74,222,128,0.2)',
        borderRadius: 4,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Check size={14} color="#4ade80" />
        <span style={{ fontSize: 11, color: '#4ade80' }}>Partner logged</span>
        <button
          onClick={() => setSaved(false)}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: '#6B8299', fontSize: 10, cursor: 'pointer',
          }}
        >
          Log another
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <UserPlus size={12} color="#C9A96E" />
        <span style={{ fontSize: 10, fontWeight: 600, color: '#C9A96E', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
          Log partner
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          style={{
            flex: '1 1 120px', padding: '7px 10px', fontSize: 12,
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, color: '#ffffff', outline: 'none',
          }}
        />
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          style={{
            flex: '0 1 130px', padding: '7px 10px', fontSize: 12,
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, color: '#ffffff', outline: 'none',
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            padding: '7px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: name.trim() ? '#C9A96E' : 'rgba(201,169,110,0.2)',
            border: 'none', color: '#142D48',
            cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '...' : 'Save'}
        </button>
      </div>
      {error && <div style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>{error}</div>}
    </div>
  )
}
