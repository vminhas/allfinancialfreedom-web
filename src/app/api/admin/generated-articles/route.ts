import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// GET /api/admin/generated-articles — list all drafts/published/rejected.
export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const rows = await db.generatedArticle.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, slug: true, title: true, category: true, excerpt: true,
      status: true, autoPublishAt: true, publishedAt: true, createdAt: true,
      tags: true, relatedSlugs: true, sourceUrls: true, coverImage: true,
    },
  })
  return NextResponse.json({ articles: rows })
}
