'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

// Weekly auto-generated article review queue. Each row is a
// GeneratedArticle (DRAFT / PUBLISHED / REJECTED). The cron creates
// drafts on Fridays; admin approves or rejects here. Published rows
// go live on /blog instantly (the public page uses revalidate=0).

interface ArticleRow {
  id: string
  slug: string
  title: string
  category: string
  excerpt: string
  status: 'DRAFT' | 'PUBLISHED' | 'REJECTED'
  autoPublishAt: string | null
  publishedAt: string | null
  createdAt: string
  tags: string[]
  relatedSlugs: string[]
  sourceUrls: string[]
  coverImage: string
}

const STATUS_PILL: Record<ArticleRow['status'], { bg: string; fg: string; border: string }> = {
  DRAFT:     { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B', border: 'rgba(245,158,11,0.35)' },
  PUBLISHED: { bg: 'rgba(74,222,128,0.12)', fg: '#4ADE80', border: 'rgba(74,222,128,0.35)' },
  REJECTED:  { bg: 'rgba(239,68,68,0.12)',  fg: '#EF4444', border: 'rgba(239,68,68,0.35)' },
}

export default function ArticleQueuePage() {
  const [rows, setRows] = useState<ArticleRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [filter, setFilter] = useState<'ALL' | ArticleRow['status']>('ALL')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/generated-articles')
    if (res.ok) setRows((await res.json()).articles)
    else setRows([])
  }, [])
  useEffect(() => { load() }, [load])

  const showFlash = (kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text })
    setTimeout(() => setFlash(null), 3000)
  }

  const publish = async (id: string) => {
    if (!confirm('Publish this article to /blog now?')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/generated-articles/${id}/publish`, { method: 'POST' })
      if (res.ok) { showFlash('ok', 'Published.'); await load() }
      else { showFlash('err', 'Publish failed.') }
    } finally { setBusy(null) }
  }

  const reject = async (id: string) => {
    const reason = window.prompt('Reject reason (helps tune the writer prompt). Optional.', '')
    if (reason === null) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/generated-articles/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) { showFlash('ok', 'Rejected.'); await load() }
      else { showFlash('err', 'Reject failed.') }
    } finally { setBusy(null) }
  }

  const generateNow = async () => {
    if (!confirm('Generate a draft right now (uses Opus 4.8 + web search)?')) return
    setBusy('GENERATE')
    try {
      const res = await fetch('/api/admin/generated-articles/generate-now', { method: 'POST' })
      if (res.ok) { showFlash('ok', 'Draft created.'); await load() }
      else {
        const d = await res.json().catch(() => ({}))
        showFlash('err', d.error || 'Generation failed.')
      }
    } finally { setBusy(null) }
  }

  const filtered = (rows ?? []).filter(r => filter === 'ALL' || r.status === filter)
  const counts = {
    ALL: rows?.length ?? 0,
    DRAFT: rows?.filter(r => r.status === 'DRAFT').length ?? 0,
    PUBLISHED: rows?.filter(r => r.status === 'PUBLISHED').length ?? 0,
    REJECTED: rows?.filter(r => r.status === 'REJECTED').length ?? 0,
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Article Queue</h1>
          <p style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
            Drafts written by the Friday Opus 4.8 cron. Approve to publish on <code style={{ color: '#C9A96E' }}>/blog</code>, or reject to drop and log for prompt tuning.
          </p>
        </div>
        <button
          onClick={generateNow}
          disabled={busy === 'GENERATE'}
          style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', cursor: busy === 'GENERATE' ? 'wait' : 'pointer' }}
        >
          {busy === 'GENERATE' ? 'Generating...' : '+ Generate now'}
        </button>
      </div>

      {flash && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 6, fontSize: 12,
          background: flash.kind === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${flash.kind === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: flash.kind === 'ok' ? '#86efac' : '#fca5a5',
        }}>{flash.text}</div>
      )}

      <div style={{ display: 'flex', gap: 6, margin: '20px 0 14px', flexWrap: 'wrap' }}>
        {(['ALL', 'DRAFT', 'PUBLISHED', 'REJECTED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: filter === f ? 'rgba(201,169,110,0.18)' : 'transparent',
              border: `1px solid ${filter === f ? '#C9A96E' : 'rgba(255,255,255,0.12)'}`,
              color: filter === f ? '#C9A96E' : '#9BB0C4',
              borderRadius: 4, cursor: 'pointer',
            }}
          >{f} · {counts[f]}</button>
        ))}
      </div>

      {rows === null ? (
        <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#4B5563', fontSize: 13 }}>No articles in this state yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => {
            const pill = STATUS_PILL[r.status]
            return (
              <div key={r.id} style={{ display: 'flex', gap: 14, padding: 14, background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }}>
                {r.coverImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.coverImage} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 7px', borderRadius: 3, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: pill.bg, color: pill.fg, border: `1px solid ${pill.border}` }}>
                      {r.status}
                    </span>
                    <span style={{ fontSize: 10, color: '#6B8299' }}>{r.category}</span>
                    <span style={{ fontSize: 10, color: '#4B5563' }}>· {new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.5, marginBottom: 8 }}>{r.excerpt}</div>
                  {r.status === 'DRAFT' && r.autoPublishAt && (
                    <div style={{ fontSize: 10, color: '#F59E0B', marginBottom: 6 }}>
                      Auto-publishes at {new Date(r.autoPublishAt).toLocaleString()} unless rejected.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      href={`/vault/articles/${r.id}`}
                      style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#9BB0C4', textDecoration: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 4 }}
                    >Open</Link>
                    {r.status === 'PUBLISHED' && (
                      <a
                        href={`/blog/${r.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(74,222,128,0.3)', color: '#4ADE80', textDecoration: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 4 }}
                      >View live</a>
                    )}
                    {r.status === 'DRAFT' && (
                      <>
                        <button
                          onClick={() => publish(r.id)}
                          disabled={busy === r.id}
                          style={{ padding: '5px 12px', background: '#C9A96E', color: '#142D48', border: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 4, cursor: busy === r.id ? 'wait' : 'pointer' }}
                        >Publish</button>
                        <button
                          onClick={() => reject(r.id)}
                          disabled={busy === r.id}
                          style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 4, cursor: busy === r.id ? 'wait' : 'pointer' }}
                        >Reject</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
