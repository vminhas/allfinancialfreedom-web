// First-touch ad attribution capture. Ad clicks land with utm_* + gclid/fbclid
// on the URL, but the lead form lives on a different page (/retirement-income),
// so by the time someone submits, the params are gone from the current URL if
// they landed on the homepage first and navigated over.
//
// This captures those params the moment they arrive (any page) into
// sessionStorage, first-touch (the acquisition source wins and is not
// overwritten by later internal navigations). The lead form then reads the URL
// first and falls back to this store, so the source is always attached to the
// lead regardless of which page the ad pointed at.
//
// Scope is the browser session (a single visit), which matches how a lead
// funnel works: land from an ad, then submit. No cross-session tracking.

export const ATTRIBUTION_PARAM_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid',
] as const

export type AttributionParam = (typeof ATTRIBUTION_PARAM_KEYS)[number]
export type StoredAttribution = Partial<Record<AttributionParam, string>>

const STORAGE_KEY = 'aff_attribution'

export function readStoredAttribution(): StoredAttribution {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredAttribution) : {}
  } catch {
    return {}
  }
}

// Capture any attribution params present on the CURRENT url into the store.
// First-touch: a key already in the store is never overwritten, so the
// original ad source sticks even after the visitor clicks around the site.
export function persistAttributionFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const p = new URLSearchParams(window.location.search)
    const stored = readStoredAttribution()
    let changed = false
    for (const key of ATTRIBUTION_PARAM_KEYS) {
      const v = p.get(key)
      if (v && !stored[key]) {
        stored[key] = v
        changed = true
      }
    }
    if (changed) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // storage unavailable (private mode, blocked cookies): degrade silently;
    // the form still reads whatever is on the current URL.
  }
}
