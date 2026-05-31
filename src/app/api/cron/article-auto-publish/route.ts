import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/cron/article-auto-publish
//
// Runs every hour. Publishes any DRAFT GeneratedArticle whose
// autoPublishAt is in the past. This is what makes the Friday morning
// draft go live by noon if nobody clicked Reject. To require manual
// approval, set autoPublishAt to NULL on the draft (the reject and
// publish endpoints already do that for terminal states).

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const due = await db.generatedArticle.findMany({
    where: { status: 'DRAFT', autoPublishAt: { not: null, lte: now } },
    select: { id: true, slug: true, title: true },
    take: 5,
  })

  const published: { id: string; slug: string }[] = []
  for (const d of due) {
    const updated = await db.generatedArticle.update({
      where: { id: d.id },
      data: { status: 'PUBLISHED', publishedAt: now, autoPublishAt: null },
    })
    published.push({ id: updated.id, slug: updated.slug })
  }

  return NextResponse.json({ ok: true, published })
}
