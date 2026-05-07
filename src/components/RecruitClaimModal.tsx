'use client'

import { useEffect, useState } from 'react'

// Modal that powers the "Pick recruit" action on the direct_1/2/3 phase
// items. Two paths in one UX:
//   1. Search by name/agent code → claim an existing AFF agent (active
//      OR inactive — recruiter still gets credit) as the recruit who
//      fulfilled this checklist slot.
//   2. If nothing matches, fall through to "Refer a new agent" which
//      hands off to the existing referral form (we just navigate the
//      caller to the partners tab; they already have the form there).
//
// Why this exists: agents who recruited people before the portal-driven
// referral flow existed had no way to associate those recruits to their
// checklist. They'd hit "this email is already an agent" on the referral
// form and be stuck. This is the friendly counterpart.

export interface RecruitSearchResult {
  id: string
  firstName: string
  lastName: string
  agentCode: string
  avatarUrl: string | null
  phase: number
  status: 'ACTIVE' | 'INACTIVE'
  claimState: 'ok' | 'yours' | 'conflict'
  currentRecruiterCode: string | null
}

export interface RecruitClaimModalProps {
  // Phase-item mode: pass itemKey + itemLabel. Claim links to the
  // direct_N PhaseItem and ticks it complete.
  // Team-only mode: pass itemKey=null. Claim just sets recruiterId on
  // the picked agent. Used by the Partners/FTA "Claim existing agent"
  // button so phase-5+ EMDs can backfill recruits beyond the 3
  // checklist slots.
  itemKey: string | null
  itemLabel: string
  // Pre-populated when an admin opens this in /agents view-as preview mode.
  previewToken?: string | null
  // Already-claimed recruits across the agent's other direct_N items, so
  // the picker can hide them (one person can't fill two slots). Only
  // meaningful in phase-item mode.
  alreadyClaimedProfileIds: string[]
  onClose: () => void
  onClaimed: (result: {
    itemKey: string | null
    linkedAgentProfileId: string | null
    recruit: { id: string; firstName: string; lastName: string; agentCode: string; status: string }
    conflict: { existingRecruiterCode: string } | null
  }) => void
  // Fallback when no match is found and the agent wants to invite someone new.
  onReferNew: () => void
}

