import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateWeeklyDraft } from '@/lib/article-generator'
import { sendChannelMessage } from '@/lib/discord'

// GET /api/cron/weekly-article
//
// Friday 6am ET. Generates one DRAFT GeneratedArticle using Opus 4.8
// with web search, dedupes against the existing blog corpus, picks a
// non-overlapping topic, writes the full MDX, and stores it as DRAFT
// in the DB. Posts a Discord preview embed so an admin can approve or
// reject from /vault/articles.
//
// If no action is taken, a follow-up call (or a future companion cron)
// will auto-publish at autoPublishAt. For now we set autoPublishAt to
// 12 hours out so the first deploys default to "draft only, you
// approve from the vault."
//
// ?force=1 still requires the Bearer secret but ignores the
// "one-per-week" guard so we can dry-run.

const ONE_HOUR_MS = 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = new URL(req.url).searchParams.get('force') === '1'

  // One-per-week guard: skip if we already drafted in the last 6 days.
  if (!force) {
    const since = new Date(Date.now() - 6 * 24 * ONE_HOUR_MS)
    const recent = await db.generatedArticle.findFirst({
      where: { createdAt: { gte: since } },
      select: { id: true, slug: true, status: true },
    })
    if (recent) {
      return NextResponse.json({ ok: true, skipped: 'already-drafted-this-week', recent })
    }
  }

  let draft
  try {
    draft = await generateWeeklyDraft()
  } catch (err) {
    console.error('[weekly-article] generation failed:', err)
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 })
  }

  // Defensive slug collision check. If the model picked a slug that
  // collides with an existing article (static MDX or a prior draft),
  // append a short date suffix.
  const slug = await uniqueSlug(draft.slug)

  // Default auto-publish window: 12 hours from now. The companion
  // cron can sweep DRAFT rows where autoPublishAt < now AND
  // status === 'DRAFT', and publish them. Until that companion ships,
  // this column is just metadata for the UI.
  const autoPublishAt = new Date(Date.now() + 6 * ONE_HOUR_MS)

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
      autoPublishAt,
    },
  })

  // Discord preview to the admin channel. Includes a deep link to the
  // review page so a one-click approve / reject is easy.
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    const reviewUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.allfinancialfreedom.com'}/vault/articles/${created.id}`
    await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
      embeds: [{
        title: 'New article drafted',
        description: `**${created.title}**\n\n${created.excerpt.slice(0, 280)}\n\n[Open in vault →](${reviewUrl})`,
        color: 0xC9A96E,
        fields: [
          { name: 'Category', value: created.category, inline: true },
          { name: 'Status', value: 'DRAFT', inline: true },
          { name: 'Auto-publish at', value: autoPublishAt.toISOString(), inline: false },
        ],
        footer: { text: 'AFF Concierge · Weekly article generator' },
        timestamp: new Date().toISOString(),
      }],
    }).catch(err => console.warn('[weekly-article] discord notify failed:', err))
  }

  return NextResponse.json({
    ok: true,
    article: { id: created.id, slug: created.slug, title: created.title, status: created.status },
    autoPublishAt: autoPublishAt.toISOString(),
  })
}

async function uniqueSlug(base: string): Promise<string> {
  const existsStatic = (await import('@/lib/article-corpus')).loadArticleCorpus
  const corpus = await existsStatic()
  let candidate = base
  let n = 2
  const taken = new Set(corpus.map(c => c.slug))
  // Also exclude any DB rows that already use this slug.
  const dbHits = await db.generatedArticle.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  })
  for (const h of dbHits) taken.add(h.slug)
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }
  return candidate
}
