'use client'

import { Headset } from 'lucide-react'
import type { PhaseItemDef } from '@/lib/agent-constants'
import { LC_CALENDAR_URL } from '@/lib/agent-constants'

interface CoordinatorRequest {
  id: string
  phaseItemKey?: string | null
  topic: string
  message: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
}

interface PhaseItemState {
  phase: number
  itemKey: string
  completed: boolean
  completedAt: string | null
}

interface Props {
  items: PhaseItemDef[]
  phaseItems: PhaseItemState[]
  requests: CoordinatorRequest[]
  // Admin-overridable LC booking link. Falls back to the constant when
  // the caller doesn't supply it (e.g. rendered outside the portal).
  calendarUrl?: string
  onRequestHelp: (itemKey: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#f59e0b',
  IN_PROGRESS: '#9B6DFF',
  RESOLVED: '#4ade80',
  CLOSED: '#6B8299',
}

export default function LicensingCoordinatorPanel({ items, phaseItems, requests, calendarUrl, onRequestHelp }: Props) {
  const calUrl = calendarUrl || LC_CALENDAR_URL
  const openCount = requests.filter(r => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length

  return (
    <div style={{
      marginBottom: 8,
      background: 'rgba(201,169,110,0.03)',
      border: '1px solid rgba(201,169,110,0.12)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(201,169,110,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Headset size={15} color="#C9A96E" />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#C9A96E' }}>
            Licensing Coordinator
          </span>
        </div>
        {openCount > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#f59e0b',
            background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 10,
          }}>
            {openCount} open
          </span>
        )}
      </div>

      <div style={{ padding: '6px 0' }}>
        {items.map(item => {
          const done = phaseItems.some(pi => pi.itemKey === item.key && pi.completed)
          const itemReqs = requests.filter(r => r.phaseItemKey === item.key)
          const latestReq = itemReqs[0]
          const hasOpenReq = itemReqs.some(r => r.status === 'OPEN' || r.status === 'IN_PROGRESS')

          return (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                background: done ? '#4ade80' : 'transparent',
                border: `2px solid ${done ? '#4ade80' : 'rgba(255,255,255,0.15)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: '#0A1628', fontWeight: 700,
              }}>
                {done && '\u2713'}
              </span>
              <span style={{ fontSize: 11, color: done ? '#9BB0C4' : '#ffffff', flex: 1 }}>
                {item.label}
              </span>
              {latestReq && (
                <span style={{
                  fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
                  color: STATUS_COLORS[latestReq.status] ?? '#6B8299',
                }}>
                  {latestReq.status === 'IN_PROGRESS' ? 'In Progress' : latestReq.status === 'RESOLVED'
                    ? 'Resolved'
                    : latestReq.status === 'OPEN' ? 'Pending' : latestReq.status.charAt(0) + latestReq.status.slice(1).toLowerCase()}
                </span>
              )}
              {!done && !hasOpenReq && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => onRequestHelp(item.key)}
                    title="Send a message to the licensing coordinator"
                    style={{
                      background: 'none', border: '1px solid rgba(201,169,110,0.25)',
                      color: '#C9A96E', borderRadius: 3,
                      padding: '3px 10px', fontSize: 9, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Message
                  </button>
                  <a
                    href={calUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Schedule time on the licensing coordinator's calendar"
                    style={{
                      background: 'none', border: '1px solid rgba(96,165,250,0.3)',
                      color: '#60A5FA', borderRadius: 3,
                      padding: '3px 10px', fontSize: 9, fontWeight: 600,
                      cursor: 'pointer', textDecoration: 'none',
                    }}
                  >
                    Schedule
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer note: standing offer to schedule, even on items that already */}
      {/* have an open request. Mirrors the message-or-schedule choice we */}
      {/* offer everywhere else for LC-driven steps. */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid rgba(201,169,110,0.08)',
        fontSize: 10, color: '#6B8299',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span>Need a live walkthrough? Book a 1:1 with the coordinator.</span>
        <a
          href={calUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#60A5FA', textDecoration: 'none', fontWeight: 700, fontSize: 10 }}
        >
          📅 Open calendar
        </a>
      </div>
    </div>
  )
}
