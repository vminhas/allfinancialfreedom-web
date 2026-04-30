'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Three-view date picker:
//   days   - standard month grid (default)
//   months - 4x3 grid of months in the current year
//   years  - 4x3 grid of 12 years in the current decade, with prev/next
//            decade arrows so jumping decades is one click each
// Click the month/year header in any view to step up to the next view
// (days -> months -> years), so picking a birthday in 1980 from 2026
// is at most three clicks: header, prev decade, year. Then header → month
// → day. Beats the old "click previous arrow 60 times" by a mile.

interface DatePickerProps {
  value: string                  // yyyy-mm-dd
  onChange: (val: string) => void
  required?: boolean
  placeholder?: string
  min?: string                   // yyyy-mm-dd
  max?: string                   // yyyy-mm-dd
  style?: React.CSSProperties
}

const inputBase: React.CSSProperties = {
  background: '#0A1628',
  border: '1px solid rgba(201,169,110,0.2)',
  borderRadius: 4,
  color: '#9BB0C4',
  padding: '7px 10px',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
  textAlign: 'left',
  cursor: 'pointer',
}

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW          = ['S','M','T','W','T','F','S']

function parseISO(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function fmtISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function fmtDisplay(s: string): string {
  const d = parseISO(s)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

type View = 'days' | 'months' | 'years'

export default function DatePicker({ value, onChange, required, placeholder, min, max, style }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('days')
  const [cursor, setCursor] = useState<Date>(() => parseISO(value) ?? new Date())
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // Popover position relative to the trigger. Recomputed on open so we
  // can flip up if there's no room below — mobile in particular often
  // has the trigger near the bottom of the viewport.
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({})

  // Outside click + Escape to close.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        popRef.current && !popRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  // Reposition popover on open and on viewport changes. Keeps it
  // anchored to the trigger but flips above when there's no room.
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const update = () => {
      const rect = ref.current!.getBoundingClientRect()
      const popH = 320
      const flipUp = rect.bottom + popH + 12 > window.innerHeight && rect.top > popH
      // Keep within viewport horizontally on small screens.
      const popW = 280
      const maxLeft = window.innerWidth - popW - 8
      const left = Math.max(8, Math.min(rect.left, maxLeft))
      setPopStyle({
        position: 'fixed',
        left,
        top: flipUp ? rect.top - popH - 6 : rect.bottom + 6,
        zIndex: 1000,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // Sync cursor when the value changes from outside (e.g. parent reset).
  useEffect(() => {
    const parsed = parseISO(value)
    if (parsed) setCursor(parsed)
  }, [value])

  // Reset to days view each time the picker reopens, so a stray open
  // in years view doesn't surprise the next user.
  useEffect(() => {
    if (open) setView('days')
  }, [open])

  const minDate = parseISO(min ?? '')
  const maxDate = parseISO(max ?? '')
  const selected = parseISO(value)
  const today = startOfDay(new Date())

  const decadeStart = Math.floor(cursor.getFullYear() / 10) * 10

  const dayCells = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startOffset = firstOfMonth.getDay()
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < startOffset; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [cursor])

  const pickDay = (day: number) => {
    const picked = new Date(cursor.getFullYear(), cursor.getMonth(), day)
    onChange(fmtISO(picked))
    setOpen(false)
  }

  const pickMonth = (m: number) => {
    setCursor(c => new Date(c.getFullYear(), m, 1))
    setView('days')
  }

  const pickYear = (y: number) => {
    setCursor(c => new Date(y, c.getMonth(), 1))
    setView('months')
  }

  const shiftMonth = (delta: number) => {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  const shiftYear = (delta: number) => {
    setCursor(c => new Date(c.getFullYear() + delta, c.getMonth(), 1))
  }

  const shiftDecade = (delta: number) => {
    setCursor(c => new Date(c.getFullYear() + delta * 10, c.getMonth(), 1))
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...inputBase, color: value ? '#fff' : '#6B8299', ...style }}
      >
        {value ? fmtDisplay(value) : (placeholder ?? 'Select date')}
        {required && !value && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Date picker"
          style={{
            ...popStyle,
            background: '#0F1E33',
            border: '1px solid rgba(201,169,110,0.3)',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
            width: 280,
          }}
        >
          {/* ── Header: prev / title / next ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 4 }}>
            <button
              type="button"
              aria-label={view === 'years' ? 'Previous decade' : view === 'months' ? 'Previous year' : 'Previous month'}
              onClick={() => {
                if (view === 'days') shiftMonth(-1)
                else if (view === 'months') shiftYear(-1)
                else shiftDecade(-1)
              }}
              style={navBtn}
            >‹</button>
            <button
              type="button"
              onClick={() => setView(v => v === 'days' ? 'months' : v === 'months' ? 'years' : 'years')}
              style={{
                background: 'transparent', border: '1px solid transparent',
                color: '#fff', fontSize: 13, fontWeight: 600,
                padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                flex: 1, textAlign: 'center',
              }}
              title="Switch view"
            >
              {view === 'days' && `${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}`}
              {view === 'months' && cursor.getFullYear()}
              {view === 'years' && `${decadeStart} – ${decadeStart + 11}`}
            </button>
            <button
              type="button"
              aria-label={view === 'years' ? 'Next decade' : view === 'months' ? 'Next year' : 'Next month'}
              onClick={() => {
                if (view === 'days') shiftMonth(1)
                else if (view === 'months') shiftYear(1)
                else shiftDecade(1)
              }}
              style={navBtn}
            >›</button>
          </div>

          {/* ── Days view ── */}
          {view === 'days' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                {DOW.map((d, i) => (
                  <div key={i} style={{ fontSize: 9, color: '#6B8299', textAlign: 'center', fontWeight: 700, padding: '4px 0' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {dayCells.map((d, i) => {
                  if (d === null) return <div key={i} />
                  const cellDate = new Date(cursor.getFullYear(), cursor.getMonth(), d)
                  const disabled = (minDate && cellDate < minDate) || (maxDate && cellDate > maxDate)
                  const isSelected = !!selected && isSameDay(cellDate, selected)
                  const isToday = isSameDay(cellDate, today)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => !disabled && pickDay(d)}
                      disabled={!!disabled}
                      style={{
                        background: isSelected ? '#C9A96E' : isToday ? 'rgba(201,169,110,0.15)' : 'transparent',
                        border: '1px solid transparent',
                        borderRadius: 6,
                        color: isSelected ? '#142D48' : disabled ? '#374151' : isToday ? '#C9A96E' : '#d1d9e2',
                        fontSize: 13,
                        padding: '8px 0',
                        minHeight: 34,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontWeight: isSelected || isToday ? 700 : 400,
                      }}
                    >{d}</button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Months view ── */}
          {view === 'months' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {MONTHS_SHORT.map((m, i) => {
                const isCurrent = i === today.getMonth() && cursor.getFullYear() === today.getFullYear()
                const isSelected = !!selected && i === selected.getMonth() && cursor.getFullYear() === selected.getFullYear()
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pickMonth(i)}
                    style={{
                      ...gridBtn,
                      background: isSelected ? '#C9A96E' : isCurrent ? 'rgba(201,169,110,0.15)' : 'transparent',
                      color: isSelected ? '#142D48' : isCurrent ? '#C9A96E' : '#d1d9e2',
                      fontWeight: isSelected || isCurrent ? 700 : 500,
                    }}
                  >{m}</button>
                )
              })}
            </div>
          )}

          {/* ── Years view ── */}
          {view === 'years' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {Array.from({ length: 12 }, (_, k) => decadeStart + k).map(y => {
                const isCurrent = y === today.getFullYear()
                const isSelected = !!selected && y === selected.getFullYear()
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => pickYear(y)}
                    style={{
                      ...gridBtn,
                      background: isSelected ? '#C9A96E' : isCurrent ? 'rgba(201,169,110,0.15)' : 'transparent',
                      color: isSelected ? '#142D48' : isCurrent ? '#C9A96E' : '#d1d9e2',
                      fontWeight: isSelected || isCurrent ? 700 : 500,
                    }}
                  >{y}</button>
                )
              })}
            </div>
          )}

          {/* ── Footer: Today / Clear ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(201,169,110,0.1)' }}>
            <button
              type="button"
              onClick={() => { onChange(fmtISO(today)); setOpen(false) }}
              style={{ background: 'transparent', border: 'none', color: '#C9A96E', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                style={{ background: 'transparent', border: 'none', color: '#6B8299', fontSize: 11, cursor: 'pointer', padding: '4px 0' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'rgba(201,169,110,0.08)',
  border: '1px solid rgba(201,169,110,0.2)',
  color: '#C9A96E',
  fontSize: 16, fontWeight: 700,
  cursor: 'pointer',
  padding: '4px 12px',
  borderRadius: 4,
  width: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const gridBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 6,
  fontSize: 12,
  padding: '12px 0',
  cursor: 'pointer',
  textAlign: 'center',
}
