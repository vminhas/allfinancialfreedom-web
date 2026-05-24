import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

const STAGE_ORDER = [
  'New Lead', 'Contacted', 'Responded', 'Discovery Booked',
  'Discovery Completed', 'No-Show', 'Qualified', 'Ready to Onboard',
  'Onboarded', 'Not Interested',
]

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  // Stage counts from local Contact ghlPipelineStage + outreachStatus fallback
  const contacts = await db.contact.findMany({
    select: { ghlPipelineStage: true, outreachStatus: true, source: true, convertedAt: true, createdAt: true },
  })

  const stageCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}
  let totalConverted = 0
  let convertedThisMonth = 0
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  for (const c of contacts) {
    // Determine effective stage
    let stage = c.ghlPipelineStage
    if (!stage) {
      if (!c.outreachStatus || c.outreachStatus === 'pending') stage = 'New Lead'
      else if (c.outreachStatus === 'sent' || c.outreachStatus === 'drafted') stage = 'Contacted'
      else if (c.outreachStatus === 'responded') stage = 'Responded'
      else if (c.outreachStatus === 'opted-out') stage = 'Not Interested'
      else stage = 'New Lead'
    }

    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1
    sourceCounts[c.source] = (sourceCounts[c.source] ?? 0) + 1

    if (c.convertedAt) {
      totalConverted++
      if (c.convertedAt >= monthStart) convertedThisMonth++
    }
  }

  // Appointment stats
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86400000)
  const [appointmentsToday, appointmentsThisWeek] = await Promise.all([
    db.ghlAppointment.count({ where: { appointmentDate: { gte: todayStart, lt: todayEnd } } }),
    db.ghlAppointment.count({ where: { appointmentDate: { gte: new Date(todayStart.getTime() - 7 * 86400000) } } }),
  ])

  // No-show rate
  const [totalBooked, totalNoShow] = await Promise.all([
    db.ghlAppointment.count({ where: { status: { in: ['COMPLETED', 'NO_SHOW'] } } }),
    db.ghlAppointment.count({ where: { status: 'NO_SHOW' } }),
  ])

  // Outreach stats
  const emailsSentToday = await db.outreachMessage.count({
    where: { status: 'SENT', sentAt: { gte: todayStart } },
  })
  const emailsSentThisWeek = await db.outreachMessage.count({
    where: { status: 'SENT', sentAt: { gte: new Date(todayStart.getTime() - 7 * 86400000) } },
  })

  const stages = STAGE_ORDER.map(name => ({
    name,
    count: stageCounts[name] ?? 0,
  }))

  return NextResponse.json({
    stages,
    sources: Object.entries(sourceCounts).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    totalContacts: contacts.length,
    totalConverted,
    convertedThisMonth,
    appointmentsToday,
    appointmentsThisWeek,
    noShowRate: totalBooked > 0 ? Math.round((totalNoShow / totalBooked) * 100) : 0,
    emailsSentToday,
    emailsSentThisWeek,
  })
}
