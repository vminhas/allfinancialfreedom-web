import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getArticle, getAllArticles } from '@/lib/blog'
import Footer from '@/components/Footer'
import BookingCTA from '@/components/BookingCTA'

export async function generateStaticParams() {
  return getAllArticles().map(a => ({ slug: a.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const article = getArticle(params.slug)
  if (!article) return {}
  return {
    title: `${article.title} | All Financial Freedom Insights`,
    description: article.excerpt,
  }
}

/* ── Inline markdown parser (bold, italic, links) ─────────── */
function parseInline(text: string): React.ReactNode {
  // Handle **bold**, *italic*, `code`, [link](url)
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<strong key={m.index} style={{ color: '#1A2B3C', fontWeight: 600 }}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={m.index} style={{ fontStyle: 'italic', color: '#1B3A5C' }}>{m[3]}</em>)
    else if (m[4]) parts.push(<code key={m.index} style={{ background: '#EBF4FF', padding: '1px 5px', borderRadius: 3, fontSize: '0.88em', color: '#1B3A5C' }}>{m[4]}</code>)
    else if (m[5] && m[6]) parts.push(<a key={m.index} href={m[6]} style={{ color: '#3B7EC8', textDecoration: 'underline' }}>{m[5]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

/* ── Block markdown renderer ────────────────────────────────── */
function renderMarkdown(content: string): React.ReactNode[] {
  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`ul-${i}`} style={{ margin: '0.75rem 0 1.25rem 0', padding: 0 }}>
          {listItems.map((item, j) => (
            <li key={j} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
              <span style={{ color: '#C9A96E', flexShrink: 0, marginTop: '0.2rem', fontSize: '0.75rem' }}>◆</span>
              <span style={{ color: '#4B5563', lineHeight: 1.75 }}>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  // Handle table blocks
  const isTableRow = (line: string) => line.trim().startsWith('|') && line.trim().endsWith('|')
  const isSeparator = (line: string) => /^\|[\s\-|]+\|$/.test(line.trim())

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Heading 1
    if (trimmed.startsWith('# ')) {
      flushList()
      nodes.push(<h1 key={i} className="font-serif font-light text-navy" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', lineHeight: 1.2, margin: '2.5rem 0 1rem' }}>{parseInline(trimmed.slice(2))}</h1>)
    }
    // Heading 2
    else if (trimmed.startsWith('## ')) {
      flushList()
      nodes.push(
        <div key={i} style={{ marginTop: '2.5rem', marginBottom: '0.75rem' }}>
          <span style={{ display: 'block', width: 32, height: 2, background: '#C9A96E', marginBottom: '0.6rem' }} />
          <h2 className="font-serif font-light text-navy" style={{ fontSize: 'clamp(1.35rem, 2.5vw, 1.85rem)', lineHeight: 1.25 }}>{parseInline(trimmed.slice(3))}</h2>
        </div>
      )
    }
    // Heading 3
    else if (trimmed.startsWith('### ')) {
      flushList()
      nodes.push(<h3 key={i} className="font-serif text-navy" style={{ fontSize: '1.25rem', lineHeight: 1.3, margin: '2rem 0 0.5rem' }}>{parseInline(trimmed.slice(4))}</h3>)
    }
    // Blockquote
    else if (trimmed.startsWith('> ')) {
      flushList()
      nodes.push(
        <blockquote key={i} style={{
          borderLeft: '3px solid #C9A96E',
          paddingLeft: '1.25rem',
          margin: '1.5rem 0',
          color: '#4B5563',
          fontStyle: 'italic',
          fontSize: '0.98rem',
          lineHeight: 1.8,
        }}>
          {parseInline(trimmed.slice(2))}
        </blockquote>
      )
    }
    // Bullet list item
    else if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2))
    }
    // Numbered list item
    else if (/^\d+\.\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+\.\s/, ''))
    }
    // Horizontal rule
    else if (trimmed === '---' || trimmed === '***') {
      flushList()
      nodes.push(<div key={i} style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,169,110,0.35), transparent)', margin: '2rem 0' }} />)
    }
    // Table
    else if (isTableRow(trimmed)) {
      flushList()
      const tableLines: string[] = []
      while (i < lines.length && isTableRow(lines[i].trim())) {
        tableLines.push(lines[i])
        i++
      }
      i-- // back up one since loop will increment

      const rows = tableLines.filter(l => !isSeparator(l))
      const headers = rows[0]?.split('|').filter(c => c.trim()).map(c => c.trim()) ?? []
      const body = rows.slice(1)

      nodes.push(
        <div key={i} style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#142D48' }}>
                {headers.map((h, j) => (
                  <th key={j} style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#C9A96E', fontWeight: 500, letterSpacing: '0.05em', fontSize: '0.72rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{parseInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, j) => {
                const cells = row.split('|').filter(c => c.trim()).map(c => c.trim())
                return (
                  <tr key={j} style={{ borderBottom: '1px solid rgba(201,169,110,0.1)', background: j % 2 === 0 ? 'white' : '#F5F9FF' }}>
                    {cells.map((cell, k) => (
                      <td key={k} style={{ padding: '0.6rem 1rem', color: '#4B5563', lineHeight: 1.6 }}>{parseInline(cell)}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }
    // Empty line
    else if (trimmed === '') {
      flushList()
      // Don't add node, paragraph spacing handled by margins
    }
    // Regular paragraph
    else {
      flushList()
      nodes.push(<p key={i} style={{ color: '#4B5563', lineHeight: 1.85, marginBottom: '1.1rem', fontSize: '1.02rem' }}>{parseInline(trimmed)}</p>)
    }

    i++
  }

  flushList()
  return nodes
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug)
  if (!article) notFound()

  const formattedDate = new Date(article.date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <main className="pt-20">
      {/* ARTICLE HERO */}
      <section className="px-5 md:px-12 lg:px-20 pt-16 pb-12"
        style={{ background: 'linear-gradient(135deg, #142D48, #1B3A5C)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <Link href="/blog" style={{
              fontSize: '0.68rem', letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'rgba(201,169,110,0.7)', fontWeight: 500
            }}>
              ← Insights
            </Link>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
            <span style={{
              fontSize: '0.68rem', letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#C9A96E', fontWeight: 500
            }}>
              {article.category}
            </span>
          </div>
          <h1 className="font-serif font-light text-white mb-5"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', lineHeight: 1.15 }}>
            {article.title}
          </h1>
          <p style={{ color: 'rgba(235,244,255,0.65)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '2rem', maxWidth: '600px' }}>
            {article.excerpt}
          </p>
          <div className="flex items-center gap-4">
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'linear-gradient(135deg, #2A5280, #3B7EC8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '0.75rem', fontWeight: 500,
            }}>
              {article.author.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div style={{ color: 'rgba(235,244,255,0.85)', fontSize: '0.85rem', fontWeight: 500 }}>{article.author}</div>
              <div style={{ color: 'rgba(235,244,255,0.45)', fontSize: '0.72rem' }}>{formattedDate} · {article.readTime} min read</div>
            </div>
          </div>
        </div>
      </section>

      {/* ARTICLE BODY */}
      <section className="px-5 md:px-12 lg:px-20 py-14" style={{ background: '#ffffff' }}>
        <div className="max-w-3xl mx-auto">
          {renderMarkdown(article.content)}

          {/* Tags */}
          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-10 pt-6" style={{ borderTop: '1px solid rgba(201,169,110,0.15)' }}>
              {article.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: '#6B8299', padding: '4px 10px', border: '1px solid rgba(107,130,153,0.25)', borderRadius: 2
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <BookingCTA />

          {/* Author byline */}
          <div className="mt-8 flex items-center gap-3" style={{ borderTop: '1px solid rgba(201,169,110,0.12)', paddingTop: '1.5rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #1B3A5C, #2A5280)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#C9A96E', fontSize: '0.8rem', fontFamily: 'Cormorant Garamond, serif',
            }}>
              AFF
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#1B3A5C' }}>An All Financial Freedom Insight</div>
              <div style={{ fontSize: '0.7rem', color: '#6B8299', marginTop: 2 }}>
                {formattedDate} · {article.readTime} min read · {article.category}
              </div>
            </div>
          </div>

          {/* Back link */}
          <div className="mt-6">
            <Link href="/blog" style={{
              fontSize: '0.72rem', letterSpacing: '0.15em', textTransform: 'uppercase',
              color: '#C9A96E', fontWeight: 500
            }}>
              ← Back to Insights
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
