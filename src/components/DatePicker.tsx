'use client'

import { useEffect, useRef, useState } from 'react'

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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

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

export default function DatePicker({ value, onChange, required, placeholder, min, max, style }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => parseISO(value) ?? new Date())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  useEffect(() => {
    const parsed = parseISO(value)
    if (parsed) setView(parsed)
  }, [value])

  const minDate = parseISO(min ?? '')
  const maxDate = parseISO(max ?? '')
  const selected = parseISO(value)

  const firstOfMonth = new Date(view.getFullYear(), view.getMonth(), 1)
  const startOffset = firstOfMonth.getDay()
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()

  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)

  const today = new Date()
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const pickDay = (day: number) => {
    const picked = new Date(view.getFullYear(), view.getMonth(), day)
    onChange(fmtISO(picked))
    setOpen(false)
  }

  const shiftMonth = (delta: number) => {
    setView(v => new Date(v.getFullYear(), v.getMonth() + delta, 1))
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
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 60,
          background: '#0F1E33',
          border: '1px solid rgba(201,169,110,0.25)',
          borderRadius: 6,
          padding: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          width: 260,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button type="button" onClick={() => shiftMonth(-1)} style={{ background: 'transparent', border: 'none', color: '#C9A96E', fontSize: 16, cursor: 'pointer', padding: '2px 8px' }}>‹</button>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </div>
            <button type="button" onClick={() => shiftMonth(1)} style={{ background: 'transparent', border: 'none', color: '#C9A96E', fontSize: 16, cursor: 'pointer', padding: '2px 8px' }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DOW.map((d, i) => (
              <div key={i} style={{ fontSize: 9, color: '#6B8299', textAlign: 'center', fontWeight: 700, padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {days.map((d, i) => {
              if (d === null) return <div key={i} />
              const cellDate = new Date(view.getFullYear(), view.getMonth(), d)
              const disabled = (minDate && cellDate < minDate) || (maxDate && cellDate > maxDate)
              const isSelected = selected && isSameDay(cellDate, selected)
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
                    borderRadius: 4,
                    color: isSelected ? '#142D48' : disabled ? '#374151' : isToday ? '#C9A96E' : '#9BB0C4',
                    fontSize: 12,
                    padding: '6px 0',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: isSelected || isToday ? 700 : 400,
                  }}
                >{d}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(201,169,110,0.1)' }}>
            <button type="button" onClick={() => { onChange(fmtISO(new Date())); setOpen(false) }} style={{ background: 'transparent', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>Today</button>
            {value && <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={{ background: 'transparent', border: 'none', color: '#6B8299', fontSize: 11, cursor: 'pointer' }}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  )
}
