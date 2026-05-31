import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'

// POST publish a DRAFT article. Sets status PUBLISHED + publishedAt,
// after which the public /blog reader includes the row alongside the
// static MDX files. No redeploy needed.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied
  const { id } = await ctx.params

  const existing = await db.generatedArticle.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'PUBLISHED') {
    return NextResponse.json({ ok: true, alreadyPublished: true })
  }

  const article = await db.generatedArticle.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date(), autoPublishAt: null },
  })
  return NextResponse.json({ ok: true, article: { slug: article.slug, publishedAt: article.publishedAt } })
}
