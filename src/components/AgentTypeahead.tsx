'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Search-as-you-type picker for agent fields. Replaces the previous
// pattern of (a) free-text "type the code" inputs and (b) <select>
// dropdowns that scroll past 50+ agents. Type a few characters of
// first/last name or code → matching agents appear → arrow + enter
// to pick.
//
// What gets stored on the form is configurable via `valueField` —
// either 'agentCode' (recruiter assignment, where downstream queries
// match by code) or 'displayName' (trainer assignment, which is a
// free-text 'cft' string column on AgentProfile and matches by name).

export interface AgentOption {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  phase: number
  status?: string
  isLeadership?: boolean
}

interface AgentTypeaheadProps {
  /** Currently-stored value (agentCode or displayName depending on `valueField`). */
  value: string
  /** Called with the new stored value when the admin picks an option or clears. */
  onChange: (value: string, option: AgentOption | null) => void
  /** Which agent field to store on selection. Defaults to `agentCode`. */
  valueField?: 'agentCode' | 'displayName' | 'id'
  /** Placeholder shown in the input when value is empty. */
  placeholder?: string
  /** Pass true on the trainer picker so options are limited to phase 3+. */
  minPhase?: number
  /** Pass true to include status='INACTIVE' (former teammates) in the picker. */
  includeFormer?: boolean
  /** Inline style override for the wrapper. */
  style?: React.CSSProperties
  /** Disable the input (e.g. while parent form is loading). */
  disabled?: boolean
  /** Additional helper text rendered below the input. */
  helperText?: React.ReactNode
}

// Title shown next to an agent in pickers. Convention: agents in
// Phase N display the title earned by completing Phase N-1 (you
// have to be in the *next* phase to hold the current title). Vick
// at Phase 6 is an EMD; an agent at Phase 5 is an MD working
// toward EMD. Phase 1 has no earned title yet (default rendered
// as 'Phase 1' by the fallback).
const PHASE_TITLE: Record<number, string> = {
  2: 'Agent', 3: 'Associate', 4: 'Senior Associate', 5: 'MD', 6: 'EMD',
}

export default function AgentTypeahead({
  value,
  onChange,
  valueField = 'agentCode',
  placeholder = 'Search by name or code...',
  minPhase,
  includeFormer,
  style,
  disabled,
  helperText,
}: AgentTypeaheadProps) {
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Fetch the roster once on mount. Cached at the page level via
  // React Query would be cleaner if multiple pickers render, but
  // for a single modal the one-shot fetch is simpler and fast.
  useEffect(() => {
    const params = new URLSearchParams()
    if (minPhase) params.set('minPhase', String(minPhase))
    if (includeFormer) params.set('includeFormer', '1')
    fetch(`/api/admin/agents/picker?${params}`)
      .then(r => r.ok ? r.json() : { agents: [] })
      .then((d: { agents: AgentOption[] }) => setAgents(d.agents ?? []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false))
  }, [minPhase, includeFormer])

  // The query is what the user has typed. The displayed input value
  // shows either the live query (when focused/typing) or a resolved
  // label for the currently-stored value (when blurred), so the user
  // sees 'Mercedes Grubb (D2161)' instead of just 'D2161' after they
  // pick.
  const resolvedLabel = useMemo(() => {
    if (!value) return ''
    const match = agents.find(a =>
      valueField === 'agentCode'
        ? a.agentCode === value
        : valueField === 'id'
          ? a.id === value
          : `${a.firstName} ${a.lastName}`.trim() === value
    )
    if (!match) return value  // fallback: show whatever was stored
    return `${match.firstName} ${match.lastName} (${match.agentCode})`
  }, [agents, value, valueField])

  // Filtered options. Empty query shows the full list (capped at
  // first 25 to keep the dropdown navigable). Query filters on
  // first/last name or code, case-insensitive.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return agents.slice(0, 25)
    return agents.filter(a => {
      const full = `${a.firstName} ${a.lastName}`.toLowerCase()
      return full.includes(q) || a.agentCode.toLowerCase().includes(q)
    }).slice(0, 25)
  }, [agents, query])

  // Click-outside to close.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const select = (a: AgentOption | null) => {
    if (!a) {
      onChange('', null)
    } else {
      const stored =
        valueField === 'agentCode' ? a.agentCode
        : valueField === 'id' ? a.id
        : `${a.firstName} ${a.lastName}`.trim()
      onChange(stored, a)
    }
    setQuery('')
    setOpen(false)
    setHighlight(0)
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[highlight]
      if (pick) select(pick)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? query : resolvedLabel}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlight(0) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder={loading ? 'Loading...' : placeholder}
          style={typeaheadInput}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => select(null)}
            title="Clear"
            style={clearBtn}
          >×</button>
        )}
      </div>

      {helperText && (
        <div style={{ fontSize: 10, color: '#9BB0C4', marginTop: 4, lineHeight: 1.5 }}>{helperText}</div>
      )}

      {open && (
        <div style={dropdownStyle}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#6B8299', fontStyle: 'italic' }}>
              {loading ? 'Loading agents...' : 'No matches.'}
            </div>
          ) : (
            filtered.map((a, i) => {
              const isFormer = a.status === 'INACTIVE'
              return (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); select(a) }}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    width: '100%',
                    padding: '8px 12px', textAlign: 'left',
                    background: i === highlight ? 'rgba(201,169,110,0.10)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', color: '#fff',
                    opacity: isFormer ? 0.65 : 1,
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.firstName} {a.lastName}
                    {a.isLeadership && <span style={{ marginLeft: 6, fontSize: 9, color: '#C9A96E', letterSpacing: '0.1em' }}>· LEADERSHIP</span>}
                    {isFormer && !a.isLeadership && <span style={{ marginLeft: 6, fontSize: 9, color: '#9BB0C4', letterSpacing: '0.1em' }}>· FORMER</span>}
                  </span>
                  <span style={{ fontSize: 11, color: '#6B8299', flexShrink: 0 }}>
                    {a.agentCode} · {a.isLeadership ? 'CEO/COO' : (PHASE_TITLE[a.phase] ?? `Phase ${a.phase}`)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

const typeaheadInput: React.CSSProperties = {
  flex: 1,
  width: '100%',
  padding: '8px 10px',
  background: '#0A1628',
  border: '1px solid rgba(201,169,110,0.18)',
  color: '#fff',
  fontSize: 13,
  fontFamily: 'inherit',
  borderRadius: 4,
  outline: 'none',
}

const clearBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#9BB0C4',
  width: 28, height: 28,
  borderRadius: 4,
  fontSize: 14, lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
  zIndex: 100,
  background: '#142D48',
  border: '1px solid rgba(201,169,110,0.25)',
  borderRadius: 5,
  maxHeight: 280,
  overflowY: 'auto',
  boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
}
