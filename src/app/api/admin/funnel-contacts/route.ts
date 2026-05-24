import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const stage = req.nextUrl.searchParams.get('stage')
  if (!stage) return NextResponse.json({ error: 'stage required' }, { status: 400 })

  const sourceFilter = req.nextUrl.searchParams.get('source') // optional: "prophog", "breezy", "instagram", etc.
  const dateFrom = req.nextUrl.searchParams.get('from') // optional: ISO date string
  const dateTo = req.nextUrl.searchParams.get('to') // optional: ISO date string

  // Map stage name to query conditions (including old GHL names for backward compat)
  const stageToFilter: Record<string, object> = {
    'New Lead': { OR: [{ ghlPipelineStage: 'New Lead' }, { ghlPipelineStage: null, outreachStatus: { in: [null, 'pending'] } }] },
    'Contacted': { OR: [{ ghlPipelineStage: 'Contacted' }, { ghlPipelineStage: null, outreachStatus: 'sent' }] },
    'Engaged': { OR: [{ ghlPipelineStage: { in: ['Engaged', 'Responded'] } }, { ghlPipelineStage: null, outreachStatus: 'responded' }] },
    'Onboarding': { ghlPipelineStage: { in: ['Onboarding', 'Ready to Onboard'] } },
    'Active Agent': { ghlPipelineStage: { in: ['Active Agent', 'Onboarded'] } },
    'Not Interested': { OR: [{ ghlPipelineStage: 'Not Interested' }, { ghlPipelineStage: null, outreachStatus: 'opted-out' }] },
  }

  const stageWhere = stageToFilter[stage] ?? { ghlPipelineStage: stage }

  // Source filter: exact match or startsWith for compound sources (breezy → breezy-*)
  let sourceWhere: object | undefined
  if (sourceFilter) {
    // Map source IDs to their dbValues for matching
    const SOURCE_DB_MAP: Record<string, object> = {
      'prophog':   { source: 'prophog' },
      'instagram': { source: { in: ['instagram', 'join-form'] } },
      'website':   { source: { in: ['website', 'calendar_direct'] } },
      'referral':  { source: 'referral' },
      'breezy':    { source: { startsWith: 'breezy' } },
      'manual':    { source: { in: ['manual', 'walk-in', 'unknown', ''] } },
    }
    sourceWhere = SOURCE_DB_MAP[sourceFilter] ?? { source: sourceFilter }
  }

  // Date range filter
  let dateWhere: object | undefined
  if (dateFrom || dateTo) {
    dateWhere = {
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(new Date(dateTo).getTime() + 86400000) } : {}), // end of day
      },
    }
  }

  const conditions = [stageWhere, sourceWhere, dateWhere].filter(Boolean)
  const where = conditions.length > 1 ? { AND: conditions } : conditions[0] ?? stageWhere

  const contacts = await db.contact.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      source: true,
      ghlPipelineStage: true,
      outreachStatus: true,
      ghlAppointmentDate: true,
      assignedTo: true,
      createdAt: true,
    },
  })

  // Also return source counts for the filter pills
  const allForStage = await db.contact.findMany({
    where: stageWhere,
    select: { source: true },
  })
  const sourceTotals: Record<string, number> = {}
  for (const c of allForStage) {
    let src = c.source || 'unknown'
    // Normalize compound sources to their parent
    if (src.startsWith('breezy-')) src = 'breezy'
    sourceTotals[src] = (sourceTotals[src] ?? 0) + 1
  }

  return NextResponse.json({ contacts, stage, sourceTotals })
}
