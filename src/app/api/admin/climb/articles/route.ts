import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/climb/articles?status=DRAFT
//
// Lists Climb articles for the admin review queue. Defaults to
// DRAFT when no filter is passed (the typical "what's waiting on
// me" view). Includes the agent + milestone in each row for the UI.

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const validStatuses = new Set(['DRAFT', 'PUBLISHED', 'REJECTED'])
  const status = statusParam && validStatuses.has(statusParam)
    ? (statusParam as 'DRAFT' | 'PUBLISHED' | 'REJECTED')
    : null

  const articles = await db.agentArticle.findMany({
    where: status ? { status } : undefined,
    orderBy: [
      { status: 'asc' }, // DRAFT first alphabetically
      { generatedAt: 'desc' },
    ],
    include: {
      agentProfile: {
        select: { id: true, firstName: true, lastName: true, agentCode: true, avatarUrl: true, isTest: true },
      },
    },
    take: 200,
  })

  // Pull associated milestones in one batch so the UI can label rows
  // ("Six-Figure Climber") without an N+1.
  const milestoneIds = [...new Set(articles.map(a => a.milestoneId).filter(Boolean) as string[])]
  const milestones = milestoneIds.length > 0
    ? await db.climbMilestone.findMany({
        where: { id: { in: milestoneIds } },
        select: { id: true, title: true, pointThreshold: true, accentColor: true },
      })
    : []
  const milestoneById = new Map(milestones.map(m => [m.id, m]))

  return NextResponse.json({
    articles: articles.map(a => ({
      ...a,
      milestone: a.milestoneId ? milestoneById.get(a.milestoneId) ?? null : null,
    })),
  })
}
