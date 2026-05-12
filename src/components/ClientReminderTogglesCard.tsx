'use client'

import { useState, useEffect, useCallback } from 'react'

// 'Client touchpoint reminders' toggle card for the agent portal.
// Drops onto the Profile tab. Three switches — birthday, 30-day
// thank-you, annual review. Each writes to
// AgentProfile.clientReminderPrefs via /api/agents/client-reminder-prefs.
// A daily cron at 9am ET reads the prefs and fires due reminders
// as Discord DMs + portal bell pings.

interface Prefs {
  birthday: boolean
  thankYou30Day: boolean
  annualReview: boolean
}

const TOGGLES: Array<{
  key: keyof Prefs
  icon: string
  title: string
  description: string
  accent: string
}> = [
  {
    key: 'birthday',
    icon: '🎂',
    title: 'Client birthdays',
    description: 'Heads-up 5 days before each client’s birthday so you can drop a card in the mail.',
    accent: '#F59E0B',
  },
  {
    key: 'thankYou30Day',
    icon: '📝',
    title: '30-day thank you',
    description: 'Reminder 30 days after a policy issues to send a thank-you note.',
    accent: '#60A5FA',
  },
  {
    key: 'annualReview',
    icon: '📅',
    title: 'Annual review',
    description: 'Anniversary nudge to book a check-in call and review coverage.',
    accent: '#C9A96E',
  },
]

export default function ClientReminderTogglesCard() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState<keyof Prefs | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/agents/client-reminder-prefs')
    if (res.ok) {
      const d = await res.json() as { prefs: Prefs }
      setPrefs(d.prefs)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = async (key: keyof Prefs) => {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSaving(key)
    try {
      await fetch('/api/agents/client-reminder-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{
      background: '#0C1E30',
      border: '1px solid rgba(201,169,110,0.15)',
      borderRadius: 8, padding: 20,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
        Client Touchpoints
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
        Reminders for your book
      </div>
      <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 16, lineHeight: 1.55 }}>
        Toggle on the touchpoints you want. We&rsquo;ll ping you on Discord + your bell when each one comes due.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TOGGLES.map(t => {
          const on = prefs?.[t.key] === true
          const busy = saving === t.key
          return (
            <button
              key={t.key}
              onClick={() => toggle(t.key)}
              disabled={!prefs || busy}
              style={{
                background: on ? `${t.accent}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${on ? `${t.accent}55` : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 8, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', textAlign: 'left', width: '100%',
                opacity: prefs ? 1 : 0.5,
                transition: 'background 200ms ease, border-color 200ms ease',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{t.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                  {t.title}
                </div>
                <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.4 }}>
                  {t.description}
                </div>
              </div>
              <Switch on={on} accent={t.accent} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Switch({ on, accent }: { on: boolean; accent: string }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: 36, height: 22, borderRadius: 999,
        background: on ? accent : 'rgba(255,255,255,0.14)',
        position: 'relative', transition: 'background 180ms ease',
        display: 'inline-block',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2, left: on ? 16 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        transition: 'left 180ms ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </span>
  )
}
