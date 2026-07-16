'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface QuickJumpItem {
  href: string
  label: string
  icon: string
  group?: string
}

// Cmd/Ctrl+K quick-jump over every vault page. Keeps the sidebar as the
// primary nav but means you never have to scroll or expand a group to
// reach a page. Rendered by VaultSidebar so it shares the same item list
// (and respects the LC vs admin difference).
export default function VaultCommandPalette({
  items,
  open,
  onClose,
}: {
  items: QuickJumpItem[]
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.group ?? '').toLowerCase().includes(q) ||
      i.href.toLowerCase().includes(q)
    )
  }, [items, query])

  // Reset query + selection each time it opens, and focus the input.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus after paint so the autofocus actually lands.
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = results[active]
      if (pick) go(pick.href)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'calc(12vh + env(safe-area-inset-top)) 16px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-label="Quick jump"
        style={{
          width: '100%', maxWidth: 520, background: '#142D48',
          border: '1px solid rgba(201,169,110,0.25)', borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)', overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Jump to a page..."
          style={{
            width: '100%', padding: '16px 18px', fontSize: 15,
            background: 'transparent', border: 'none', outline: 'none',
            color: '#ffffff', borderBottom: '1px solid rgba(201,169,110,0.15)',
          }}
        />
        <div ref={listRef} style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
          {results.length === 0 ? (
            <div style={{ padding: '20px 16px', color: '#6B8299', fontSize: 13, textAlign: 'center' }}>
              No matching page.
            </div>
          ) : (
            results.map((r, idx) => {
              const on = idx === active
              return (
                <div
                  key={r.href}
                  data-idx={idx}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(r.href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                    background: on ? 'rgba(201,169,110,0.14)' : 'transparent',
                  }}
                >
                  <span style={{ color: on ? '#C9A96E' : 'rgba(201,169,110,0.4)', fontSize: 14, width: 18, textAlign: 'center' }}>
                    {r.icon}
                  </span>
                  <span style={{ color: on ? '#ffffff' : '#9BB0C4', fontSize: 13, flex: 1 }}>
                    {r.label}
                  </span>
                  {r.group && (
                    <span style={{ color: '#4B5563', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      {r.group}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
