import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { generateWeeklyDraft } from '@/lib/article-generator'
import { loadArticleCorpus } from '@/lib/article-corpus'

// POST /api/admin/generated-articles/generate-now
//
// Admin "Generate now" button. Runs the same pipeline as the Friday
// cron and stores the result as a DRAFT. Useful for testing and for
// asking for an extra article between scheduled runs.

export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  let draft
  try {
    draft = await generateWeeklyDraft()
  } catch (err) {
    console.error('[generate-now] failed:', err)
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 })
  }

  // Slug collision check.
  const corpus = await loadArticleCorpus()
  const taken = new Set(corpus.map(c => c.slug))
  const dbHits = await db.generatedArticle.findMany({
    where: { slug: { startsWith: draft.slug } },
    select: { slug: true },
  })
  for (const h of dbHits) taken.add(h.slug)
  let slug = draft.slug
  let n = 2
  while (taken.has(slug)) { slug = `${draft.slug}-${n}`; n += 1 }

  const created = await db.generatedArticle.create({
    data: {
      slug,
      title: draft.title,
      category: draft.category,
      excerpt: draft.excerpt,
      coverImage: draft.coverImage,
      tags: draft.tags,
      mdxBody: draft.mdxBody,
      sourceUrls: draft.sourceUrls,
      relatedSlugs: draft.relatedSlugs,
      status: 'DRAFT',
      autoPublishAt: null, // manual-only when triggered from the button
    },
  })
  return NextResponse.json({ ok: true, article: { id: created.id, slug: created.slug, title: created.title } })
}
