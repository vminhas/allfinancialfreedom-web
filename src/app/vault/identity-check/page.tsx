'use client'

import { useState } from 'react'

const C = { bg: '#f4f6f9', card: '#fff', ink: '#1b3a5c', navy: '#0b192c', gold: '#c9a96e', muted: '#6b8299', line: '#e4e9f0', red: '#c0392b', green: '#2f855a', amber: '#b7791f' }

interface Prof {
  id: string; agentCode: string; firstName: string; lastName: string; phase: number
  status: string; isTest: boolean; recruiterId: string | null; loginEmail: string | null
  lastLoginAt: string | null; hasLogin: boolean; contacts: number; downline: number; createdAt: string | null
}
interface Result {
  q: string; isEmail: boolean; loginResolvesToProfileId: string | null
  split: boolean; loginMismatch: boolean; recommendation: string | null
  canonicalProfileId: string | null; profiles: Prof[]
}

export default function IdentityCheckPage() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run(query: string) {
    if (!query.trim()) return
    setBusy(true); setErr(null); setRes(null)
    try {
      const r = await fetch(`/api/admin/agents/identity-diagnostic?q=${encodeURIComponent(query.trim())}`)
      const j = await r.json()
      if (!r.ok) setErr(j.error || 'Lookup failed')
      else setRes(j)
    } catch { setErr('Lookup failed') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', padding: '24px 22px 60px', color: C.ink }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, margin: '0 0 4px', color: C.navy }}>Agent Identity Check</h1>
        <p style={{ margin: '0 0 16px', color: C.muted, fontSize: 13.5, maxWidth: 680 }}>
          Read-only. Finds split identities, when an agent&rsquo;s login (email) and their agentCode point to different profiles, so their own CRM view and their upline&rsquo;s downline view disagree (e.g. contacts a recruiter can see but the agent can&rsquo;t). Changes nothing.
        </p>

        <form onSubmit={e => { e.preventDefault(); run(q) }} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, agentCode, or login email (e.g. Tamberi)"
            style={{ flex: 1, padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }} />
          <button type="submit" disabled={busy} style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Checking…' : 'Check'}</button>
        </form>

        {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}

        {res && (
          <>
            <div style={{ background: res.split ? '#fdecea' : '#e8f5ee', border: `1px solid ${res.split ? '#f3c0b8' : '#bfe6cd'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: res.split ? C.red : C.green, fontSize: 15 }}>
                {res.split ? '⚑ Split identity detected' : '✓ No split — one canonical identity'}
              </div>
              {res.recommendation && <div style={{ fontSize: 13, color: C.ink, marginTop: 6 }}>{res.recommendation}</div>}
              {!res.split && res.profiles.length > 0 && <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>Login and agentCode resolve to the same profile. If the agent still can&rsquo;t see contacts, it&rsquo;s not an identity split.</div>}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f7f9fb', textAlign: 'left' }}>
                    {['Agent', 'agentCode', 'Login email', 'Contacts', 'Downline', 'Phase', 'Status', 'Flags'].map(h => (
                      <th key={h} style={{ padding: '9px 11px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: C.muted, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.profiles.map(p => {
                    const isCanonical = p.id === res.canonicalProfileId
                    const isLoginTarget = p.id === res.loginResolvesToProfileId
                    return (
                      <tr key={p.id} style={{ borderTop: `1px solid #eef2f7`, background: isCanonical ? '#f6fbf7' : undefined }}>
                        <td style={{ padding: '9px 11px' }}>
                          <b style={{ color: C.navy }}>{p.firstName} {p.lastName}</b>
                          <div style={{ color: C.muted, fontSize: 10.5 }}>{p.id}</div>
                        </td>
                        <td style={{ padding: '9px 11px', fontWeight: 700, color: C.navy }}>{p.agentCode}</td>
                        <td style={{ padding: '9px 11px' }}>{p.loginEmail ?? <span style={{ color: C.muted }}>— no login —</span>}</td>
                        <td style={{ padding: '9px 11px', fontWeight: 800, color: p.contacts > 0 ? C.green : C.muted }}>{p.contacts}</td>
                        <td style={{ padding: '9px 11px' }}>{p.downline}</td>
                        <td style={{ padding: '9px 11px' }}>P{p.phase}</td>
                        <td style={{ padding: '9px 11px' }}>{p.status}{p.isTest ? ' · test' : ''}</td>
                        <td style={{ padding: '9px 11px' }}>
                          {isCanonical && <span style={pill('#e8f5ee', C.green)}>canonical</span>}
                          {isLoginTarget && <span style={pill('#fdf3e2', C.amber)}>login lands here</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {res.split && res.canonicalProfileId && (
              <p style={{ color: C.muted, fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
                <b>Next step (I&rsquo;ll apply it):</b> reconcile so the login resolves to the <span style={{ color: C.green, fontWeight: 700 }}>canonical</span> profile (the one with the agentCode + contacts + downline), and retire the duplicate. Nothing is changed from this page, this is diagnosis only.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function pill(bg: string, fg: string): React.CSSProperties {
  return { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', background: bg, color: fg, borderRadius: 20, padding: '2px 7px', marginRight: 4, display: 'inline-block' }
}
