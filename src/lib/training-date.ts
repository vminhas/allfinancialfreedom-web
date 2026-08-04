// Deterministic date resolution for training flyers.
//
// The flyer parser (LLM) reliably READS the weekday and time printed on a
// flyer, but is unreliable at DATE ARITHMETIC. A real example: an "EVERY
// TUESDAY 7:00 PM" flyer parsed on Sat Aug 1 2026 was resolved to Wed Aug 5
// instead of Tue Aug 4 (off by one). So for flyers that name a weekday
// without an explicit printed calendar date, we ignore the model's computed
// date and compute the next occurrence of that weekday ourselves, in Eastern
// time, keeping the model's wall-clock time.

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

const SHORT_WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

// The ET UTC-offset (in minutes, negative west of UTC) in effect on a given
// Eastern calendar date. Probes ~noon ET, when the offset is unambiguous
// (never a DST-transition hour), so the whole-day offset is correct.
function etOffsetMinutes(year: number, month1: number, day: number): number {
  const probe = new Date(Date.UTC(year, month1 - 1, day, 16, 0, 0)) // ~noon ET
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', timeZoneName: 'shortOffset',
  }).formatToParts(probe).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-5'
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return -300
  const sign = m[1] === '-' ? -1 : 1
  return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0))
}

// Today's Eastern calendar date + weekday index for a given instant.
function easternToday(now: Date): { year: number; month1: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    year: parseInt(get('year'), 10),
    month1: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    weekday: SHORT_WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

export interface ResolveTrainingStartArgs {
  // The model's ISO 8601 datetime with ET offset (e.g. "2026-08-05T19:00:00-04:00").
  // Its TIME-of-day is trusted; its DATE is only trusted for explicit-date flyers.
  startsAtET: string
  // Weekday the flyer names for this occurrence ("Tuesday"), when determinable.
  dayOfWeekET?: string | null
  // True only when the flyer printed an explicit calendar date.
  hasExplicitDate?: boolean
  now?: Date
}

// Returns the correct start instant for a parsed training event.
//
// - Explicit printed date, or no identifiable weekday, or an unparseable model
//   time: trust the model's startsAtET (it read a printed date; no arithmetic).
// - Weekday-only flyer: recompute to the next occurrence of that weekday at the
//   model's ET wall-clock time, in Eastern time.
export function resolveTrainingStart({
  startsAtET, dayOfWeekET, hasExplicitDate, now = new Date(),
}: ResolveTrainingStartArgs): Date {
  const modelDate = new Date(startsAtET)
  const targetIdx = dayOfWeekET ? WEEKDAY_INDEX[dayOfWeekET.trim().toLowerCase()] : undefined

  if (hasExplicitDate || targetIdx === undefined || isNaN(modelDate.getTime())) {
    return isNaN(modelDate.getTime()) ? now : modelDate
  }

  // ET wall-clock time (HH:MM[:SS]) from the model's ISO string — this part is
  // reliable even when its date is wrong.
  const tm = startsAtET.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/)
  const hh = tm ? parseInt(tm[1], 10) : 0
  const mm = tm ? parseInt(tm[2], 10) : 0
  const ss = tm && tm[3] ? parseInt(tm[3], 10) : 0

  const today = easternToday(now)

  // Build the instant for `today + add` days at the ET wall-clock time.
  const build = (add: number): Date => {
    // Advance the Eastern calendar date via a UTC anchor (Date.UTC normalizes
    // month/year rollover), then read the resulting Y-M-D back.
    const anchor = new Date(Date.UTC(today.year, today.month1 - 1, today.day + add, 12, 0, 0))
    const y = anchor.getUTCFullYear()
    const mo = anchor.getUTCMonth() + 1
    const d = anchor.getUTCDate()
    const offset = etOffsetMinutes(y, mo, d)
    // ET wall-clock (y-mo-d hh:mm:ss) → UTC instant = wall-clock minus offset.
    return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss) - offset * 60_000)
  }

  const daysAhead = (targetIdx - today.weekday + 7) % 7
  let candidate = build(daysAhead)
  // If the match is today but the time already passed, roll to next week.
  if (daysAhead === 0 && candidate.getTime() <= now.getTime()) {
    candidate = build(7)
  }
  return candidate
}
