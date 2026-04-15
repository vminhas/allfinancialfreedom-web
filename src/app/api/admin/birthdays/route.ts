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

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const enriched = profiles
    .map(p => {
      const dob = p.dateOfBirth!
      const month = dob.getUTCMonth()
      const day = dob.getUTCDate()
      const birthYear = dob.getUTCFullYear()

      // Next birthday (this year if not yet passed, else next year)
      let next = new Date(today.getFullYear(), month, day)
      if (next < today) next = new Date(today.getFullYear() + 1, month, day)

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