export default function RecruitClaimModal({
  itemKey,
  itemLabel,
  previewToken,
  alreadyClaimedProfileIds,
  onClose,
  onClaimed,
  onReferNew,
}: RecruitClaimModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecruitSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Debounced search. The 250ms wait keeps the search endpoint from
  // running on every keystroke when an agent is mid-name.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearched(false); return }
    setSearching(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const url = previewToken
          ? `/api/agents/recruits/search?q=${encodeURIComponent(q)}&preview=${encodeURIComponent(previewToken)}`
          : `/api/agents/recruits/search?q=${encodeURIComponent(q)}`
        const res = await fetch(url, { signal: ctrl.signal })
        const d = await res.json() as { recruits?: RecruitSearchResult[] }
        setResults(d.recruits ?? [])
        setSearched(true)
      } catch { /* aborted or network */ }
      finally { setSearching(false) }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query, previewToken])

  const claim = async (r: RecruitSearchResult) => {
    setClaiming(r.id)
    setError(null)
    try {
      const url = previewToken
        ? `/api/agents/recruits/claim?preview=${encodeURIComponent(previewToken)}`
        : '/api/agents/recruits/claim'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey, recruitProfileId: r.id }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; linkedAgentProfileId?: string; recruit?: { id: string; firstName: string; lastName: string; agentCode: string; status: string }; conflict?: { existingRecruiterCode: string } | null }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not save claim')
        return
      }
      onClaimed({
        itemKey,
        linkedAgentProfileId: data.linkedAgentProfileId!,
        recruit: data.recruit!,
        conflict: data.conflict ?? null,
      })
    } finally { setClaiming(null) }
  }

  const visible = results.filter(r => !alreadyClaimedProfileIds.includes(r.id))

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: '95vw', maxHeight: '90vh',
        background: '#0F1E33', border: '1px solid rgba(201,169,110,0.25)',
        borderRadius: 8, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              {itemKey ? 'Pick recruit' : 'Claim existing agent'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{itemLabel}</div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
              {itemKey
                ? 'Search the AFF roster for the agent you recruited. Inactive agents still count, the act of recruiting is what matters.'
                : 'Search the AFF roster for an agent you recruited. They\'ll be added to your team. Inactive agents still count.'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', color: '#9BB0C4',
            fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
          }}>&#10005;</button>
        </div>

        <div style={{ padding: '14px 20px' }}>
          <input
            autoFocus
            type="text"
            placeholder="Search by name or agent code..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0A1628', border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 4, color: '#d1d9e2',
              padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 14px' }}>
          {!searched && query.trim().length < 2 && (
            <div style={{ fontSize: 11, color: '#6B8299', padding: '20px 0', textAlign: 'center' }}>
              Type at least 2 characters to search.
            </div>
          )}
          {searching && visible.length === 0 && (
            <div style={{ fontSize: 11, color: '#6B8299', padding: '20px 0', textAlign: 'center' }}>
              Searching...
            </div>
          )}
          {searched && !searching && visible.length === 0 && (
            <div style={{ padding: '14px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#9BB0C4', marginBottom: 10 }}>
                No matches in the AFF roster.
              </div>
              <button
                onClick={() => { onClose(); onReferNew() }}
                style={{
                  background: 'rgba(201,169,110,0.10)', border: '1px solid rgba(201,169,110,0.4)',
                  color: '#C9A96E', borderRadius: 4, padding: '8px 16px',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Refer a new agent instead
              </button>
            </div>
          )}
          {visible.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visible.map(r => {
                const isInactive = r.status === 'INACTIVE'
                const isConflict = r.claimState === 'conflict'
                const isYours = r.claimState === 'yours'
                const isClaimingThis = claiming === r.id
                return (
                  <button
                    key={r.id}
                    onClick={() => claim(r)}
                    disabled={!!claiming}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', textAlign: 'left',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isConflict ? 'rgba(245,158,11,0.35)' : 'rgba(201,169,110,0.15)'}`,
                      borderRadius: 6,
                      cursor: claiming ? 'wait' : 'pointer',
                      opacity: isInactive ? 0.65 : (claiming && !isClaimingThis ? 0.5 : 1),
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
                      background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#C9A96E', fontWeight: 700, fontSize: 11, flexShrink: 0,
                    }}>
                      {r.avatarUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : `${r.firstName[0] ?? ''}${r.lastName[0] ?? ''}`}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{r.firstName} {r.lastName}</span>
                        {isInactive && (
                          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: '#6B8299', background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase' }}>
                            Inactive
                          </span>
                        )}
                        {isYours && (
                          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: '#4ADE80', background: 'rgba(74,222,128,0.10)', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase' }}>
                            Already on your team
                          </span>
                        )}
                        {isConflict && (
                          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: '#F59E0B', background: 'rgba(245,158,11,0.10)', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase' }} title={`Currently linked to recruiter ${r.currentRecruiterCode}`}>
                            Conflict
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                        {r.agentCode} &middot; Phase {r.phase}
                        {isConflict && r.currentRecruiterCode && (
                          <span style={{ marginLeft: 8 }}>
                            (currently recruited by {r.currentRecruiterCode})
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: '#C9A96E', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {isClaimingThis ? 'Saving...' : 'Claim'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {error && (
            <div style={{
              marginTop: 10, padding: '8px 10px', borderRadius: 4,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#EF4444', fontSize: 11, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { onClose(); onReferNew() }}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9BB0C4', borderRadius: 4, padding: '7px 14px',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Refer a new agent instead
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: '#6B8299', fontSize: 11, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
