'use client'

import { useEffect, useRef, useState } from 'react'

// Reusable trading-card shell. The same component will eventually power
// birthday and milestone announcement cards (different `variant`,
// different backdrop + headline, same agent stats below). For now we
// only render the 'profile' variant; future variants can swap the
// header copy without rebuilding the layout.

export type CardVariant = 'profile' | 'birthday' | 'milestone'

export interface CardData {
  agentCode: string
  firstName: string
  lastName: string
  state: string | null
  avatarUrl: string | null
  phase: number
  phaseLabel: string
  trainerName: string | null
  joinedAt: string | null
  daysAtAff: number | null
  daysInPhase: number | null
  directDownline: number
  totalDownline: number
  ftaCompleted: number
  carriersAppointed: number
  totalSubmissions: number
  issuedClients: number
  totalTargetPremium: number | null
  milestoneBadges: { key: string; label: string }[]
  scope: 'admin' | 'lc' | 'peer_agent'
}

const PHASE_COLORS: Record<number, string> = {
  1: '#6B8299', 2: '#9B6DFF', 3: '#C9A96E', 4: '#3b82f6', 5: '#4ade80',
}

// "1y 4m" style tenure. Reads better than days for anything past a few
// months and is the format the user explicitly asked for on the card.
function formatTenure(days: number | null): string {
  if (days == null) return '—'
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths === 0 ? `${years}y` : `${years}y ${remMonths}m`
}

