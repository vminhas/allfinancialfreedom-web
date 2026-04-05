import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

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
