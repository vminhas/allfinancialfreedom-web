'use client'

import { useState } from 'react'

interface Attempt {
  id: string
  email: string
  provider: string
  outcome: string
  createdAt: string
}

interface ActivityRow {
  kind: 'agent' | 'admin'
  id: string
  email: string
  name: string
  agentCode: string | null
  role: string
  createdAt: string
  activated: boolean
  lastLoginAt: string | null
}

const OUTCOME_LABEL: Record<string, { label: string; color: string }> = {
  rejected_unknown_email:  { label: 'Unknown email',  color: '#F59E0B' },
  rejected_inactive_agent: { label: 'Inactive agent', color: '#9B6DFF' },
}

const ROLE_COLOR: Record<string, string> = {
  admin: '#C9A96E',
  licensing_coordinator: '#9B6DFF',
  agent: '#60A5FA',
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  licensing_coordinator: 'Licensing Coordinator',
  agent: 'Agent',
}

export default function AuditTabs({ attempts, accountActivity }: {
  attempts: Attempt[]
  accountActivity: ActivityRow[]
}) {
  const [tab, setTab] = useState<'attempts' | 'activity'>('attempts')

  // Group attempts by email so a brute-force attempt collapses into
  // one row with a count.
  const attemptsByEmail = new Map<string, Attempt[]>()
  for (const a of attempts) {
    const list = attemptsByEmail.get(a.email) ?? []
    list.push(a)
    attemptsByEmail.set(a.email, list)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { key: 'attempts', label: 'Sign-in attempts', count: attempts.length, color: '#F59E0B' },
          { key: 'activity', label: 'Account activity', count: accountActivity.length, color: '#60A5FA' },
        ] as const).map(c => {
          const active = tab === c.key
          return (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              style={{
                padding: '8px 16px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: active ? `${c.color}22` : 'transparent',
                border: `1px solid ${active ? c.color : 'rgba(255,255,255,0.08)'}`,
                color: active ? c.color : '#9BB0C4',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {c.label}
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: active ? c.color : '#6B8299',
                background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                padding: '0 6px', borderRadius: 999,
              }}>
                {c.count}
              </span>
            </button>
          )
        })}
      </div>

      {tab === 'attempts' && (
        attempts.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            background: 'rgba(74,222,128,0.04)',
            border: '1px dashed rgba(74,222,128,0.25)',
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 14, color: '#4ade80', marginBottom: 4 }}>No rejected attempts on record</div>
            <div style={{ fontSize: 12, color: '#6B8299' }}>
              Nobody outside the AFF roster has tried to sign in. We&apos;ll log it here the moment they do.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from(attemptsByEmail.entries()).map(([email, list]) => {
              const newest = list[0]
              const outcome = OUTCOME_LABEL[newest.outcome] ?? { label: newest.outcome, color: '#9BB0C4' }
              return (
                <div key={email} style={{
                  background: '#142D48',
                  border: '1px solid rgba(201,169,110,0.12)',
                  borderRadius: 8,
                  padding: '14px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{email}</div>
                      <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                        {list.length} attempt{list.length === 1 ? '' : 's'}
                        {' · '}
                        most recent {new Date(newest.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 999,
                      background: `${outcome.color}15`,
                      border: `1px solid ${outcome.color}40`,
                      color: outcome.color,
                      flexShrink: 0,
                    }}>
                      {outcome.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {tab === 'activity' && (
        accountActivity.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            background: 'rgba(96,165,250,0.04)',
            border: '1px dashed rgba(96,165,250,0.25)',
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 14, color: '#60A5FA', marginBottom: 4 }}>No account activity in the last 90 days</div>
            <div style={{ fontSize: 12, color: '#6B8299' }}>
              New agent and admin accounts will appear here as they&apos;re created.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accountActivity.map(row => {
              const roleColor = ROLE_COLOR[row.role] ?? '#9BB0C4'
              return (
                <div key={`${row.kind}-${row.id}`} style={{
                  background: '#142D48',
                  border: '1px solid rgba(201,169,110,0.12)',
                  borderRadius: 8,
                  padding: '14px 18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{row.name}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 999,
                        background: `${roleColor}15`, border: `1px solid ${roleColor}40`, color: roleColor,
                      }}>
                        {ROLE_LABEL[row.role] ?? row.role}
                      </span>
                      {row.agentCode && (
                        <span style={{ fontSize: 10, color: '#6B8299', fontFamily: 'monospace' }}>{row.agentCode}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B8299' }}>
                      {row.email} {' · '} created {new Date(row.createdAt).toLocaleString()}
                      {row.lastLoginAt && <> {' · '} last sign-in {new Date(row.lastLoginAt).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    padding: '4px 10px', borderRadius: 999,
                    background: row.activated ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)',
                    border: `1px solid ${row.activated ? 'rgba(74,222,128,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    color: row.activated ? '#4ADE80' : '#F59E0B',
                    flexShrink: 0,
                  }}>
                    {row.activated ? 'Activated' : 'Pending invite'}
                  </span>
                </div>
              )
            })}
          </div>
        )
      )}
    </>
  )
}