function formatJoined(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function formatDollars(n: number | null): string {
  if (n == null) return '—'
  if (n === 0) return '$0'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function AgentTradingCardModal({
  agentCode,
  onClose,
  variant = 'profile',
}: {
  agentCode: string
  onClose: () => void
  variant?: CardVariant
}) {
  const [data, setData] = useState<CardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/agents/by-code/${encodeURIComponent(agentCode)}/card`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed to load card')
        return r.json() as Promise<CardData>
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [agentCode])

  const downloadPng = async () => {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0A1628',
        scale: 2, // sharper export, especially for headshots
        useCORS: true,
        logging: false,
      })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = data
        ? `${data.firstName}-${data.lastName}-${data.agentCode}-card.png`.toLowerCase().replace(/\s+/g, '-')
        : `agent-card-${agentCode}.png`
      a.click()
    } finally { setDownloading(false) }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {error && (
          <div style={{ padding: 16, background: '#132238', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', fontSize: 13 }}>
            {error}
          </div>
        )}
        {!error && !data && (
          <div style={{ padding: 24, background: '#132238', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6, color: '#9BB0C4', fontSize: 13, textAlign: 'center' }}>
            Loading card...
          </div>
        )}

        {data && (
          <>
            {/* The card itself — wrapped in cardRef so html2canvas can
                snapshot exactly this node. Border, shadow, gradient
                backdrop all live here so the export looks like the
                on-screen card, not a flat rectangle. */}
            <div
              ref={cardRef}
              style={{
                position: 'relative',
                background: 'linear-gradient(160deg, #142D48 0%, #0F1E33 50%, #0A1628 100%)',
                border: `2px solid ${PHASE_COLORS[data.phase] ?? '#C9A96E'}`,
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(201,169,110,0.15) inset',
                color: '#fff',
              }}
            >
              {/* Subtle radial vignette for the trading-card glow */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `radial-gradient(circle at 30% 0%, ${PHASE_COLORS[data.phase] ?? '#C9A96E'}22 0%, transparent 55%)`,
              }} />

              {/* Header band: AFF logo lockup + variant headline */}
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px 10px', borderBottom: '1px solid rgba(201,169,110,0.2)' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#C9A96E', fontWeight: 700 }}>
                  All Financial Freedom
                </div>
                <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9BB0C4', fontWeight: 700 }}>
                  {variant === 'profile' && `Class of ${formatJoined(data.joinedAt).split(' ').pop() ?? ''}`}
                  {variant === 'birthday' && 'Happy Birthday'}
                  {variant === 'milestone' && 'Recognition'}
                </div>
              </div>

              {/* Identity block: avatar + name + role chip */}
              <div style={{ position: 'relative', display: 'flex', gap: 14, alignItems: 'center', padding: '18px 20px 12px' }}>
                <div style={{
                  width: 84, height: 84, flexShrink: 0, borderRadius: 12,
                  background: data.avatarUrl ? `url(${data.avatarUrl}) center/cover` : `${PHASE_COLORS[data.phase] ?? '#C9A96E'}22`,
                  border: `2px solid ${PHASE_COLORS[data.phase] ?? '#C9A96E'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, fontWeight: 700, color: PHASE_COLORS[data.phase] ?? '#C9A96E',
                }}>
                  {!data.avatarUrl && `${data.firstName?.[0] ?? ''}${data.lastName?.[0] ?? ''}`.toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.1, fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
                    {data.firstName} {data.lastName}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
                      background: `${PHASE_COLORS[data.phase] ?? '#C9A96E'}22`,
                      border: `1px solid ${PHASE_COLORS[data.phase] ?? '#C9A96E'}55`,
                      color: PHASE_COLORS[data.phase] ?? '#C9A96E',
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>
                      Phase {data.phase} &middot; {data.phaseLabel}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: '#9BB0C4' }}>
                    {data.agentCode}{data.state ? ` · ${data.state}` : ''}{data.trainerName ? ` · CFT ${data.trainerName}` : ''}
                  </div>
                </div>
              </div>

              {/* Stat strip — the user's "meaningful stats" set */}
              <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '4px 14px 14px', gap: 6 }}>
                <Stat label="Tenure"        value={formatTenure(data.daysAtAff)} sub={`Joined ${formatJoined(data.joinedAt)}`} />
                <Stat label="Days in Phase" value={data.daysInPhase != null ? `${data.daysInPhase}d` : '—'} sub={data.phaseLabel} />
                <Stat label="Clients"       value={data.issuedClients.toString()} sub={`${data.totalSubmissions} total submissions`} />
                <Stat label="Field Trainings" value={`${data.ftaCompleted}`} sub={data.ftaCompleted >= 10 ? '10/10 unlocked' : `${data.ftaCompleted}/10 toward unlock`} />
                <Stat label="Carriers"      value={data.carriersAppointed.toString()} sub="appointed" />
                <Stat label="Team"          value={`${data.directDownline} / ${data.totalDownline}`} sub="direct / total downline" />
                {data.totalTargetPremium != null && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <Stat label="Target Premium" value={formatDollars(data.totalTargetPremium)} sub="lifetime production" wide />
                  </div>
                )}
              </div>

              {/* Milestone badge row at the bottom (only if any earned) */}
              {data.milestoneBadges.length > 0 && (
                <div style={{ position: 'relative', padding: '10px 16px 14px', borderTop: '1px solid rgba(201,169,110,0.15)', background: 'rgba(0,0,0,0.18)' }}>
                  <div style={{ fontSize: 8, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9BB0C4', marginBottom: 6, fontWeight: 700 }}>
                    Milestones
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.milestoneBadges.map(b => (
                      <span key={b.key} style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                        padding: '3px 9px', borderRadius: 999,
                        background: 'rgba(201,169,110,0.12)', color: '#C9A96E',
                        border: '1px solid rgba(201,169,110,0.35)',
                      }}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Drafted stamp — small footnote in the corner */}
              <div style={{ position: 'absolute', right: 12, bottom: 6, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,169,110,0.45)', fontWeight: 700 }}>
                Drafted {formatJoined(data.joinedAt)}
              </div>
            </div>

            {/* Footer actions sit OUTSIDE the captured card so they
                don't show up in the downloaded PNG. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={onClose}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Close
              </button>
              <button
                onClick={downloadPng}
                disabled={downloading}
                style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: downloading ? 'wait' : 'pointer', opacity: downloading ? 0.7 : 1 }}
              >
                {downloading ? 'Saving...' : '↓ Download'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, wide }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div style={{
      padding: wide ? '10px 14px' : '8px 12px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(201,169,110,0.12)',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9BB0C4', fontWeight: 700, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: wide ? 20 : 16, fontWeight: 700, color: '#fff', fontFamily: 'Cormorant Garamond, Georgia, serif', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: '#6B8299', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
