import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllArticles, getAllCategories } from '@/lib/blog'
import Footer from '@/components/Footer'
import CTABanner from '@/components/CTABanner'

export const metadata: Metadata = {
  title: 'Insights | All Financial Freedom',
  description: 'Financial insights, industry news, and wealth-building strategies from the All Financial Freedom team.',
}

export default function BlogPage({
  searchParams,
}: {
  searchParams: { category?: string }
}) {
  const allArticles = getAllArticles()
  const categories = getAllCategories()
  const activeCategory = searchParams.category ?? 'All'

  const filtered = activeCategory === 'All'
    ? allArticles
    : allArticles.filter(a => a.category === activeCategory)

  return (
    <main className="pt-20">

      {/* HERO */}
      <section className="page-section bg-navy-grad">
        <div className="max-w-2xl">
          <span className="section-label">Financial Insights</span>
          <h1 className="section-title-light mb-5">
            Industry intelligence.<br /><em>Real strategies. Real results.</em>
          </h1>
          <p className="rich-text-light">
            Wealth-building guides, insurance intelligence, and financial strategies from our team, published regularly to keep you ahead of the market.
          </p>
        </div>
      </section>

      {/* FILTERS */}
      <div style={{ background: '#F5F9FF', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>
        <div className="flex gap-2 flex-wrap px-5 md:px-12 lg:px-20 py-4">
          {['All', ...categories].map(cat => (
            <Link
              key={cat}
              href={cat === 'All' ? '/blog' : `/blog?category=${encodeURIComponent(cat)}`}
              style={{
                fontSize: '0.68rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontWeight: 500,
                padding: '0.4rem 1rem',
                borderRadius: 2,
                border: activeCategory === cat ? '1px solid #C9A96E' : '1px solid rgba(27,58,92,0.12)',
                background: activeCategory === cat ? 'rgba(201,169,110,0.1)' : 'transparent',
                color: activeCategory === cat ? '#C9A96E' : '#1B3A5C',
                transition: 'all 0.2s',
              }}
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>

      {/* ARTICLES */}
      <section className="page-section bg-white-section">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-blue">No articles published yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {filtered.map(article => (
              <Link key={article.slug} href={`/blog/${article.slug}`} className="group block">
                <div className="card h-full flex flex-col">
                  {/* Cover image placeholder */}
                  {article.coverImage ? (
                    <div className="relative overflow-hidden" style={{ height: 200 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={article.coverImage}
                        alt={article.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div style={{
                      height: 200,
                      background: 'linear-gradient(135deg, #142D48, #2A5280)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ color: 'rgba(201,169,110,0.3)', fontSize: '3rem', fontFamily: 'Cormorant Garamond, serif', fontWeight: 300 }}>
                        AFF
                      </span>
                    </div>
                  )}
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span style={{
                        fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase',
                        color: '#C9A96E', fontWeight: 500
                      }}>
                        {article.category}
                      </span>
                      <span style={{ color: 'rgba(107,130,153,0.4)', fontSize: '0.7rem' }}>·</span>
                      <span style={{ fontSize: '0.7rem', color: '#6B8299' }}>{article.readTime} min read</span>
                    </div>
                    <h2 className="font-serif text-xl text-navy mb-2 leading-snug group-hover:text-blue transition-colors">
                      {article.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-blue mb-4 flex-1">{article.excerpt}</p>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: '0.7rem', color: '#6B8299' }}>
                        {new Date(article.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#C9A96E', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Read →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <CTABanner heading="Ready to put this knowledge to work?" buttonText="Book a Free Call" />
      <Footer />
    </main>
  )
}
