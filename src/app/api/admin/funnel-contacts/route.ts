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

  // Map stage name to query conditions
  const stageToFilter: Record<string, object> = {
    'New Lead': { OR: [{ ghlPipelineStage: 'New Lead' }, { ghlPipelineStage: null, outreachStatus: { in: [null, 'pending'] } }] },
    'Contacted': { OR: [{ ghlPipelineStage: 'Contacted' }, { ghlPipelineStage: null, outreachStatus: 'sent' }] },
    'Responded': { OR: [{ ghlPipelineStage: 'Responded' }, { ghlPipelineStage: null, outreachStatus: 'responded' }] },
    'Not Interested': { OR: [{ ghlPipelineStage: 'Not Interested' }, { ghlPipelineStage: null, outreachStatus: 'opted-out' }] },
  }

  const where = stageToFilter[stage] ?? { ghlPipelineStage: stage }

  const contacts = await db.contact.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
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

  return NextResponse.json({ contacts, stage })
}
