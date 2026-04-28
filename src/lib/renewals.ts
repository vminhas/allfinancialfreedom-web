// Date math for policy anniversary reminders. Single source of truth used by
// the cron, the vault page, and the agent API so they all bucket the same
// submissions into the same stages.

export type RenewalStage = 'SIXTY_DAYS' | 'THIRTY_DAYS' | 'SEVEN_DAYS'

export interface RenewalWindow {
  daysUntilAnniversary: number
  nextAnniversary: Date
  anniversaryYear: number
  currentStage: RenewalStage | null
}

// Returns "today" anchored to America/New_York midnight, so daysUntil math
// matches what an LC sees on the calendar regardless of the server's UTC clock.
// Mirrors the approach in src/app/api/admin/birthdays/route.ts.
export function todayInEt(now: Date = new Date()): Date {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function computeRenewalWindow(issuedDate: Date, today: Date = todayInEt()): RenewalWindow {
  const month = issuedDate.getUTCMonth()
  const day = issuedDate.getUTCDate()
  const todayY = today.getFullYear()

  let next = new Date(todayY, month, day)
  if (next < today) next = new Date(todayY + 1, month, day)

  const daysUntilAnniversary = Math.round((next.getTime() - today.getTime()) / 86400000)

  let currentStage: RenewalStage | null = null
  if (daysUntilAnniversary >= 0 && daysUntilAnniversary <= 7) currentStage = 'SEVEN_DAYS'
  else if (daysUntilAnniversary <= 30) currentStage = 'THIRTY_DAYS'
  else if (daysUntilAnniversary <= 60) currentStage = 'SIXTY_DAYS'

  return {
    daysUntilAnniversary,
    nextAnniversary: next,
    anniversaryYear: next.getFullYear(),
    currentStage,
  }
}

export const STAGE_LABELS: Record<RenewalStage, string> = {
  SIXTY_DAYS: '60 days',
  THIRTY_DAYS: '30 days',
  SEVEN_DAYS: '7 days',
}
