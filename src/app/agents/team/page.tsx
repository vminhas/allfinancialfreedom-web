'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AgentTradingCardModal } from '@/components/AgentTradingCard'
import { useIsMobile } from '@/lib/useIsMobile'

interface TeamMember {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  phase: number
  title: string
  memberStatus: string
  children: TeamMember[]
}

interface TeamResponse {
  team: TeamMember[]
  totalTeamSize: number
  activeTeamSize: number
}

function flatten(nodes: TeamMember[]): TeamMember[] {
  const result: TeamMember[] = []
  for (const node of nodes) {
    if (node.memberStatus === 'ACTIVE') result.push(node)
    if (node.children.length > 0) result.push(...flatten(node.children))
  }
  return result
}

const PHASE_COLORS: Record<number, string> = {
  1: '#6B8299', 2: '#9B6DFF', 3: '#C9A96E', 4: '#3b82f6', 5: '#4ade80',
}

function Avatar({ member, size }: { member: TeamMember; size: number }) {
  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatarUrl}
        alt={`${member.firstName} ${member.lastName}`}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #1F3757 0%, #2D4A6E 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color: '#C9A96E', flexShrink: 0,
    }}>
      {member.firstName[0]}{member.lastName[0]}
    </div>
  )
}

export default function TeamPhotosPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cardCode, setCardCode] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/team')
      .then(r => r.json())
      .then((data: TeamResponse) => {
        setMembers(flatten(data.team))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = members.filter(m => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
  })

  const downloadHeadshot = useCallback(async (member: TeamMember) => {
    if (!member.avatarUrl) return
    setDownloading(member.agentCode)
    try {
      const ext = (member.avatarUrl.match(/\.([a-zA-Z0-9]{3,4})(?:\?|#|$)/) ?? [])[1]?.toLowerCase() ?? 'jpg'
      const filename = `${member.firstName}-${member.lastName}-headshot.${ext}`.toLowerCase().replace(/\s+/g, '-')

      let blob: Blob | null = null
      try {
        const res = await fetch(member.avatarUrl, { mode: 'cors' })
        if (res.ok) blob = await res.blob()
      } catch { /* CORS fallback below */ }

      if (blob) {
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; title?: string }) => Promise<void> }
        if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
          try { await nav.share({ files: [file], title: `${member.firstName} ${member.lastName}` }); return }
          catch (err) { if ((err as Error).name === 'AbortError') return }
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return
      }

      window.open(member.avatarUrl, '_blank', 'noopener,noreferrer')
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
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 1 }}>Team Photos</div>
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
            {filtered.map(member => (
              <div
                key={member.agentCode}
                style={{
                  background: '#132238',
                  border: '1px solid rgba(201,169,110,0.08)',
                  borderRadius: 8,
                  padding: '16px 12px 12px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
              >
                {/* Avatar — click opens trading card */}
                <div
                  onClick={() => setCardCode(member.agentCode)}
                  style={{ cursor: 'pointer', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${PHASE_COLORS[member.phase] ?? '#4B5563'}` }}
                >
                  <Avatar member={member} size={88} />
                </div>

                {/* Name */}
                <div
                  onClick={() => setCardCode(member.agentCode)}
                  style={{ cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                    {member.firstName} {member.lastName}
                  </div>
                  <div style={{ fontSize: 10, color: PHASE_COLORS[member.phase] ?? '#6B8299', fontWeight: 600, marginTop: 2 }}>
                    {member.title}
                  </div>
                </div>

                {/* Download button */}
                {member.avatarUrl ? (
                  <button
                    onClick={() => downloadHeadshot(member)}
                    disabled={downloading === member.agentCode}
                    style={{
                      background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)',
                      color: '#C9A96E', borderRadius: 4, padding: '4px 12px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      cursor: downloading === member.agentCode ? 'wait' : 'pointer',
                      opacity: downloading === member.agentCode ? 0.6 : 1,
                      width: '100%',
                    }}
                  >
                    {downloading === member.agentCode ? 'Saving...' : '↓ Save Photo'}
                  </button>
                ) : (
                  <div style={{ fontSize: 10, color: '#4B5563', fontStyle: 'italic' }}>No photo yet</div>
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
