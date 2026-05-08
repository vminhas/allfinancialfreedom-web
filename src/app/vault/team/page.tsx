'use client'

import { useState, useEffect, useCallback } from 'react'
import { AgentTradingCardModal } from '@/components/AgentTradingCard'

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
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', borderRadius: '50%' }}>
      <rect width="100" height="100" fill="#1F3757" />
      <circle cx="50" cy="36" r="18" fill="#2D4A6E" />
      <ellipse cx="50" cy="82" rx="28" ry="22" fill="#2D4A6E" />
    </svg>
  )
}

function Avatar({ agent, size }: { agent: DirectoryAgent; size: number }) {
  if (agent.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={agent.avatarUrl} alt={`${agent.firstName} ${agent.lastName}`} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  }
  return <SilhouettePlaceholder size={size} />
}

export default function VaultTeamDirectoryPage() {
  const [agents, setAgents] = useState<DirectoryAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState<number | ''>('')
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
    if (phaseFilter !== '' && a.phase !== phaseFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${a.firstName} ${a.lastName} ${a.agentCode}`.toLowerCase().includes(q)
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
      } catch { /* fall through */ }
      if (blob) {
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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(16px, 3vw, 32px)' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          All Financial Freedom
        </div>
        <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Team Directory
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>
          {!loading && `${agents.length} active members`}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or agent code..."
          style={{
            flex: 1, minWidth: 200,
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#d1d9e2', padding: '8px 12px', fontSize: 13,
          }}
        />
        <select
          value={phaseFilter}
          onChange={e => setPhaseFilter(e.target.value === '' ? '' : Number(e.target.value))}
          style={{
            background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 4, color: '#9BB0C4', padding: '8px 12px', fontSize: 12,
          }}
        >
          <option value="">All Phases</option>
          {[1,2,3,4,5].map(n => <option key={n} value={n}>Phase {n}</option>)}
        </select>
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
          {search || phaseFilter !== '' ? 'No results.' : 'No team members yet.'}
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

              <div
                onClick={() => setCardCode(agent.agentCode)}
                style={{ cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                  {agent.firstName} {agent.lastName}
                </div>
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 1 }}>{agent.agentCode}</div>
                <div style={{ fontSize: 10, color: PHASE_COLORS[agent.phase] ?? '#6B8299', fontWeight: 600, marginTop: 2 }}>
                  {agent.title}
                </div>
              </div>

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
                  No photo yet
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {cardCode && (
        <AgentTradingCardModal agentCode={cardCode} onClose={() => setCardCode(null)} />
      )}
    </div>
  )
}
