'use client'

// Notification bell + dropdown + live SSE wiring for the agent portal.
//
// One <NotificationCenter /> mounted in the navbar handles three jobs:
//
//   1. Fetches the recent inbox + unread count from
//      /api/agents/notifications on mount.
//   2. Opens a single EventSource against
//      /api/agents/notifications/stream and listens for new
//      notifications. Each one is prepended to the dropdown list,
//      bumps the unread count, and pops a toast at the top-right.
//   3. Re-broadcasts every received notification as a
//      window-level CustomEvent('aff-notification') so other parts of
//      the page can refetch what's relevant — e.g. the feedback list
//      can re-load itself when kind === 'feedback.response' arrives.
//      Decoupled from the bell so adding a new feature with its own
//      live-update behavior is just a window event listener.
//
// Reconnect / resume: EventSource auto-reconnects on disconnect. We
// pass ?since=<iso> on each (re)connect so we don't replay
// notifications the client has already seen.

import { useEffect, useRef, useState } from 'react'

interface Notification {
  id: string
  kind: string
  subjectType: string
  subjectId: string | null
  title: string
  body: string | null
  linkUrl: string | null
  color: number | null
  readAt: string | null
  createdAt: string
}

interface InboxResponse {
  notifications: Notification[]
  unreadCount: number
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState<Notification | null>(null)
  const sinceRef = useRef<string>(new Date().toISOString())
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // Initial inbox fetch.
  useEffect(() => {
    let cancelled = false
    fetch('/api/agents/notifications?limit=30')
      .then(r => r.ok ? r.json() : null)
      .then((d: InboxResponse | null) => {
        if (cancelled || !d) return
        setNotifications(d.notifications)
        setUnread(d.unreadCount)
        // Resume cursor: never replay notifications already in the
        // initial fetch.
        if (d.notifications.length > 0) {
          sinceRef.current = d.notifications[0].createdAt
        }
      })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [])

  // Single live EventSource. Closes on unmount; auto-reconnects on
  // network blips via standard browser behavior. The ?since param is
  // updated as we receive events so reconnection skips already-sent.
  useEffect(() => {
    let es: EventSource | null = null
    let stopped = false

    const connect = () => {
      if (stopped) return
      const url = `/api/agents/notifications/stream?since=${encodeURIComponent(sinceRef.current)}`
      es = new EventSource(url)
      es.addEventListener('notification', (ev: MessageEvent) => {
        try {
          const n = JSON.parse(ev.data) as Notification
          // Prepend (newest first) and dedupe by id.
          setNotifications(prev => {
            if (prev.some(p => p.id === n.id)) return prev
            return [n, ...prev].slice(0, 50)
          })
          if (!n.readAt) setUnread(c => c + 1)
          setToast(n)
          sinceRef.current = n.createdAt
          // Re-broadcast for feature-specific listeners.
          window.dispatchEvent(new CustomEvent('aff-notification', { detail: n }))
        } catch { /* malformed, skip */ }
      })
      es.onerror = () => {
        // EventSource handles reconnect itself if we leave it; this
        // close + reconnect path is for hard failures (server drop).
        es?.close()
        if (stopped) return
        setTimeout(connect, 3000)
      }
    }

    connect()
    return () => { stopped = true; es?.close() }
  }, [])

  // Auto-dismiss the toast after 5s.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const markAllRead = async () => {
    try {
      await fetch('/api/agents/notifications', { method: 'POST' })
      setNotifications(prev => prev.map(n => n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
      setUnread(0)
    } catch { /* non-fatal */ }
  }

  const markOneRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
    setUnread(c => Math.max(0, c - (notifications.find(n => n.id === id)?.readAt ? 0 : 1)))
    try { await fetch(`/api/agents/notifications/${id}`, { method: 'PATCH' }) } catch { /* non-fatal */ }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9BB0C4', fontSize: 18, padding: '6px 8px',
          position: 'relative', lineHeight: 1,
        }}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, padding: '0 4px',
            background: '#C9A96E', color: '#142D48',
            borderRadius: 8, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          width: 360, maxWidth: 'calc(100vw - 24px)',
          background: '#0F1E33', border: '1px solid rgba(201,169,110,0.2)',
          borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          zIndex: 100,
          maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1px solid rgba(201,169,110,0.12)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'none', border: 'none', color: '#9BB0C4', fontSize: 10, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: '#6B8299', fontSize: 12 }}>
                No notifications yet. The team will reach out here when there&apos;s something new.
              </div>
            ) : (
              notifications.map(n => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onMarkRead={() => markOneRead(n.id)}
                  onClick={() => {
                    if (!n.readAt) markOneRead(n.id)
                    if (n.linkUrl) window.location.href = n.linkUrl
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Toast — slides in from top-right, auto-dismiss 5s */}
      {toast && (
        <div
          onClick={() => {
            if (toast.linkUrl) window.location.href = toast.linkUrl
            setToast(null)
          }}
          style={{
            position: 'fixed', top: 'calc(20px + env(safe-area-inset-top))', right: 20,
            width: 320, maxWidth: 'calc(100vw - 40px)',
            background: '#0F1E33',
            border: `1px solid ${toast.color ? hexFromInt(toast.color) : '#C9A96E'}80`,
            borderLeft: `3px solid ${toast.color ? hexFromInt(toast.color) : '#C9A96E'}`,
            borderRadius: 6, padding: '12px 14px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            cursor: toast.linkUrl ? 'pointer' : 'default',
            zIndex: 101,
            animation: 'aff-toast-in 0.25s ease-out',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
            {toast.title}
          </div>
          {toast.body && (
            <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
              {toast.body}
            </div>
          )}
          <style>{`
            @keyframes aff-toast-in {
              from { transform: translateX(20px); opacity: 0; }
              to   { transform: translateX(0);     opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ n, onMarkRead, onClick }: { n: Notification; onMarkRead: () => void; onClick: () => void }) {
  const accent = n.color ? hexFromInt(n.color) : '#C9A96E'
  const isUnread = !n.readAt
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: n.linkUrl ? 'pointer' : 'default',
        background: isUnread ? 'rgba(201,169,110,0.04)' : 'transparent',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: isUnread ? accent : 'transparent',
        marginTop: 5,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
          {n.title}
        </div>
        {n.body && (
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {n.body}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4 }}>
          {relativeTime(n.createdAt)}
        </div>
      </div>
      {isUnread && (
        <button
          onClick={(e) => { e.stopPropagation(); onMarkRead() }}
          aria-label="Mark as read"
          style={{
            background: 'none', border: 'none', color: '#6B8299',
            fontSize: 14, cursor: 'pointer', padding: 0,
            opacity: 0.6,
          }}
        >
          ✓
        </button>
      )}
    </div>
  )
}

function hexFromInt(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
