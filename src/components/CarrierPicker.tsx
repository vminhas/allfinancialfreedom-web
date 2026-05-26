'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { CARRIERS } from '@/lib/agent-constants'

// Searchable combobox for the CARRIERS list. Drop-in replacement for
// a <select required>, used in both the add and edit forms in
// NewBusinessTab. Matches behavior:
//
//   - Substring-and-token search (typing "amer" matches both
//     "American Equity" AND "North American Life", and typing
//     "anico annuity" requires both tokens to appear)
//   - Arrow up / down to navigate, Enter to commit, Escape to revert
//   - Click outside reverts to the last committed value (so an
//     accidental typo doesn't blow away the existing selection)
//   - The visible input also carries the `required` attribute so
//     native form validation still blocks submit on empty.
//
// Visual style is hardcoded to match the dark-theme `inputStyle` used
// elsewhere in NewBusinessTab.tsx (background #0A1628, gold-tinted
// borders). If the picker spreads to other pages later, factor the
// tokens out into a shared style helper.

const inputStyle: React.CSSProperties = {
  background: '#0A1628',
  border: '1px solid rgba(201,169,110,0.2)',
  borderRadius: 4,
  color: '#9BB0C4',
  padding: '7px 10px',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: 'inherit',
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 2px)',
  left: 0,
  right: 0,
  zIndex: 50,
  background: '#132238',
  border: '1px solid rgba(201,169,110,0.25)',
  borderRadius: 4,
  maxHeight: 260,
  overflowY: 'auto',
  boxShadow: '0 16px 30px rgba(0,0,0,0.35)',
}

interface Props {
  value: string
  onChange: (carrier: string) => void
  required?: boolean
  placeholder?: string
}

export default function CarrierPicker({ value, onChange, required, placeholder }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync visible query whenever the parent's value changes (e.g. form
  // reset after submit, or external selection).
  useEffect(() => { setQuery(value) }, [value])

  // Click outside: revert to last committed value and close. mousedown
  // fires before blur, so the option's own onMouseDown still wins when
  // clicking a result.
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setQuery(value)
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [value])

  // Token-match: every whitespace-separated term in the query must
  // appear somewhere in the carrier name (case-insensitive). Empty
  // query, or query that equals the current selection, shows the
  // full list so the user can browse from the selected state.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q === value.toLowerCase()) return CARRIERS as readonly string[]
    const terms = q.split(/\s+/).filter(Boolean)
    return (CARRIERS as readonly string[]).filter(c => {
      const cl = c.toLowerCase()
      return terms.every(t => cl.includes(t))
    })
  }, [query, value])

  // Reset highlight whenever the filter list changes shape.
  useEffect(() => { setHighlight(0) }, [filtered.length])

  const commit = (c: string) => {
    onChange(c)
    setQuery(c)
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered[highlight]) {
        e.preventDefault()
        commit(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery(value)
      setOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'Tab' && open && filtered[highlight] && query.trim()) {
      // Tab confirms the highlighted match so the user can flow to
      // the next field without a click. Skip when query is empty so
      // tabbing through an untouched field doesn't auto-select.
      commit(filtered[highlight])
    }
  }

  // Native form validation: an empty visible input with `required`
  // will block submit, same behavior as the old <select required>.
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        spellCheck={false}
        required={required}
        value={query}
        placeholder={placeholder ?? 'Search carrier...'}
        onFocus={() => { setOpen(true); inputRef.current?.select() }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={onKey}
        style={inputStyle}
      />
      {open && (
        <div style={popoverStyle} role="listbox">
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: '#6B8299' }}>
              No carriers match &quot;{query}&quot;.
            </div>
          ) : filtered.map((c, i) => (
            <div
              key={c}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => { e.preventDefault(); commit(c) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '8px 10px',
                fontSize: 12,
                color: '#fff',
                cursor: 'pointer',
                background: i === highlight ? 'rgba(201,169,110,0.14)' : 'transparent',
                borderLeft: value === c ? '2px solid #C9A96E' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{c}</span>
              {value === c && <span style={{ color: '#C9A96E', fontSize: 12 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
