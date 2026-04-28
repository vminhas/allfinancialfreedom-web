// Shared time-range presets for the vault dashboards. The picker writes
// ISO `from` / `to` strings into the URL; the API reads them straight off
// the query string. Keeping the presets here means the page and any future
// CSV export or admin email use the same labels.

export type TimeRangeKey =
  | 'last7'
  | 'last30'
  | 'last90'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'ytd'
  | 'all_time'
  | 'custom'

export interface TimeRangeOption {
  key: TimeRangeKey
  label: string
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { key: 'last7',        label: 'Last 7 days' },
  { key: 'last30',       label: 'Last 30 days' },
  { key: 'last90',       label: 'Last 90 days' },
  { key: 'this_month',   label: 'This month' },
  { key: 'last_month',   label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'ytd',          label: 'Year to date' },
  { key: 'all_time',     label: 'All time' },
  { key: 'custom',       label: 'Custom' },
]

export interface TimeRange {
  from: Date | null  // null means open-ended (no lower bound)
  to: Date            // exclusive upper bound (start of next day)
}

// Compute a [from, to) range for a preset key, anchored to the caller's
// "today" (midnight local). For all_time, from = null. For custom, the
// caller passes the actual dates.
export function rangeForKey(key: TimeRangeKey, today: Date = startOfTodayLocal()): TimeRange {
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  switch (key) {
    case 'last7': {
      const from = new Date(today); from.setDate(from.getDate() - 6)
      return { from, to: tomorrow }
    }
    case 'last30': {
      const from = new Date(today); from.setDate(from.getDate() - 29)
      return { from, to: tomorrow }
    }
    case 'last90': {
      const from = new Date(today); from.setDate(from.getDate() - 89)
      return { from, to: tomorrow }
    }
    case 'this_month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from, to: tomorrow }
    }
    case 'last_month': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from, to }
    }
    case 'this_quarter': {
      const q = Math.floor(today.getMonth() / 3)
      const from = new Date(today.getFullYear(), q * 3, 1)
      return { from, to: tomorrow }
    }
    case 'ytd': {
      const from = new Date(today.getFullYear(), 0, 1)
      return { from, to: tomorrow }
    }
    case 'all_time':
      return { from: null, to: tomorrow }
    case 'custom':
      // Caller is expected to provide explicit dates; default to last 30
      return rangeForKey('last30', today)
  }
}

export function startOfTodayLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Parse `from` / `to` ISO strings off a URL searchParams. Returns null
// for either side that's missing or unparseable.
export function parseRangeFromSearch(params: URLSearchParams): { from: Date | null; to: Date | null } {
  const fromStr = params.get('from')
  const toStr = params.get('to')
  const from = fromStr ? new Date(fromStr) : null
  const to = toStr ? new Date(toStr) : null
  return {
    from: from && !isNaN(from.getTime()) ? from : null,
    to: to && !isNaN(to.getTime()) ? to : null,
  }
}

// Helper: Prisma `gte`/`lt` clause for a date column given an optional range.
// Returns undefined when both bounds are null so it can spread cleanly into
// a `where`.
export function prismaDateClause(from: Date | null, to: Date | null) {
  if (!from && !to) return undefined
  const clause: { gte?: Date; lt?: Date } = {}
  if (from) clause.gte = from
  if (to) clause.lt = to
  return clause
}
