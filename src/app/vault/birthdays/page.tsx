'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Birthday {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  state: string | null
  phase: number
  avatarUrl: string | null
  phone: string | null
  email: string
  cft: string | null
  dateOfBirth: string
  nextBirthday: string
  daysUntil: number
  turningAge: number
  isToday: boolean
}

interface Stats {
  today: number
  thisWeek: number
  thisMonth: number
  total: number
}

export default function BirthdaysPage() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/birthdays')
      .then(r => r.json())
      .then((d: { birthdays: Birthday[]; stats: Stats }) => {
        setBirthdays(d.birthdays ?? [])
        setStats(d.stats ?? null)
        setLoading(false)
      })
  }, [])

  // Group birthdays by section
  const sections = (() => {
    const today: Birthday[] = []
    const thisWeek: Birthday[] = []
    const thisMonth: Birthday[] = []
    const next30to90: Birthday[] = []
    const later: Birthday[] = []

    for (const b of birthdays) {
      if (b.daysUntil === 0) today.push(b)
      else if (b.daysUntil <= 7) thisWeek.push(b)
      else if (b.daysUntil <= 30) thisMonth.push(b)
      else if (b.daysUntil <= 90) next30to90.push(b)
      else later.push(b)
    }

    return [
      { label: 'Today 🎉', items: today, color: '#C9A96E', highlight: true },
      { label: 'This Week', items: thisWeek, color: '#9B6DFF' },
      { label: 'This Month', items: thisMonth, color: '#C9A96E' },
      { label: 'Next 90 Days', items: next30to90, color: '#9BB0C4' },
      { label: 'Later This Year & Beyond', items: later, color: '#6B8299' },
    ]
  })()

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 28,
        padding: '28px 0 24px',
        borderBottom: '1px solid rgba(201,169,110,0.08)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          All Financial Freedom
        </div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Birthday Tracker
        </h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0, lineHeight: 1.55 }}>
          Upcoming agent birthdays sorted by next occurrence. Eventually this will auto-post a custom birthday card to Discord on the day.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          <StatCard label="Today" value={stats.today} color="#C9A96E" emoji="🎂" />
          <StatCard label="Next 7 Days" value={stats.thisWeek} color="#9B6DFF" />
          <StatCard label="Next 30 Days" value={stats.thisMonth} color="#9BB0C4" />
          <StatCard label="Total Tracked" value={stats.total} color="#6B8299" />
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6B8299', fontSize: 13, padding: '40px 0' }}>Loading birthdays...</div>
      ) : birthdays.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(201,169,110,0.15)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 14, color: '#9BB0C4', marginBottom: 4 }}>No birthdays on file</div>
          <div style={{ fontSize: 12, color: '#6B8299' }}>
            Add a date of birth to an agent&apos;s profile in the AFF Tracker to see them here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {sections.map(section =>
            section.items.length === 0 ? null : (
              <div key={section.label}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
                  textTransform: 'uppercase', color: section.color,
                  marginBottom: 12,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {section.label}
                  <span style={{ fontSize: 9, color: '#6B8299', fontWeight: 500, letterSpacing: '0.05em' }}>
                    ({section.items.length})
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 10,
                }}>
                  {section.items.map(b => (
                    <BirthdayCard key={b.id} birthday={b} highlight={section.highlight} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, emoji }: { label: string; value: number; color: string; emoji?: string }) {
  return (
    <div style={{
      background: '#142D48',
      border: '1px solid rgba(201,169,110,0.08)',
      borderRadius: 6, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color, lineHeight: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        {value}
        {emoji && value > 0 && <span style={{ fontSize: 22 }}>{emoji}</span>}
      </div>
    </div>
  )
}

function BirthdayCard({ birthday, highlight }: { birthday: Birthday; highlight?: boolean }) {
  const router = useRouter()
  const initials = `${birthday.firstName.charAt(0)}${birthday.lastName.charAt(0)}`
  const dobDate = new Date(birthday.dateOfBirth)
  const month = dobDate.toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })
  const day = dobDate.getUTCDate()

  const openProfile = () => {
    router.push(`/vault/tracker?agentId=${birthday.id}`)
  }

  return (
    <button
      onClick={openProfile}
      style={{
        background: highlight ? 'linear-gradient(135deg, rgba(201,169,110,0.14), rgba(201,169,110,0.04))' : '#142D48',
        border: `1px solid ${highlight ? 'rgba(201,169,110,0.45)' : 'rgba(201,169,110,0.08)'}`,
        borderRadius: 6,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: highlight ? '0 0 24px rgba(201,169,110,0.15)' : 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        if (!highlight) e.currentTarget.style.background = 'rgba(201,169,110,0.06)'
      }}
      onMouseLeave={e => {
        if (!highlight) e.currentTarget.style.background = '#142D48'
      }}>
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: birthday.avatarUrl ? 'transparent' : 'rgba(201,169,110,0.15)',
        border: `1px solid ${highlight ? '#C9A96E' : 'rgba(201,169,110,0.3)'}`,
        overflow: 'hidden', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {birthday.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={birthday.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 14, color: '#C9A96E', fontWeight: 700 }}>{initials}</span>
        )}
      </div>

      {/* Body */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
          {birthday.firstName} {birthday.lastName}
          <span style={{ fontSize: 9, color: '#6B8299' }}>· {birthday.agentCode}</span>
        </div>
        <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 2 }}>
          {month} {day} · turning {birthday.turningAge}
          {birthday.state && <span style={{ color: '#6B8299' }}> · {birthday.state}</span>}
        </div>
      </div>

      {/* Days-until pill */}
      <div style={{
        background: highlight ? '#C9A96E' : 'rgba(201,169,110,0.1)',
        color: highlight ? '#142D48' : '#C9A96E',
        border: `1px solid ${highlight ? '#C9A96E' : 'rgba(201,169,110,0.3)'}`,
        borderRadius: 999,
        padding: '5px 11px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        {birthday.daysUntil === 0
          ? 'Today'
          : birthday.daysUntil === 1
          ? 'Tomorrow'
          : `${birthday.daysUntil} days`}
      </div>
    </button>
  )
}
