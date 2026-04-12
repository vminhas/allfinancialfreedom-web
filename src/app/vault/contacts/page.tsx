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

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (licenseFilter) params.set('licenseType', licenseFilter)
    if (statusFilter) params.set('outreachStatus', statusFilter)
    if (wornFilter) params.set('wornOut', wornFilter)

    const res = await fetch(`/api/admin/contacts?${params}`)
    const data = await res.json()
    setContacts(data.contacts ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [page, licenseFilter, statusFilter, wornFilter])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>Database</p>
          <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>Contacts <span style={{ color: '#6B8299', fontSize: 16 }}>({total.toLocaleString()})</span></h1>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'License Type', value: licenseFilter, onChange: setLicenseFilter, options: ['', 'life', 'health', 'p&c', 'variable', 'multiple'] },
          { label: 'Status', value: statusFilter, onChange: setStatusFilter, options: ['', 'pending', 'sent', 'responded', 'opted-out'] },
          { label: 'Lead Type', value: wornFilter, onChange: setWornFilter, options: [{ v: '', l: 'All' }, { v: 'false', l: 'Fresh' }, { v: 'true', l: 'Worn Out' }] },
        ].map(f => (
          <select key={f.label} value={f.value} onChange={e => { f.onChange(e.target.value); setPage(1) }} style={{
            padding: '8px 12px', background: '#142D48', border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4, color: '#9BB0C4', fontSize: 12, cursor: 'pointer', outline: 'none',
          }}>
            {f.options.map(o => {
              const v = typeof o === 'string' ? o : o.v
              const l = typeof o === 'string' ? (o || `All ${f.label}s`) : o.l
              return <option key={v} value={v}>{l}</option>
            })}
          </select>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Name', 'Email', 'License', 'Agency', 'State', 'Status', 'GHL'].map(h => (
                <th key={h} style={{ padding: '12px 20px', textAlign: 'left', color: '#6B8299', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#6B8299', fontSize: 13 }}>Loading...</td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#6B8299', fontSize: 13 }}>No contacts match your filters.</td>
              </tr>
            ) : contacts.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '12px 20px' }}>
                  <p style={{ color: '#ffffff', fontSize: 13, margin: '0 0 2px' }}>{c.firstName} {c.lastName}</p>
                  {c.wornOut && <span style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 4px', borderRadius: 2 }}>soft</span>}
                </td>
                <td style={{ padding: '12px 20px', color: '#9BB0C4', fontSize: 12 }}>{c.email}</td>
                <td style={{ padding: '12px 20px', color: '#9BB0C4', fontSize: 12 }}>{c.licenseType ?? '—'}</td>
                <td style={{ padding: '12px 20px', color: '#9BB0C4', fontSize: 12 }}>{c.currentAgency ?? '—'}</td>
                <td style={{ padding: '12px 20px', color: '#9BB0C4', fontSize: 12 }}>{c.state ?? '—'}</td>
                <td style={{ padding: '12px 20px' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: STATUS_COLORS[c.outreachStatus ?? 'pending'] ?? '#6B8299',
                  }}>
                    {c.outreachStatus ?? 'pending'}
                  </span>
                </td>
                <td style={{ padding: '12px 20px' }}>
                  {c.ghlContactId
                    ? <span style={{ color: '#4ade80', fontSize: 11 }}>✓</span>
                    : <span style={{ color: '#f87171', fontSize: 11 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              width: 32, height: 32, background: p === page ? '#C9A96E' : '#142D48',
              color: p === page ? '#142D48' : '#6B8299', border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: p === page ? 700 : 400,
            }}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
