// Read the existing blog corpus for deduplication and backlink
// targets. Builds a compact JSON summary of every article (slug, title,
// category, tags, excerpt, first paragraph) that fits in a model
// context cheaply.
//
// Includes BOTH:
//   * Static MDX files in content/blog/*.mdx
//   * GeneratedArticle rows where status = PUBLISHED
//
// so the dedupe step sees everything already on the public blog.

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { db } from '@/lib/db'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

export interface CorpusEntry {
  slug: string
  title: string
  category: string
  tags: string[]
  excerpt: string
  firstParagraph: string
}

function firstParagraph(md: string): string {
  // Skip the frontmatter (already stripped by gray-matter) and grab the
  // first non-heading, non-empty paragraph. Used by the dedupe step to
  // judge topical overlap without sending the full article body.
  const lines = md.split(/\r?\n/)
  const buf: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (buf.length > 0) break
      continue
    }
    if (line.startsWith('#') || line.startsWith('---') || line.startsWith('![')) continue
    buf.push(line)
    if (buf.join(' ').length > 600) break
  }
  return buf.join(' ').slice(0, 700)
}

export async function loadArticleCorpus(): Promise<CorpusEntry[]> {
  const entries: CorpusEntry[] = []

  // 1. Static MDX files (hand-written articles).
  if (fs.existsSync(BLOG_DIR)) {
    const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    for (const file of files) {
      const slug = file.replace(/\.mdx?$/, '')
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8')
      const { data, content } = matter(raw)
      entries.push({
        slug,
        title: String(data.title ?? slug),
        category: String(data.category ?? 'General'),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        excerpt: String(data.excerpt ?? '').slice(0, 400),
        firstParagraph: firstParagraph(content),
      })
    }
  }

  // 2. Published auto-generated articles (DB-backed).
  const published = await db.generatedArticle.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, title: true, category: true, tags: true, excerpt: true, mdxBody: true },
  }).catch(() => [])
  for (const a of published) {
    entries.push({
      slug: a.slug,
      title: a.title,
      category: a.category,
      tags: a.tags,
      excerpt: a.excerpt.slice(0, 400),
      firstParagraph: firstParagraph(a.mdxBody),
    })
  }

  return entries
}
