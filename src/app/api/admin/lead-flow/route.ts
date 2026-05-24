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
    { id: 'instagram', label: 'Instagram', color: '#f472b6', dbValues: ['instagram', 'join-form', 'form_registration', 'funnel_welcome', 'funnel_opportunity'] },
    { id: 'website', label: 'Website', color: '#4ade80', dbValues: ['website', 'calendar_direct'] },
    { id: 'referral', label: 'Agent Referrals', color: '#C9A96E', dbValues: ['referral'] },
    { id: 'breezy', label: 'Breezy', color: '#38bdf8', dbValues: ['breezy*'] },
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

  // Live counts from contacts — include assignedTo for calendar detail
  // and importJobId for PropHog file breakdown
  const contacts = await db.contact.findMany({
    select: {
      ghlPipelineStage: true, outreachStatus: true, source: true,
      assignedTo: true, importJobId: true,
    },
  })

  const stageCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}
  // Sub-source breakdown shown on hover: "breezy:ziprecruiter" → 22
  const sourceDetail: Record<string, number> = {}
  // Collect importJobIds for PropHog file name lookup
  const importJobIds = new Set<string>()

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

    // Source — supports wildcard prefix matching (e.g. 'breezy*' matches 'breezy-ziprecruiter')
    const src = c.source || ''
    const matchedSrc = config.sources.find(s =>
      s.dbValues.some(v => v.endsWith('*') ? src.startsWith(v.slice(0, -1)) : v === src),
    )
    const srcKey = matchedSrc?.id ?? 'other'
    sourceCounts[srcKey] = (sourceCounts[srcKey] ?? 0) + 1

    // Sub-source detail from compound source (breezy-ziprecruiter → ziprecruiter)
    if (src.includes('-') && src !== 'walk-in' && src !== 'join-form' && src !== 'calendar_direct') {
      const detail = src.replace(/^[^-]+-/, '')
      sourceDetail[`${srcKey}:${detail}`] = (sourceDetail[`${srcKey}:${detail}`] ?? 0) + 1
    }

    // Website: breakdown by calendar assignee (who they booked with)
    if (srcKey === 'website' && c.assignedTo) {
      sourceDetail[`website:${c.assignedTo}`] = (sourceDetail[`website:${c.assignedTo}`] ?? 0) + 1
    }

    // Instagram: show "Join Form" as the channel
    if (srcKey === 'instagram') {
      sourceDetail['instagram:Join Form'] = (sourceDetail['instagram:Join Form'] ?? 0) + 1
    }

    // Referral: just count (individual referrer breakdown is in the referral table)
    if (srcKey === 'referral') {
      sourceDetail['referral:Agent Portal'] = (sourceDetail['referral:Agent Portal'] ?? 0) + 1
    }

    // PropHog: collect importJobIds for file name lookup
    if (srcKey === 'prophog' && c.importJobId) {
      importJobIds.add(c.importJobId)
    }
  }

  // PropHog: breakdown by import file name
  if (importJobIds.size > 0) {
    const importJobs = await db.importJob.findMany({
      where: { id: { in: [...importJobIds] } },
      select: { id: true, fileName: true },
    })
    const jobNameMap = new Map(importJobs.map(j => [j.id, j.fileName ?? 'Unknown file']))
    // Count contacts per import file
    const fileCounts: Record<string, number> = {}
    for (const c of contacts) {
      if (c.source === 'prophog' && c.importJobId) {
        const name = jobNameMap.get(c.importJobId) ?? 'Unknown file'
        // Shorten long filenames for display
        const short = name.length > 30 ? name.substring(0, 27) + '...' : name
        fileCounts[short] = (fileCounts[short] ?? 0) + 1
      }
    }
    // Only show top 5 import files to keep hover clean
    const topFiles = Object.entries(fileCounts).sort(([, a], [, b]) => b - a).slice(0, 5)
    for (const [name, count] of topFiles) {
      sourceDetail[`prophog:${name}`] = count
    }
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
    sourceDetail,
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
