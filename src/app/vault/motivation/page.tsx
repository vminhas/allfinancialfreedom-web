'use client'

import { useState, useEffect, useMemo } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface Quote {
  id: string
  text: string
  voice: string
  attribution: string | null
  active: boolean
  sortKey: number
}

// Display labels for the voice registers (see motivation-quotes.ts).
// Free-form on the backend, so unknown values just show as-is.
const VOICE_LABELS: Record<string, string> = {
  classic: 'AFF Classic',
  decisive: 'Decisive',
  maxout: 'Max Out',
  state: 'State',
  warmth: 'Warmth',
  courage: 'Courage',
  grit: 'Grit',
}
const VOICE_OPTIONS = Object.keys(VOICE_LABELS)

// Suggested "in the spirit of" credit per register. Picking a voice in
// the add row prefills this (still editable / clearable). Matches
// MOTIVATION_VOICE_ATTRIBUTION on the backend.
const VOICE_ATTRIBUTION: Record<string, string> = {
  decisive: 'Mel Robbins',
  maxout: 'Ed Mylett',
  state: 'Tony Robbins',
  warmth: 'Zig Ziglar',
  courage: 'Brené Brown',
  grit: 'David Goggins',
}

export default function MotivationPage() {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [enabled, setEnabled] = useState(true)
  const [channelId, setChannelId] = useState('')
  const [channelInput, setChannelInput] = useState('')
  const [today, setToday] = useState('')
  const [todayAttribution, setTodayAttribution] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [voiceFilter, setVoiceFilter] = useState<string>('all')

  const [newText, setNewText] = useState('')
  const [newVoice, setNewVoice] = useState('classic')
  const [newAttribution, setNewAttribution] = useState('')
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editAttribution, setEditAttribution] = useState('')

  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const note = (kind: 'ok' | 'err', msg: string) => {
    setFlash({ kind, msg })
    setTimeout(() => setFlash(null), 4000)
  }

  const load = () => {
    fetch('/api/admin/motivation')
      .then(r => r.json())
      .then((d: { quotes: Quote[]; settings: { enabled: boolean; channelId: string }; today: string; todayAttribution: string | null }) => {
        setQuotes(d.quotes ?? [])
        setEnabled(d.settings?.enabled ?? true)
        setChannelId(d.settings?.channelId ?? '')
        setChannelInput(d.settings?.channelId ?? '')
        setToday(d.today ?? '')
        setTodayAttribution(d.todayAttribution ?? null)
        setLoading(false)
      })
      .catch(() => { setLoading(false); note('err', 'Could not load the library.') })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const patchSettings = async (body: { enabled?: boolean; channelId?: string }) => {
    const res = await fetch('/api/admin/motivation', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { note('err', (await res.json().catch(() => ({})))?.error || 'Save failed.'); return }
    const d = await res.json() as { settings: { enabled: boolean; channelId: string } }
    setEnabled(d.settings.enabled)
    setChannelId(d.settings.channelId)
    setChannelInput(d.settings.channelId)
    note('ok', 'Saved.')
  }

  const toggleEnabled = () => patchSettings({ enabled: !enabled })
  const saveChannel = () => patchSettings({ channelId: channelInput })

  const addQuote = async () => {
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    const res = await fetch('/api/admin/motivation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: newVoice, attribution: newAttribution.trim() || null }),
    })
    setAdding(false)
    if (!res.ok) { note('err', (await res.json().catch(() => ({})))?.error || 'Could not add.'); return }
    const d = await res.json() as { quote: Quote }
    setQuotes(prev => [...prev, d.quote])
    setNewText('')
    setNewAttribution('')
    note('ok', 'Line added.')
  }

  const saveEdit = async (id: string) => {
    const text = editText.trim()
    if (!text) return
    const res = await fetch(`/api/admin/motivation/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, attribution: editAttribution.trim() || null }),
    })
    if (!res.ok) { note('err', (await res.json().catch(() => ({})))?.error || 'Could not save.'); return }
    const d = await res.json() as { quote: Quote }
    setQuotes(prev => prev.map(q => q.id === id ? d.quote : q))
    setEditingId(null)
    note('ok', 'Updated.')
  }

  const toggleActive = async (q: Quote) => {
    const res = await fetch(`/api/admin/motivation/${q.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !q.active }),
    })
    if (!res.ok) { note('err', 'Could not update.'); return }
    setQuotes(prev => prev.map(x => x.id === q.id ? { ...x, active: !q.active } : x))
  }

  const deleteQuote = async (id: string) => {
    if (!confirm('Delete this line permanently?')) return
    const res = await fetch(`/api/admin/motivation/${id}`, { method: 'DELETE' })
    if (!res.ok) { note('err', 'Could not delete.'); return }
    setQuotes(prev => prev.filter(q => q.id !== id))
  }

  const sendNow = async () => {
    if (!confirm('Post today\'s line to the channel right now? This also marks today as posted so the scheduled 8am send is skipped.')) return
    setBusy(true)
    const res = await fetch('/api/admin/motivation/send-now', { method: 'POST' })
    setBusy(false)
    if (!res.ok) { note('err', (await res.json().catch(() => ({})))?.error || 'Send failed.'); return }
    note('ok', 'Posted to the channel.')
  }

  const activeCount = quotes.filter(q => q.active).length
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return quotes.filter(q =>
      (voiceFilter === 'all' || q.voice === voiceFilter) &&
      (!s || q.text.toLowerCase().includes(s))
    )
  }, [quotes, search, voiceFilter])

  const card: React.CSSProperties = { padding: 20, marginBottom: 16, background: '#132238', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6 }
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', outline: 'none' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }
  const goldBtn: React.CSSProperties = { background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
  const ghostBtn: React.CSSProperties = { background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#9BB0C4', borderRadius: 4, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }

  return (
    <div style={{ padding: isMobile ? 16 : '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', margin: 0 }}>Daily Motivation</h1>
        <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
          One line posts to the team channel every weekday at 8am ET. Edit the library, switch it on or off, or send today&apos;s line now.
        </p>
      </div>

      {flash && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 6, fontSize: 13,
          background: flash.kind === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${flash.kind === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: flash.kind === 'ok' ? '#86efac' : '#fca5a5',
        }}>
          {flash.msg}
        </div>
      )}

      {/* Settings + send now */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={toggleEnabled}
              aria-pressed={enabled}
              style={{
                width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
                background: enabled ? '#4ade80' : 'rgba(255,255,255,0.15)', transition: 'background 0.15s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 18, height: 18,
                borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
              }} />
            </button>
            <div>
              <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 600 }}>
                {enabled ? 'Posting is on' : 'Posting is paused'}
              </div>
              <div style={{ fontSize: 11, color: '#6B8299' }}>Weekdays at 8am ET, no pings.</div>
            </div>
          </div>
          <button onClick={sendNow} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Sending...' : 'Send today\'s line now'}
          </button>
        </div>

        <div style={{ height: 1, background: 'rgba(201,169,110,0.1)', margin: '16px 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          <div>
            <div style={lbl}>Today&apos;s line (preview)</div>
            <div style={{
              padding: '12px 14px', background: '#0A1628', borderLeft: '3px solid #FF8C42',
              borderRadius: 4, fontSize: 13, color: '#F2E8DA', fontWeight: 600, lineHeight: 1.5,
            }}>
              {today || 'No active lines.'}
              {today && todayAttribution && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#9BB0C4', fontWeight: 400, fontStyle: 'italic' }}>
                  in the spirit of {todayAttribution}
                </div>
              )}
            </div>
          </div>
          <div>
            <div style={lbl}>Discord channel ID</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                placeholder="Default: #announcements"
                style={inp}
              />
              <button
                onClick={saveChannel}
                disabled={channelInput.trim() === channelId.trim()}
                style={{ ...ghostBtn, opacity: channelInput.trim() === channelId.trim() ? 0.5 : 1 }}
              >
                Save
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
              Posting to channel <code style={{ color: '#9BB0C4' }}>{channelId || '(default)'}</code>. Leave blank to use the default announcements channel.
            </div>
          </div>
        </div>
      </div>

      {/* Library editor */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
            Library
            <span style={{ fontSize: 11, fontWeight: 400, color: '#6B8299', marginLeft: 8 }}>
              {activeCount} active &middot; {quotes.length} total
            </span>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lines..."
            style={{ ...inp, width: isMobile ? '100%' : 220 }}
          />
        </div>

        {/* Voice filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {['all', ...VOICE_OPTIONS].map(v => {
            const on = voiceFilter === v
            return (
              <button
                key={v}
                onClick={() => setVoiceFilter(v)}
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                  background: on ? 'rgba(201,169,110,0.18)' : 'transparent',
                  border: `1px solid ${on ? 'rgba(201,169,110,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: on ? '#C9A96E' : '#6B8299',
                }}
              >
                {v === 'all' ? 'All' : (VOICE_LABELS[v] ?? v)}
              </button>
            )
          })}
        </div>

        {/* Add new */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <textarea
              value={newText}
              onChange={e => setNewText(e.target.value)}
              rows={2}
              placeholder="Add a new line (no em-dashes)..."
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', flex: 1, minWidth: isMobile ? '100%' : 0 }}
            />
            <select
              value={newVoice}
              onChange={e => {
                const v = e.target.value
                setNewVoice(v)
                // Prefill the suggested credit for the chosen register
                // (still editable / clearable below).
                setNewAttribution(VOICE_ATTRIBUTION[v] ?? '')
              }}
              style={{ ...inp, width: isMobile ? '60%' : 130, cursor: 'pointer' }}
            >
              {VOICE_OPTIONS.map(v => <option key={v} value={v}>{VOICE_LABELS[v]}</option>)}
            </select>
            <button onClick={addQuote} disabled={adding || !newText.trim()} style={{ ...goldBtn, opacity: adding || !newText.trim() ? 0.6 : 1 }}>
              {adding ? '...' : 'Add'}
            </button>
          </div>
          <input
            value={newAttribution}
            onChange={e => setNewAttribution(e.target.value)}
            placeholder="In the spirit of... (optional credit, leave blank for none)"
            style={{ ...inp, marginTop: 8 }}
          />
        </div>

        {loading ? (
          <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: 28 }}>No lines match.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(q => (
              <div key={q.id} style={{
                padding: '12px 14px', borderRadius: 6, background: '#0F1D30',
                border: '1px solid rgba(255,255,255,0.05)', opacity: q.active ? 1 : 0.5,
              }}>
                {editingId === q.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={2}
                      style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    <input
                      value={editAttribution}
                      onChange={e => setEditAttribution(e.target.value)}
                      placeholder="In the spirit of... (optional, leave blank for none)"
                      style={{ ...inp, marginTop: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                      <button onClick={() => setEditingId(null)} style={ghostBtn}>Cancel</button>
                      <button onClick={() => saveEdit(q.id)} style={goldBtn}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#D6E0EB', lineHeight: 1.5 }}>{q.text}</div>
                      <div style={{ fontSize: 10, color: '#6B8299', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {VOICE_LABELS[q.voice] ?? q.voice}
                        {q.attribution && ` · in the spirit of ${q.attribution}`}
                        {!q.active && ' · inactive'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => toggleActive(q)} title={q.active ? 'Deactivate' : 'Activate'} style={ghostBtn}>
                        {q.active ? 'On' : 'Off'}
                      </button>
                      <button onClick={() => { setEditingId(q.id); setEditText(q.text); setEditAttribution(q.attribution ?? '') }} style={ghostBtn}>Edit</button>
                      <button onClick={() => deleteQuote(q.id)} style={{ ...ghostBtn, color: '#fca5a5', borderColor: 'rgba(248,113,113,0.3)' }}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
