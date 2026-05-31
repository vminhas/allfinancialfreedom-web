import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { db } from '@/lib/db'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

export interface ArticleMeta {
  slug: string
  title: string
  date: string
  category: string
  author: string
  excerpt: string
  coverImage: string
  tags: string[]
  readTime: number
}

export interface Article extends ArticleMeta {
  content: string
}

function calcReadTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

export function getAllArticles(): ArticleMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return []

  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))

  return files
    .map(file => {
      const slug = file.replace(/\.mdx?$/, '')
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8')
      const { data, content } = matter(raw)
      return {
        slug,
        title: data.title ?? slug,
        date: data.date ?? '',
        category: data.category ?? 'General',
        author: data.author ?? 'All Financial Freedom',
        excerpt: data.excerpt ?? content.slice(0, 160).replace(/[#*`]/g, '') + '…',
        coverImage: data.coverImage ?? '',
        tags: data.tags ?? [],
        readTime: calcReadTime(content),
      } satisfies ArticleMeta
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getArticle(slug: string): Article | null {
  const mdxPath = path.join(BLOG_DIR, `${slug}.mdx`)
  const mdPath = path.join(BLOG_DIR, `${slug}.md`)
  const filePath = fs.existsSync(mdxPath) ? mdxPath : fs.existsSync(mdPath) ? mdPath : null

  if (!filePath) return null

  const raw = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)

  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? '',
    category: data.category ?? 'General',
    author: data.author ?? 'All Financial Freedom',
    excerpt: data.excerpt ?? content.slice(0, 160).replace(/[#*`]/g, '') + '…',
    coverImage: data.coverImage ?? '',
    tags: data.tags ?? [],
    readTime: calcReadTime(content),
    content,
  }
}

export function getAllCategories(): string[] {
  const articles = getAllArticles()
  return Array.from(new Set(articles.map(a => a.category))).sort()
}

// ──────────────────────────────────────────────────────────────────
// Auto-generated articles merge
//
// Published GeneratedArticle rows (from the weekly Opus cron) are
// surfaced alongside the static MDX files. Static files win on slug
// collision so a manual override in the repo always replaces an
// auto-generated DB row. The Async variants below are the new
// canonical reads for any caller that can await them.

async function readDbArticles(): Promise<{ meta: ArticleMeta; content: string }[]> {
  const rows = await db.generatedArticle.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      slug: true, title: true, category: true, excerpt: true, coverImage: true,
      tags: true, mdxBody: true, publishedAt: true, createdAt: true,
    },
  }).catch(() => [])
  return rows.map(r => {
    const parsed = matter(r.mdxBody)
    const date = String(parsed.data.date ?? (r.publishedAt ?? r.createdAt).toISOString().slice(0, 10))
    const meta: ArticleMeta = {
      slug: r.slug,
      title: String(parsed.data.title ?? r.title),
      date,
      category: String(parsed.data.category ?? r.category),
      author: String(parsed.data.author ?? 'All Financial Freedom'),
      excerpt: String(parsed.data.excerpt ?? r.excerpt),
      coverImage: String(parsed.data.coverImage ?? r.coverImage),
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : r.tags,
      readTime: calcReadTime(parsed.content),
    }
    return { meta, content: parsed.content }
  })
}

export async function getAllArticlesAsync(): Promise<ArticleMeta[]> {
  const staticMetas = getAllArticles()
  const dbOnes = await readDbArticles()
  const seen = new Set(staticMetas.map(s => s.slug))
  return [...staticMetas, ...dbOnes.filter(d => !seen.has(d.meta.slug)).map(d => d.meta)]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function getArticleAsync(slug: string): Promise<Article | null> {
  const staticHit = getArticle(slug)
  if (staticHit) return staticHit
  const dbOnes = await readDbArticles()
  const found = dbOnes.find(d => d.meta.slug === slug)
  return found ? { ...found.meta, content: found.content } : null
}

export async function getAllCategoriesAsync(): Promise<string[]> {
  const all = await getAllArticlesAsync()
  return Array.from(new Set(all.map(a => a.category))).sort()
}
