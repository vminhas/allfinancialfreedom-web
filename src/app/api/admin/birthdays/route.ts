import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/birthdays
// Returns active agents with a dateOfBirth, sorted by days-until-next-birthday.
// Computed in JS so we don't have to do DOY math in SQL.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const profiles = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', dateOfBirth: { not: null } },
    select: {
      id: true,
      agentCode: true,
      firstName: true,
      lastName: true,
      state: true,
      phase: true,
      dateOfBirth: true,
      avatarUrl: true,
      phone: true,
      cft: true,
      agentUser: { select: { email: true } },
    },
  })

  // Compute "today" in Eastern Time, not UTC — otherwise a birthday on
  // April 16 ET shows as "Today" when it's still April 15 ET because the
  // server runs in UTC and UTC midnight is 8pm/7pm ET the day before.
  const etDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD format
  const [etYear, etMonth, etDay] = etDate.split('-').map(Number)
  const today = new Date(etYear, etMonth - 1, etDay) // month is 0-indexed

  const enriched = profiles
    .map(p => {
      const dob = p.dateOfBirth!
      const month = dob.getUTCMonth()
      const day = dob.getUTCDate()
      const birthYear = dob.getUTCFullYear()

      // Next birthday (this year if not yet passed, else next year)
      let next = new Date(etYear, month, day)
      if (next < today) next = new Date(etYear + 1, month, day)

      const daysUntil = Math.round((next.getTime() - today.getTime()) / 86400000)
      const turningAge = next.getFullYear() - birthYear

      return {
        id: p.id,
        agentCode: p.agentCode,
        firstName: p.firstName,
        lastName: p.lastName,
        state: p.state,
        phase: p.phase,
        avatarUrl: p.avatarUrl,
        phone: p.phone,
        email: p.agentUser.email,
        cft: p.cft,
        dateOfBirth: dob.toISOString(),
        nextBirthday: next.toISOString(),
        daysUntil,
        turningAge,
        isToday: daysUntil === 0,
      }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)

  // Stats
  const todayCount = enriched.filter(e => e.daysUntil === 0).length
  const thisWeekCount = enriched.filter(e => e.daysUntil > 0 && e.daysUntil <= 7).length
  const thisMonthCount = enriched.filter(e => e.daysUntil >= 0 && e.daysUntil <= 30).length

  return NextResponse.json({
    birthdays: enriched,
    stats: {
      today: todayCount,
      thisWeek: thisWeekCount,
      thisMonth: thisMonthCount,
      total: enriched.length,
    },
  })
}
