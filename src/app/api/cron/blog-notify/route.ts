import { NextRequest, NextResponse } from 'next/server'

// POST /api/cron/blog-notify
//
// Called by GitHub Actions after a new blog article is published.
// Posts the article to #blog-articles via the bot token so it shows as
// AFF Concierge (not a webhook). Auth: x-cron-secret header.
//
// Body: { title: string, excerpt?: string, slug: string }

const BLOG_ARTICLES_CHANNEL = '1492988923339870270'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || !process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { title?: string; excerpt?: string; slug?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, excerpt, slug } = body
  if (!title || !slug) {
    return NextResponse.json({ error: 'Missing title or slug' }, { status: 400 })
  }

  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'DISCORD_BOT_TOKEN not configured' }, { status: 500 })
  }

  const articleUrl = `https://allfinancialfreedom.com/blog/${slug}`

  const res = await fetch(`https://discord.com/api/v10/channels/${BLOG_ARTICLES_CHANNEL}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embeds: [{
        title: `New Article: ${title}`,
        description: excerpt ?? '',
        url: articleUrl,
        color: 0x1a2744,
        footer: { text: 'All Financial Freedom · Wealth · Protection · Legacy' },
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[blog-notify] Discord post failed:', err)
    return NextResponse.json({ error: err }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
