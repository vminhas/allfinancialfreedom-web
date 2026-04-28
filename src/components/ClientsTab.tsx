'use client'

import { useEffect, useState } from 'react'

const card = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel = { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14 }

interface Client {
  id: string
  clientFirstName: string
  clientLastName: string
  clientPhone: string | null
  clientEmail: string | null
  clientBirthday: string | null
  clientAddressLine1: string | null
  clientCity: string | null
  clientState: string | null
  clientZip: string | null
  carrier: string
  policyType: string
  policyNumber: string | null
  issuedDate: string | null
  points: number | null
}

const POLICY_LABEL: Record<string, string> = {
  TERM: 'Term', WHOLE_LIFE: 'Whole Life', IUL: 'IUL', ANNUITY: 'Annuity',
  DISABILITY: 'Disability', LTC: 'LTC', OTHER: 'Other',
}

export default function ClientsTab({ phase }: { phase: number }) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    fetch('/api/agents/clients')
      .then(async r => {
        if (r.status === 403) { setLocked(true); setLoading(false); return null }
        return r.ok ? r.json() : null
      })
      .then((d: { clients?: Client[] } | null) => {
        if (d?.clients) setClients(d.clients)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (locked || phase < 4) {
    return (
      <div style={{ ...card, padding: '40px 28px', textAlign: 'center' }}>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>Clients — Locked</div>
        <div style={{ color: '#9BB0C4', fontSize: 13, marginBottom: 4 }}>
          Unlocks at Phase 4 — Marketing Director track.
        </div>
        <div style={{ color: '#6B8299', fontSize: 12 }}>
          Once you reach Phase 4, issued submissions will appear here automatically with birthday and anniversary reminders.
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={sectionLabel}>Clients ({clients.length})</div>
      {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
        clients.length === 0 ? <div style={{ color: '#4B5563', fontSize: 13 }}>No clients yet — issued business will appear here.</div> :
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Client', 'Carrier', 'Type', 'Policy #', 'Issued', 'Birthday'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{c.clientFirstName} {c.clientLastName}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{c.carrier}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{POLICY_LABEL[c.policyType] ?? c.policyType}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{c.policyNumber ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{c.issuedDate ? new Date(c.issuedDate).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{c.clientBirthday ? new Date(c.clientBirthday).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    </div>
  )
}
