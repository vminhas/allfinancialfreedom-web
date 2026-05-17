'use client'

// Two-stage announcement surfacing:
//
//   Stage 1: a centered modal on first view, gold-bordered, scales in.
//     Forces the agent to see the message at least once. "Got it"
//     acknowledges and writes a localStorage flag so the modal won't
//     fire again on subsequent visits for that same announcement id.
//
//   Stage 2: the existing compact inline banner. Stays visible after
//     the modal is dismissed (so the agent can re-read mid-flow) until
//     they explicitly close it with the X. Closing it hits the
//     /api/agents/announcements POST endpoint to write an
//     AnnouncementRead row, which is the persistent
//     "I'm done with this announcement" signal.
//
// We deliberately don't pull SweetAlert. It's brand-inconsistent and
// a 30KB dep for one modal. The CSS-keyframed version below matches
// the rest of the AFF UI (navy + gold) and animates exactly the way
// the team asked.

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import MarkdownDescription from './MarkdownDescription'

interface Announcement {
  id: string; title: string; message: string; createdAt: string
}

const ACK_PREFIX = 'aff:ann-ack:'

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  // Set of announcement ids that should still trigger the modal stage.
  // Hydrated from localStorage on mount so an already-acknowledged
  // announcement never re-pops.
  const [needModal, setNeedModal] = useState<Set<string>>(new Set())
  // Animation states for graceful enter/exit.
  const [closingModalId, setClosingModalId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/announcements')
      .then(r => r.ok ? r.json() : { announcements: [] })
      .then((d: { announcements: Announcement[] }) => {
        const list = d.announcements ?? []
        setAnnouncements(list)
        // Decide which ones still deserve a modal.
        const need = new Set<string>()
        for (const a of list) {
          if (typeof window !== 'undefined' && !window.localStorage.getItem(ACK_PREFIX + a.id)) {
            need.add(a.id)
          }
        }
        setNeedModal(need)
      })
      .catch(() => {})
  }, [])

  const acknowledge = (id: string) => {
    // Animate out, then drop the modal from the queue.
    setClosingModalId(id)
    setTimeout(() => {
      try { window.localStorage.setItem(ACK_PREFIX + id, '1') } catch {}
      setNeedModal(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setClosingModalId(null)
    }, 220)
  }

  // Permanent dismiss from the inline banner — writes a server-side
  // AnnouncementRead so the announcement won't come back on next load.
  const dismiss = async (id: string) => {
    setAnnouncements(prev => prev.filter(a => a.id !== id))
    setNeedModal(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    await fetch('/api/agents/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcementId: id }),
    })
  }

  if (announcements.length === 0) return null

  // Show the topmost unacknowledged modal first; only one at a time so
  // the agent isn't drowning in pop-ups.
  const activeModal = announcements.find(a => needModal.has(a.id))

  return (
    <>
      {/* Brief CSS keyframes for fade/scale. Inlined here so the */}
      {/* component is self-contained — no global CSS edits. */}
      <style>{`
        @keyframes aff-ann-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes aff-ann-backdrop-out { from { opacity: 1 } to { opacity: 0 } }
        @keyframes aff-ann-card-in   { from { opacity: 0; transform: scale(0.94) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes aff-ann-card-out  { from { opacity: 1; transform: scale(1) translateY(0) } to { opacity: 0; transform: scale(0.96) translateY(4px) } }
      `}</style>

      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="aff-ann-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
            background: 'rgba(10,22,40,0.72)',
            backdropFilter: 'blur(6px)',
            animation: closingModalId === activeModal.id
              ? 'aff-ann-backdrop-out 220ms ease forwards'
              : 'aff-ann-backdrop-in 220ms ease',
          }}
          onClick={() => acknowledge(activeModal.id)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 540,
              background: 'linear-gradient(155deg, #142D48 0%, #0F1E33 100%)',
              border: '1px solid rgba(201,169,110,0.35)',
              borderRadius: 12,
              boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(201,169,110,0.08), 0 0 60px rgba(201,169,110,0.10) inset',
              padding: '32px 32px 24px',
              animation: closingModalId === activeModal.id
                ? 'aff-ann-card-out 180ms ease forwards'
                : 'aff-ann-card-in 260ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '5px 14px', borderRadius: 999, marginBottom: 18,
              background: 'rgba(201,169,110,0.12)',
              border: '1px solid rgba(201,169,110,0.30)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#C9A96E',
                boxShadow: '0 0 0 4px rgba(201,169,110,0.18)',
              }} />
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: '#C9A96E',
              }}>
                Announcement
              </span>
            </div>

            <h2
              id="aff-ann-title"
              style={{
                fontSize: 22, fontWeight: 600, color: '#fff',
                lineHeight: 1.25, margin: '0 0 14px', letterSpacing: '-0.01em',
              }}
            >
              {activeModal.title}
            </h2>
            <MarkdownDescription
              text={activeModal.message}
              style={{ fontSize: 14, color: '#C5D0DC', lineHeight: 1.6 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => acknowledge(activeModal.id)}
                style={{
                  background: '#C9A96E', color: '#142D48',
                  border: 'none', borderRadius: 6,
                  padding: '12px 26px', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: 'pointer',
                  boxShadow: '0 6px 24px rgba(201,169,110,0.35)',
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline banner stage — same layout as before, slightly stronger */}
      {/* gold gradient so it doesn't get lost in the page flow. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {announcements.map(a => (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '14px 18px', borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(201,169,110,0.14) 0%, rgba(201,169,110,0.05) 100%)',
            border: '1px solid rgba(201,169,110,0.32)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A96E', marginBottom: 4, letterSpacing: '0.01em' }}>
                {a.title}
              </div>
              <MarkdownDescription
                text={a.message}
                style={{ fontSize: 12, color: '#C5D0DC', lineHeight: 1.6 }}
              />
            </div>
            <button
              onClick={() => dismiss(a.id)}
              title="Dismiss this announcement"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, flexShrink: 0, marginTop: -2,
              }}
            >
              <X size={14} color="#6B8299" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
