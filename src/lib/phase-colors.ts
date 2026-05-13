// Single source of truth for AFF phase accent colors.
//
// These are pure CSS hex strings — safe to import in both server and
// client modules. Phase number is the key; every key 1-6 is defined
// so callers can safely use PHASE_COLORS[phase] without a fallback.
//
// Visual hierarchy intention:
//   1 (Onboarding)  — sky blue,  calm entry point
//   2 (Field Train) — emerald,   active growth
//   3 (CFT)         — AFF gold,  certified milestone
//   4 (MD Focus)    — indigo,    leadership building
//   5 (EMD Focus)   — fuchsia,   elite, electric, premium
//   6 (NVP Focus)   — amber,     pinnacle, ultimate
//
// Phase 5 is EMD — impressive but deliberately one step below the
// NVP amber crown so the two apex colors remain visually distinct.

export const PHASE_COLORS: Record<number, string> = {
  1: '#60a5fa',  // sky blue
  2: '#4ade80',  // emerald
  3: '#C9A96E',  // AFF gold
  4: '#818cf8',  // indigo
  5: '#e879f9',  // fuchsia — EMD: electric, premium
  6: '#fbbf24',  // amber — NVP: pinnacle
}

// Discord embed colors (integer hex, used by the bot and phase-item-announce).
export const PHASE_COLORS_INT: Record<number, number> = {
  1: 0x60a5fa,
  2: 0x4ade80,
  3: 0xC9A96E,
  4: 0x818cf8,
  5: 0xe879f9,
  6: 0xfbbf24,
}
