// Daily motivation library for the team.
//
// The full, human-reviewable library now lives in ONE place:
//   src/data/motivation-library.json
// Read and edit that file directly to change the lines. This module
// only types it and exposes the deterministic daily picker.
//
// How edits reach production:
//  - Fresh install: the JSON is copied into the DB on first seed.
//  - Existing prod (already seeded): the DB is the runtime source of
//    truth, so editing the JSON does nothing until an admin runs the
//    "Reload from library file" action (POST /api/admin/motivation/sync),
//    which replaces the live library with this file.
//
// Per project convention: NO em-dashes anywhere in the JSON strings.
// They get posted to Discord and are user-visible.

import libraryJson from '@/data/motivation-library.json'

// Register inspirations (the "in the spirit of" credit baked into each
// JSON row's `attribution`). Kept here so the vault editor and any new
// lines can reuse the same mapping. These are tonal inspirations, not
// claims of authorship: the copy is original and only evokes the named
// speaker's energy.
export type MotivationVoice =
  | 'classic'      // the original AFF house voice
  | 'decisive'     // Mel-Robbins energy: stop overthinking, move now
  | 'maxout'       // Ed-Mylett energy: one more, raise the standard
  | 'state'        // Tony-Robbins energy: decisions, state, action
  | 'warmth'       // Zig-Ziglar energy: attitude, serve others first
  | 'courage'      // Brene-Brown energy: show up, be seen, dare anyway
  | 'grit'         // David-Goggins energy: suck it up, stay hard

export const MOTIVATION_VOICE_ATTRIBUTION: Record<MotivationVoice, string | null> = {
  classic: null,
  decisive: 'Mel Robbins',
  maxout: 'Ed Mylett',
  state: 'Tony Robbins',
  warmth: 'Zig Ziglar',
  courage: 'Brené Brown',
  grit: 'David Goggins',
}

export interface MotivationSeedEntry {
  text: string
  voice: MotivationVoice
  attribution: string | null
  active: boolean
}

// The full library, loaded from the reviewable JSON. On first run this
// is copied into the DB; after that the admin "sync from file" action
// re-applies it. Also the offline fallback for the text-only picker.
export const MOTIVATION_SEED: MotivationSeedEntry[] =
  libraryJson as unknown as MotivationSeedEntry[]

// Deterministic 0-based index for a given calendar day over a list of
// `length` entries: the same date always maps to the same slot, the set
// rotates across the year, and nothing repeats within a `length`-day
// window. Deterministic on purpose so a cron retry resolves to the same
// line (not a different one) and so it is testable.
export function dailyIndex(date: Date, length: number): number {
  if (length <= 0) return 0
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start
  const dayOfYear = Math.floor(diff / 86_400_000) // 1..366
  return (dayOfYear - 1) % length
}

// Text-only convenience used by tests / offline callers. The cron picks
// over the live active library (with attribution) in @/lib/motivation.
export function pickDailyMotivation(
  date: Date = new Date(),
  pool: string[] = MOTIVATION_SEED.map(q => q.text),
): { text: string; index: number } {
  const fallback = MOTIVATION_SEED.map(q => q.text)
  const safe = pool.length > 0 ? pool : fallback
  const index = dailyIndex(date, safe.length)
  return { text: safe[index], index }
}
