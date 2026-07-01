import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { REFERRAL_SOURCE_OPTIONS } from '@/lib/annuity-leads'
import type { LeadStatus, LeadScore, Prisma } from '@/generated/prisma/client'

const VALID_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'BOOKED', 'NURTURE', 'WON', 'DEAD']
const VALID_SCORES: LeadScore[] = ['A', 'STANDARD', 'NURTURE']

// GET /api/vault/leads — staff-facing list of annuity landing-page leads.
// Filterable by status, score, and a free-text query over name/email/phone.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const score = searchParams.get('score')
  const referral = searchParams.get('referral')
  const q = searchParams.get('q')?.trim()
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)))

  const where: Prisma.AnnuityLeadWhereInput = {}
  if (status && VALID_STATUSES.includes(status as LeadStatus)) where.status = status as LeadStatus
  if (score && VALID_SCORES.includes(score as LeadScore)) where.score = score as LeadScore
  // referral: "__any__" = any source given; otherwise an exact source.
  if (referral === '__any__') where.referralSource = { not: null }
  else if (referral && (REFERRAL_SOURCE_OPTIONS as readonly string[]).includes(referral)) where.referralSource = referral
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ]
  }

  const [leads, total, statusCounts] = await Promise.all([
    db.annuityLead.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.annuityLead.count({ where }),
    db.annuityLead.groupBy({ by: ['status'], _count: true }),
  ])

  const counts: Record<string, number> = {}
  for (const row of statusCounts) counts[row.status] = row._count

  return NextResponse.json({ leads, total, page, pageSize, counts })
}
