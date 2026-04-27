'use client'

import { useState, useEffect, useCallback } from 'react'

interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  licenseType?: string
  currentAgency?: string
  state?: string
  wornOut: boolean
  outreachStatus?: string
  ghlContactId?: string
  createdAt: string
  _count?: { messages: number }
}

function normalizeLicense(raw?: string): string {
  if (!raw) return '—'
  const r = raw.toLowerCase()
  if (r.includes('accident') && r.includes('health') && r.includes('life')) return 'Life & Health'
  if (r.includes('accident') && r.includes('health')) return 'Health'
  if (r === 'life') return 'Life'
  if (r.includes('life')) return 'Life'
  if (r.includes('property') || r.includes('casualty') || r === 'p&c') return 'P&C'
  if (r.includes('variable')) return 'Variable'
  if (r.includes('health')) return 'Health'
  return raw
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#6B8299',
  sent: '#C9A96E',
  responded: '#4ade80',
  duplicate: '#9B6DFF',
  'opted-out': '#f87171',
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [licenseFilter, setLicenseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [wornFilter, setWornFilter] = useState('')
  const [followUpFilter, setFollowUpFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (licenseFilter) params.set('licenseType', licenseFilter)
    if (statusFilter) params.set('outreachStatus', statusFilter)
    if (wornFilter) params.set('wornOut', wornFilter)
    if (followUpFilter) params.set('followUpCount', followUpFilter)
    const res = await fetch(`/api/admin/contacts?${params}`)
    const data = await res.json()
    setContacts(data.contacts ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [page, licenseFilter, statusFilter, wornFilter, followUpFilter])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / 50)

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selected.size === contacts.length) setSelected(new Set())
    else setSelected(new Set(contacts.map(c => c.id)))
  }

  async function handleDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} contact${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    await fetch('/api/admin/contacts/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    })
    setSelected(new Set())
    await load()
    setDeleting(false)
  }

  const selectStyle = {
    padding: '8px 12px', background: '#142D48', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#9BB0C4', fontSize: 12, cursor: 'pointer', outline: 'none',
  }

  return (
    <div>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>Database</p>
          <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: '0 0 6px' }}>Contacts <span style={{ color: '#6B8299', fontSize: 16 }}>({total.toLocaleString()})</span></h1>
          <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>All imported agents. Filter by license type, outreach status, or lead type. Select contacts to bulk delete.</p>
        </div>
      </div>

      {/* Filters + delete bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={licenseFilter} onChange={e => { setLicenseFilter(e.target.value); setPage(1) }} style={selectStyle}>
          {['', 'life', 'health', 'p&c', 'variable', 'multiple'].map(o => (
            <option key={o} value={o}>{o || 'All License Types'}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={selectStyle}>
          {['', 'pending', 'sent', 'responded', 'opted-out'].map(o => (
            <option key={o} value={o}>{o || 'All Statuses'}</option>
          ))}
        </select>
        <select value={wornFilter} onChange={e => { setWornFilter(e.target.value); setPage(1) }} style={selectStyle}>
          {[{ v: '', l: 'All Leads' }, { v: 'false', l: 'Fresh' }, { v: 'true', l: 'Worn Out' }].map(o => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
        <select value={followUpFilter} onChange={e => { setFollowUpFilter(e.target.value); setPage(1) }} style={selectStyle}>
          {[{ v: '', l: 'All Follow-ups' }, { v: '0', l: 'Not contacted' }, { v: '1', l: '1 email sent' }, { v: '2', l: '2 emails sent' }, { v: '3', l: '3 emails sent' }].map(o => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>

        {selected.size > 0 && (
          <button onClick={handleDelete} disabled={deleting} style={{
            marginLeft: 'auto', padding: '8px 20px', background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.4)', borderRadius: 4, color: '#f87171',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: deleting ? 'not-allowed' : 'pointer',
          }}>
            {deleting ? 'Deleting...' : `Delete ${selected.size} selected`}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th style={{ padding: '12px 16px', width: 32 }}>
                <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleAll} />
              </th>
              {['Name', 'Email', 'License', 'Agency', 'State', 'Status', 'Emails', 'GHL'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B8299', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#6B8299', fontSize: 13 }}>Loading...</td></tr>
            ) : contacts.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#6B8299', fontSize: 13 }}>No contacts match your filters.</td></tr>
            ) : contacts.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: selected.has(c.id) ? 'rgba(248,113,113,0.04)' : 'transparent' }}>
                <td style={{ padding: '10px 16px' }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <p style={{ color: '#ffffff', fontSize: 13, margin: '0 0 2px' }}>{c.firstName} {c.lastName}</p>
                  {c.wornOut && <span style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 4px', borderRadius: 2 }}>soft</span>}
                </td>
                <td style={{ padding: '10px 16px', color: '#9BB0C4', fontSize: 12 }}>{c.email}</td>
                <td style={{ padding: '10px 16px', color: '#9BB0C4', fontSize: 12 }}>{normalizeLicense(c.licenseType)}</td>
                <td style={{ padding: '10px 16px', color: '#9BB0C4', fontSize: 12 }}>{c.currentAgency ?? '—'}</td>
                <td style={{ padding: '10px 16px', color: '#9BB0C4', fontSize: 12 }}>{c.state ?? '—'}</td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: STATUS_COLORS[c.outreachStatus ?? 'pending'] ?? '#6B8299' }}>
                    {c.outreachStatus ?? 'pending'}
                  </span>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  {(c._count?.messages ?? 0) > 0 ? (
                    <span style={{ fontSize: 11, color: '#C9A96E', fontWeight: 600 }}>{c._count?.messages}</span>
                  ) : (
                    <span style={{ color: '#4B5563', fontSize: 11 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  {c.ghlContactId ? <span style={{ color: '#4ade80', fontSize: 11 }}>✓</span> : <span style={{ color: '#f87171', fontSize: 11 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              width: 32, height: 32, background: p === page ? '#C9A96E' : '#142D48',
              color: p === page ? '#142D48' : '#6B8299', border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: p === page ? 700 : 400,
            }}>{p}</button>
          ))}
        </div>
      )}
    </div>
  )
}
