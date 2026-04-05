import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllArticles, getAllCategories } from '@/lib/blog'
import Footer from '@/components/Footer'
import CTABanner from '@/components/CTABanner'

export const metadata: Metadata = {
  title: 'Financial Insights | All Financial Freedom',
  description: 'Financial insights, industry news, wealth-building strategies, and insurance guidance from the All Financial Freedom team. Stay informed and take control of your financial future.',
  keywords: 'financial insights, wealth building tips, life insurance advice, retirement planning guide, financial literacy, money management, financial education, insurance news',
  openGraph: {
    title: 'Financial Insights | All Financial Freedom',
    description: 'Wealth-building strategies, insurance guidance, and financial education from licensed professionals at All Financial Freedom.',
    url: 'https://allfinancialfreedom.com/blog',
    siteName: 'All Financial Freedom',
    type: 'website',
  },
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

  const featured = filtered[0]
  const rest = filtered.slice(1)

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

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
      <section className="px-5 md:px-12 lg:px-20 py-14" style={{ background: '#ffffff' }}>
        <div className="max-w-6xl mx-auto">

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-blue">No articles in this category yet. Check back soon.</p>
            </div>
          ) : (
            <>
              {/* FEATURED ARTICLE */}
              {featured && (
                <Link href={`/blog/${featured.slug}`} className="group block mb-12">
                  <div className="grid md:grid-cols-2 overflow-hidden rounded-sm"
                    style={{ border: '1px solid rgba(201,169,110,0.15)', boxShadow: '0 4px 24px rgba(20,45,72,0.07)' }}>
                    {/* Image */}
                    <div className="relative overflow-hidden" style={{ minHeight: 320 }}>
                      {featured.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={featured.coverImage}
                          alt={featured.title}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          style={{ position: 'absolute', inset: 0 }}
                        />
                      ) : (
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #142D48, #2A5280)' }} />
                      )}
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, transparent 70%, rgba(255,255,255,0.03))' }} />
                    </div>
                    {/* Content */}
                    <div className="flex flex-col justify-center p-10 md:p-12" style={{ background: '#ffffff' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <span style={{ fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', fontWeight: 600 }}>
                          {featured.category}
                        </span>
                        <span style={{ color: 'rgba(107,130,153,0.35)' }}>·</span>
                        <span style={{ fontSize: '0.68rem', color: '#6B8299' }}>{featured.readTime} min read</span>
                      </div>
                      <div style={{ width: 28, height: 2, background: '#C9A96E', marginBottom: '1rem' }} />
                      <h2 className="font-serif font-light text-navy mb-4 group-hover:text-blue transition-colors"
                        style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', lineHeight: 1.2 }}>
                        {featured.title}
                      </h2>
                      <p className="text-sm leading-relaxed mb-6" style={{ color: '#4B5563' }}>{featured.excerpt}</p>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: '0.7rem', color: '#9BB0C4' }}>{formatDate(featured.date)}</span>
                        <span style={{ fontSize: '0.68rem', color: '#C9A96E', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500 }}>
                          Read Article →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              )}

              {/* ARTICLE GRID */}
              {rest.length > 0 && (
                <div className="grid md:grid-cols-3 gap-6">
                  {rest.map(article => (
                    <Link key={article.slug} href={`/blog/${article.slug}`} className="group block">
                      <div className="flex flex-col h-full overflow-hidden rounded-sm"
                        style={{ border: '1px solid rgba(201,169,110,0.12)', transition: 'box-shadow 0.2s', boxShadow: '0 2px 12px rgba(20,45,72,0.04)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 24px rgba(20,45,72,0.1)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(20,45,72,0.04)' }}>
                        {/* Cover */}
                        <div className="relative overflow-hidden" style={{ height: 188 }}>
                          {article.coverImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={article.coverImage}
                              alt={article.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"
                              style={{ background: 'linear-gradient(135deg, #142D48, #2A5280)' }}>
                              <span style={{ color: 'rgba(201,169,110,0.25)', fontSize: '2.5rem', fontFamily: 'Cormorant Garamond, serif', fontWeight: 300 }}>AFF</span>
                            </div>
                          )}
                        </div>
                        {/* Body */}
                        <div className="flex flex-col flex-1 p-6">
                          <div className="flex items-center gap-2 mb-3">
                            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', fontWeight: 600 }}>
                              {article.category}
                            </span>
                            <span style={{ color: 'rgba(107,130,153,0.3)', fontSize: '0.6rem' }}>·</span>
                            <span style={{ fontSize: '0.65rem', color: '#9BB0C4' }}>{article.readTime} min</span>
                          </div>
                          <h3 className="font-serif text-navy mb-2 leading-snug group-hover:text-blue transition-colors"
                            style={{ fontSize: '1.08rem', lineHeight: 1.3 }}>
                            {article.title}
                          </h3>
                          <p className="text-xs leading-relaxed flex-1 mb-4"
                            style={{ color: '#6B8299', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {article.excerpt}
                          </p>
                          <div className="flex items-center justify-between pt-3"
                            style={{ borderTop: '1px solid rgba(201,169,110,0.1)' }}>
                            <span style={{ fontSize: '0.65rem', color: '#9BB0C4' }}>{formatDate(article.date)}</span>
                            <span style={{ fontSize: '0.62rem', color: '#C9A96E', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>
                              Read →
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <CTABanner heading="Ready to put this knowledge to work?" buttonText="Book a Free Call" />
      <Footer />
    </main>
  )
}
