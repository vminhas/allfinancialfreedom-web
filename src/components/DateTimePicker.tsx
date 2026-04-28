'use client'

import DatePicker from './DatePicker'

interface DateTimePickerProps {
  value: string                 // datetime-local format: yyyy-mm-ddThh:mm
  onChange: (val: string) => void
  required?: boolean
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
}

export default function DateTimePicker({ value, onChange, required }: DateTimePickerProps) {
  // Split the datetime-local string into date + time. Native time input is
  // already a usable picker, so we only swap the calendar.
  const [date, time] = value ? value.split('T') : ['', '12:00']

  const setDate = (d: string) => {
    onChange(d ? `${d}T${time || '12:00'}` : '')
  }
  const setTime = (t: string) => {
    if (!date) return
    onChange(`${date}T${t}`)
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{ flex: 2 }}>
        <DatePicker value={date} onChange={setDate} required={required} placeholder="Pick date" />
      </div>
      <input
        type="time"
        value={time || ''}
        onChange={e => setTime(e.target.value)}
        style={{ ...inputBase, flex: 1, minWidth: 90 }}
      />
    </div>
  )
}
