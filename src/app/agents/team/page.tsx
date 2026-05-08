'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AgentTradingCardModal } from '@/components/AgentTradingCard'
import { useIsMobile } from '@/lib/useIsMobile'

interface DirectoryAgent {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  phase: number
  title: string
  state: string | null
}

const PHASE_COLORS: Record<number, string> = {
  1: '#6B8299', 2: '#9B6DFF', 3: '#C9A96E', 4: '#3b82f6', 5: '#4ade80',
}

function SilhouettePlaceholder({ size }: { size: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 100 100"
      style={{ display: 'block', borderRadius: '50%' }}
    >
      <rect width="100" height="100" fill="#1F3757" />
      <circle cx="50" cy="36" r="18" fill="#2D4A6E" />
      <ellipse cx="50" cy="82" rx="28" ry="22" fill="#2D4A6E" />
    </svg>
  )
}

function Avatar({ agent, size }: { agent: DirectoryAgent; size: number }) {
  if (agent.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agent.avatarUrl}
        alt={`${agent.firstName} ${agent.lastName}`}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    )
  }
  return <SilhouettePlaceholder size={size} />
}

export default function TeamPhotosPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [agents, setAgents] = useState<DirectoryAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cardCode, setCardCode] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/directory')
      .then(r => r.json())
      .then((data: { agents: DirectoryAgent[] }) => setAgents(data.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = agents.filter(a => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${a.firstName} ${a.lastName}`.toLowerCase().includes(q)
  })

  const downloadHeadshot = useCallback(async (agent: DirectoryAgent) => {
    if (!agent.avatarUrl) return
    setDownloading(agent.agentCode)
    try {
      const ext = (agent.avatarUrl.match(/\.([a-zA-Z0-9]{3,4})(?:\?|#|$)/) ?? [])[1]?.toLowerCase() ?? 'jpg'
      const filename = `${agent.firstName}-${agent.lastName}-headshot.${ext}`.toLowerCase().replace(/\s+/g, '-')

      let blob: Blob | null = null
      try {
        const res = await fetch(agent.avatarUrl, { mode: 'cors' })
        if (res.ok) blob = await res.blob()
      } catch { /* CORS fallback below */ }

      if (blob) {
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; title?: string }) => Promise<void> }
        if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
          try { await nav.share({ files: [file], title: `${agent.firstName} ${agent.lastName}` }); return }
          catch (err) { if ((err as Error).name === 'AbortError') return }
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return
      }

      window.open(agent.avatarUrl, '_blank', 'noopener,noreferrer')
    } finally { setDownloading(null) }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: isMobile
          ? 'calc(10px + env(safe-area-inset-top)) 14px 10px'
          : 'calc(14px + env(safe-area-inset-top)) clamp(16px,4vw,32px) 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: '#C9A96E', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 1 }}>Team Directory</div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(16px,4vw,24px)' }}>
        {/* Search + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            style={{
              flex: 1, minWidth: 180,
              background: '#132238', border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: 6, color: '#9BB0C4', padding: '8px 12px', fontSize: 13,
            }}
          />
          {!loading && (
            <span style={{ fontSize: 11, color: '#4B5563', whiteSpace: 'nowrap' }}>
              {filtered.length} member{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>
            {search ? 'No results.' : 'No team members yet.'}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 16,
          }}>
            {filtered.map(agent => (
              <div
                key={agent.agentCode}
                style={{
                  background: '#132238',
                  border: '1px solid rgba(201,169,110,0.08)',
                  borderRadius: 8,
                  padding: '16px 12px 12px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
              >
                {/* Avatar */}
                <div
                  onClick={() => setCardCode(agent.agentCode)}
                  style={{
                    cursor: 'pointer', borderRadius: '50%', overflow: 'hidden',
                    border: `2px solid ${PHASE_COLORS[agent.phase] ?? '#4B5563'}`,
                    flexShrink: 0,
                  }}
                >
                  <Avatar agent={agent} size={88} />
                </div>

                {/* Name + title */}
                <div
                  onClick={() => setCardCode(agent.agentCode)}
                  style={{ cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                    {agent.firstName} {agent.lastName}
                  </div>
                  <div style={{ fontSize: 10, color: PHASE_COLORS[agent.phase] ?? '#6B8299', fontWeight: 600, marginTop: 2 }}>
                    {agent.title}
                  </div>
                </div>

                {/* Download or pending notice */}
                {agent.avatarUrl ? (
                  <button
                    onClick={() => downloadHeadshot(agent)}
                    disabled={downloading === agent.agentCode}
                    style={{
                      background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)',
                      color: '#C9A96E', borderRadius: 4, padding: '4px 12px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      cursor: downloading === agent.agentCode ? 'wait' : 'pointer',
                      opacity: downloading === agent.agentCode ? 0.6 : 1,
                      width: '100%',
                    }}
                  >
                    {downloading === agent.agentCode ? 'Saving...' : 'Save Photo'}
                  </button>
                ) : (
                  <div style={{ fontSize: 9, color: '#4B5563', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.3 }}>
                    Photo not uploaded yet
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {cardCode && (
        <AgentTradingCardModal agentCode={cardCode} onClose={() => setCardCode(null)} />
      )}
    </div>
  )
}
