import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { getSetting, setSetting } from '@/lib/settings'

interface FlowSource { id: string; label: string; color: string; dbValues: string[] }
interface FlowStage { id: string; label: string; color: string; dbValues: string[] }
interface FlowExit { id: string; label: string; color: string; fromStages: string[]; dbValues: string[] }
interface FlowConfig { sources: FlowSource[]; stages: FlowStage[]; exits: FlowExit[] }

const DEFAULT_CONFIG: FlowConfig = {
  sources: [
    { id: 'prophog', label: 'PropHog', color: '#60a5fa', dbValues: ['prophog'] },
    { id: 'join-form', label: 'Join Form', color: '#a78bfa', dbValues: ['join-form', 'form_registration', 'funnel_welcome', 'funnel_opportunity'] },
    { id: 'instagram', label: 'Instagram', color: '#f472b6', dbValues: ['instagram'] },
    { id: 'website', label: 'Website', color: '#4ade80', dbValues: ['website', 'calendar_direct'] },
    { id: 'referral', label: 'Agent Referrals', color: '#C9A96E', dbValues: ['referral'] },
    { id: 'breezy', label: 'Breezy', color: '#38bdf8', dbValues: ['breezy'] },
    { id: 'manual', label: 'Walk-in / Manual', color: '#94a3b8', dbValues: ['manual', 'walk-in', 'unknown', ''] },
  ],
  stages: [
    { id: 'new-lead', label: 'New Lead', color: '#6B8299', dbValues: ['New Lead'] },
    { id: 'contacted', label: 'Contacted', color: '#60a5fa', dbValues: ['Contacted'] },
    { id: 'engaged', label: 'Engaged', color: '#a78bfa', dbValues: ['Engaged', 'Responded'] },
    { id: 'discovery-booked', label: 'Discovery Booked', color: '#f59e0b', dbValues: ['Discovery Booked'] },
    { id: 'discovery-completed', label: 'Discovery Completed', color: '#4ade80', dbValues: ['Discovery Completed'] },
    { id: 'qualified', label: 'Qualified', color: '#22d3ee', dbValues: ['Qualified'] },
    { id: 'interview-booked', label: 'Interview Booked', color: '#38bdf8', dbValues: ['Interview Booked'] },
    { id: 'interview-completed', label: 'Interview Completed', color: '#818cf8', dbValues: ['Interview Completed'] },
    { id: 'onboarding', label: 'Onboarding', color: '#C9A96E', dbValues: ['Onboarding', 'Ready to Onboard'] },
    { id: 'active-agent', label: 'Active Agent', color: '#22c55e', dbValues: ['Active Agent', 'Onboarded'] },
  ],
  exits: [
    { id: 'no-show', label: 'No-Show', color: '#f87171', fromStages: ['discovery-booked', 'interview-booked'], dbValues: ['No-Show'] },
    { id: 'rescheduled', label: 'Rescheduled', color: '#fbbf24', fromStages: ['discovery-booked', 'interview-booked'], dbValues: ['Rescheduled'] },
    { id: 'not-qualified', label: 'Not Qualified', color: '#fb923c', fromStages: ['discovery-completed'], dbValues: ['Not Qualified'] },
    { id: 'not-interested', label: 'Not Interested', color: '#6b7280', fromStages: ['engaged', 'discovery-completed', 'interview-completed'], dbValues: ['Not Interested'] },
  ],
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  let config: FlowConfig
  try {
    const raw = await getSetting('LEAD_FLOW_CONFIG')
    config = raw ? JSON.parse(raw) : DEFAULT_CONFIG
  } catch {
    config = DEFAULT_CONFIG
  }

  // Live counts from contacts
  const contacts = await db.contact.findMany({
    select: { ghlPipelineStage: true, outreachStatus: true, source: true },
  })

  const stageCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}

  for (const c of contacts) {
    // Effective stage from ghlPipelineStage or outreachStatus fallback
    let stage = c.ghlPipelineStage
    if (!stage) {
      if (!c.outreachStatus || c.outreachStatus === 'pending') stage = 'New Lead'
      else if (c.outreachStatus === 'sent' || c.outreachStatus === 'drafted') stage = 'Contacted'
      else if (c.outreachStatus === 'responded') stage = 'Engaged'
      else if (c.outreachStatus === 'opted-out') stage = 'Not Interested'
      else stage = 'New Lead'
    }

    // Match to config stage or exit
    const matched = config.stages.find(s => s.dbValues.includes(stage!))
      ?? config.exits.find(e => e.dbValues.includes(stage!))
    const key = matched?.id ?? 'unknown'
    stageCounts[key] = (stageCounts[key] ?? 0) + 1

    // Source
    const src = c.source || ''
    const matchedSrc = config.sources.find(s => s.dbValues.includes(src))
    const srcKey = matchedSrc?.id ?? 'other'
    sourceCounts[srcKey] = (sourceCounts[srcKey] ?? 0) + 1
  }

  // Calendar breakdown from appointments
  const appointments = await db.ghlAppointment.findMany({
    select: { calendarName: true, assignedTo: true },
  })
  const calendarCounts: Record<string, number> = {}
  const assignmentCounts: Record<string, number> = {}
  for (const a of appointments) {
    calendarCounts[a.calendarName] = (calendarCounts[a.calendarName] ?? 0) + 1
    if (a.assignedTo) {
      assignmentCounts[a.assignedTo] = (assignmentCounts[a.assignedTo] ?? 0) + 1
    }
  }

  return NextResponse.json({
    config,
    stageCounts,
    sourceCounts,
    calendars: Object.entries(calendarCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    assignments: Object.entries(assignmentCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const { config } = await req.json() as { config: FlowConfig }
  await setSetting('LEAD_FLOW_CONFIG', JSON.stringify(config))
  return NextResponse.json({ ok: true })
}
