'use client'

import { useState, useEffect, useCallback } from 'react'

// Install-as-PWA card for the agent portal. Mirrors the Kloz-style
// 'Install Kloz on your phone' card: gold AFF mark on the left,
// short pitch in the middle, Install + Maybe later buttons on the
// right.
//
// Two install paths:
//   1. Chrome / Edge / Samsung Internet / Android Chrome — fires
//      a beforeinstallprompt event we capture and call prompt() on.
//   2. iOS Safari — no beforeinstallprompt support. We detect it
//      and show an instructional sheet ('tap Share → Add to Home
//      Screen').
//
// Suppression:
//   - 'aff.pwa.install.dismissedAt' — if dismissed in the last 14
//     days, the card stays hidden. Cleared on rev-bumping the
//     storage key when copy changes substantially.
//   - Already-running-as-standalone (matchMedia
//     display-mode: standalone OR navigator.standalone on iOS) →
//     never show.

const STORAGE_KEY = 'aff.pwa.install.dismissedAt'
const SUPPRESS_MS = 14 * 24 * 60 * 60 * 1000  // 14 days

// Minimal type for the BeforeInstallPromptEvent. Chrome-specific;
// not on the DOM type lib by default.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPromptCard() {
  const [visible, setVisible] = useState(false)
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosInstructionsOpen, setIosInstructionsOpen] = useState(false)
  const [isIosSafari, setIsIosSafari] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Already-installed shortcut: bail early so the card never
    // shows up when the app is launched as a standalone PWA.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return

    // Recently-dismissed shortcut.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const ts = parseInt(raw, 10)
        if (Number.isFinite(ts) && Date.now() - ts < SUPPRESS_MS) return
      }
    } catch { /* localStorage blocked — fall through, the card just always shows */ }

    // iOS Safari path. No beforeinstallprompt — we surface the card
    // with an instructional sheet instead of the native flow.
    const ua = window.navigator.userAgent
    const iosSafari = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    if (iosSafari) {
      setIsIosSafari(true)
      setVisible(true)
      return
    }

    // Chromium-family path. Listen for beforeinstallprompt; the
    // browser only fires it when its install heuristics are met
    // (manifest present, served over HTTPS, repeated visits, etc.)
    // so it might land seconds after page load.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredEvent(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener)
  }, [])

  const dismiss = useCallback(() => {
    setVisible(false)
    setIosInstructionsOpen(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch { /* ignore */ }
  }, [])

  const install = useCallback(async () => {
    if (isIosSafari) {
      setIosInstructionsOpen(true)
      return
    }
    if (!deferredEvent) return
    try {
      await deferredEvent.prompt()
      const choice = await deferredEvent.userChoice
      if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
        // Either path: hide the card. accepted obviously; dismissed
        // we don't want to keep nagging in the same session.
        dismiss()
      }
    } catch {
      dismiss()
    }
  }, [deferredEvent, isIosSafari, dismiss])

  if (!visible) return null

  return (
    <>
      <div
        role="dialog"
        aria-label="Install AFF Agent Portal"
        style={{
          position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 90,
          maxWidth: 480, margin: '0 auto',
          padding: '14px 16px',
          background: '#0C1E30',
          border: '1px solid rgba(201,169,110,0.3)',
          borderRadius: 14,
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', gap: 12,
          // iOS safe-area inset so the card doesn't fight the home indicator.
          paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #C9A96E, #8B6F2E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#142D48', fontSize: 18, fontWeight: 700,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}>
          AFF
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>
            Install AFF on your phone
          </div>
          <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 2, lineHeight: 1.4 }}>
            One-tap home screen access to your checklist + leaderboard.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', flexShrink: 0 }}>
          <button
            onClick={install}
            style={{
              padding: '8px 16px', borderRadius: 8,
              background: '#C9A96E', color: '#142D48',
              border: 'none', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Install
          </button>
          <button
            onClick={dismiss}
            style={{
              padding: '6px 16px', borderRadius: 8,
              background: 'transparent', color: '#9BB0C4',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Maybe later
          </button>
        </div>
      </div>

      {iosInstructionsOpen && (
        <div
          onClick={() => setIosInstructionsOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(10,22,40,0.85)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0C1E30',
            border: '1px solid rgba(201,169,110,0.3)',
            borderRadius: 14, width: '100%', maxWidth: 420, padding: 22,
            paddingBottom: 'calc(22px + env(safe-area-inset-bottom))',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
              iOS install
            </div>
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 600, marginBottom: 14 }}>
              Add AFF to your home screen
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, color: '#d1d9e2', fontSize: 13, lineHeight: 1.65 }}>
              <li>Tap the <strong style={{ color: '#fff' }}>Share</strong> icon at the bottom of Safari (the square with the up-arrow).</li>
              <li>Scroll down and tap <strong style={{ color: '#fff' }}>Add to Home Screen</strong>.</li>
              <li>Tap <strong style={{ color: '#fff' }}>Add</strong> in the top-right.</li>
            </ol>
            <button
              onClick={() => setIosInstructionsOpen(false)}
              style={{
                marginTop: 18, padding: '10px 16px', borderRadius: 8,
                background: 'transparent', color: '#9BB0C4',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', width: '100%',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
