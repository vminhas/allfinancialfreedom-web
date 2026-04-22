'use client'

import { useEffect, useState, useCallback } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface OrgNode {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  title: string
  state: string | null
  avatarUrl: string | null
  status: string
  recruiterId: string | null
  children: OrgNode[]
}

interface OrgData {
  tree: OrgNode[]
  stats: {
    totalAgents: number
    byPhase: { phase: number; title: string; count: number }[]
  }
}

const PHASE_COLORS: Record<number, string> = {
  1: '#C9A96E',
  2: '#60a5fa',
  3: '#f59e0b',
  4: '#9B6DFF',
  5: '#4ade80',
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase()
}

function countDescendants(node: OrgNode): number {
  let count = node.children.length
  for (const c of node.children) count += countDescendants(c)
  return count
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, allAgents, onReassign }: {
  node: OrgNode
  depth: number
  allAgents: { agentCode: string; firstName: string; lastName: string }[]
  onReassign: (agentId: string, newRecruiterId: string | null) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [showReassign, setShowReassign] = useState(false)
  const [newRecruiter, setNewRecruiter] = useState(node.recruiterId ?? '')
  const color = PHASE_COLORS[node.phase] ?? '#C9A96E'
  const descendantCount = countDescendants(node)
  const isMobile = useIsMobile()

  const handleReassign = () => {
    onReassign(node.id, newRecruiter || null)
    setShowReassign(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 0 }}>
      {/* Connector line (horizontal tree) */}
      {depth > 0 && !isMobile && (
        <div style={{
          width: 32, minWidth: 32,
          borderBottom: `2px solid ${color}40`,
          alignSelf: 'flex-start',
          marginTop: 28,
        }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {/* Node card */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px',
            background: '#132238',
            border: `1px solid ${color}30`,
            borderRadius: 8,
            cursor: node.children.length > 0 ? 'pointer' : 'default',
            minWidth: isMobile ? '100%' : 220,
            marginLeft: isMobile ? depth * 20 : 0,
            transition: 'border-color 0.15s',
          }}
          onClick={() => node.children.length > 0 && setExpanded(!expanded)}
          onContextMenu={e => { e.preventDefault(); setShowReassign(!showReassign) }}
        >
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: node.avatarUrl ? `url(${node.avatarUrl}) center/cover` : `${color}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color, flexShrink: 0,
            border: `2px solid ${color}40`,
          }}>
            {!node.avatarUrl && initials(node.firstName, node.lastName)}
          </div>

          {/* Info */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.firstName} {node.lastName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 6px', borderRadius: 3,
                background: `${color}18`, border: `1px solid ${color}35`, color,
              }}>
                {node.title}
              </span>
              {node.state && (
                <span style={{ fontSize: 9, color: '#6B8299' }}>{node.state}</span>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          {node.children.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: '#6B8299', fontWeight: 600 }}>{descendantCount}</span>
              <span style={{ fontSize: 10, color: '#6B8299', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          )}
        </div>

        {/* Reassign popover */}
        {showReassign && (
          <div style={{
            marginTop: 4, marginLeft: isMobile ? depth * 20 : 0,
            padding: '8px 10px',
            background: '#0A1628',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 6,
            display: 'flex', gap: 6, alignItems: 'center',
            fontSize: 11,
          }}>
            <span style={{ color: '#6B8299', whiteSpace: 'nowrap' }}>Reports to:</span>
            <select
              value={newRecruiter}
              onChange={e => setNewRecruiter(e.target.value)}
              style={{
                background: '#132238', color: '#d1d9e2', border: '1px solid rgba(201,169,110,0.15)',
                borderRadius: 3, padding: '4px 6px', fontSize: 11, flex: 1, minWidth: 120,
              }}
            >
              <option value="">None (top level)</option>
              {allAgents.filter(a => a.agentCode !== node.agentCode).map(a => (
                <option key={a.agentCode} value={a.agentCode}>{a.firstName} {a.lastName} ({a.agentCode})</option>
              ))}
            </select>
            <button
              onClick={handleReassign}
              style={{
                background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 3,
                padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={() => setShowReassign(false)}
              style={{
                background: 'transparent', color: '#6B8299', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3, padding: '4px 8px', fontSize: 10, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Children */}
        {expanded && node.children.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            marginTop: 6,
            paddingLeft: isMobile ? 0 : 16,
            borderLeft: isMobile ? 'none' : `2px solid ${color}20`,
          }}>
            {node.children.map(child => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                allAgents={allAgents}
                onReassign={onReassign}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrgPage() {
  const [data, setData] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/agents/org-tree')
    if (res.ok) setData(await res.json() as OrgData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const allAgents = data ? flattenTree(data.tree) : []

  const handleReassign = async (agentId: string, newRecruiterId: string | null) => {
    await fetch(`/api/admin/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recruiterId: newRecruiterId }),
    })
    load()
  }

  return (
    <div style={{ padding: isMobile ? '20px 16px' : '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          Organization
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff', margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          Team Structure
        </h1>
        <p style={{ color: '#6B8299', fontSize: 12, margin: '8px 0 0' }}>
          Your coaching tree. Right-click any person to reassign their mentor.
        </p>
      </div>

      {/* Stats */}
      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
          <div style={{
            padding: '12px 18px', background: '#132238', borderRadius: 6,
            border: '1px solid rgba(201,169,110,0.12)',
          }}>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#fff', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
              {data.stats.totalAgents}
            </div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E' }}>
              Total Agents
            </div>
          </div>
          {data.stats.byPhase.filter(p => p.count > 0).map(p => (
            <div key={p.phase} style={{
              padding: '12px 18px', background: '#132238', borderRadius: 6,
              border: `1px solid ${PHASE_COLORS[p.phase]}20`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 300, color: PHASE_COLORS[p.phase], fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                {p.count}
              </div>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299' }}>
                {p.title}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tree */}
      {loading && (
        <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center' }}>Loading team structure...</div>
      )}

      {data && (
        <div style={{
          overflowX: 'auto',
          padding: '20px 0',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.tree.map(root => (
              <TreeNode
                key={root.id}
                node={root}
                depth={0}
                allAgents={allAgents}
                onReassign={handleReassign}
              />
            ))}
          </div>
        </div>
      )}

      {data && data.tree.length === 0 && !loading && (
        <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center' }}>
          No agents found. Agents appear here once they&apos;re created.
        </div>
      )}
    </div>
  )
}

function flattenTree(nodes: OrgNode[]): { agentCode: string; firstName: string; lastName: string }[] {
  const result: { agentCode: string; firstName: string; lastName: string }[] = []
  function walk(n: OrgNode) {
    result.push({ agentCode: n.agentCode, firstName: n.firstName, lastName: n.lastName })
    for (const c of n.children) walk(c)
  }
  for (const n of nodes) walk(n)
  return result
}
