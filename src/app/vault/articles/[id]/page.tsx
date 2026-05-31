'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Detail view: full MDX editor + Publish / Reject / Save. The editor
// is a plain textarea on the raw MDX (the writer outputs a complete
// .mdx). The strategy-call link is inside the body, so editing the
// MDX directly is the simplest, lowest-risk surface for the admin.

interface Article {
  id: string
  slug: string
  title: string
  category: string
  excerpt: string
  coverImage: string
  tags: string[]
  mdxBody: string
  sourceUrls: string[]
  relatedSlugs: string[]
  status: 'DRAFT' | 'PUBLISHED' | 'REJECTED'
  autoPublishAt: string | null
  publishedAt: string | null
  createdAt: string
  rejectedReason: string | null
}

export default function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [article, setArticle] = useState<Article | null>(null)
  const [mdx, setMdx] = useState('')
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<'publish' | 'reject' | null>(null)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/generated-articles/${id}`)
    if (!res.ok) return
    const d = await res.json() as { article: Article }
    setArticle(d.article)
    setMdx(d.article.mdxBody)
    setTitle(d.article.title)
    setExcerpt(d.article.excerpt)
    setCoverImage(d.article.coverImage)
    setTags(d.article.tags.join(', '))
  }, [id])
  useEffect(() => { load() }, [load])

  const showFlash = (kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text })
    setTimeout(() => setFlash(null), 2500)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/generated-articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, excerpt, coverImage, mdxBody: mdx,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      if (res.ok) { showFlash('ok', 'Saved.'); await load() }
      else { showFlash('err', 'Save failed.') }
    } finally { setSaving(false) }
  }

  const publish = async () => {
    if (!confirm('Publish to /blog now?')) return
    setBusy('publish')
    try {
      // Save current edits first so the published copy reflects them.
      await fetch(`/api/admin/generated-articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, excerpt, coverImage, mdxBody: mdx,
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      const res = await fetch(`/api/admin/generated-articles/${id}/publish`, { method: 'POST' })
      if (res.ok) { showFlash('ok', 'Published.'); router.push('/vault/articles') }
      else showFlash('err', 'Publish failed.')
    } finally { setBusy(null) }
  }

  const reject = async () => {
    const reason = window.prompt('Reject reason (optional)', '')
    if (reason === null) return
    setBusy('reject')
    try {
      const res = await fetch(`/api/admin/generated-articles/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) { showFlash('ok', 'Rejected.'); router.push('/vault/articles') }
      else showFlash('err', 'Reject failed.')
    } finally { setBusy(null) }
  }

  if (!article) return <div style={{ padding: 24, color: '#6B8299' }}>Loading...</div>

  const inputStyle: React.CSSProperties = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#fff', padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9BB0C4', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Link href="/vault/articles" style={{ color: '#9BB0C4', fontSize: 12, textDecoration: 'none' }}>← Back to queue</Link>
        <span style={{ padding: '2px 7px', borderRadius: 3, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', background: 'rgba(201,169,110,0.15)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.35)' }}>
          {article.status}
        </span>
        <span style={{ fontSize: 11, color: '#6B8299' }}>· slug: /blog/{article.slug}</span>
      </div>

      {flash && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 12,
          background: flash.kind === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${flash.kind === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: flash.kind === 'ok' ? '#86efac' : '#fca5a5',
        }}>{flash.text}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Excerpt (meta description)</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={excerpt} onChange={e => setExcerpt(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Cover image URL</label>
          <input style={inputStyle} value={coverImage} onChange={e => setCoverImage(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input style={inputStyle} value={tags} onChange={e => setTags(e.target.value)} />
        </div>
      </div>

      <label style={labelStyle}>Article MDX (frontmatter + body)</label>
      <textarea
        value={mdx}
        onChange={e => setMdx(e.target.value)}
        style={{ ...inputStyle, height: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6 }}
      />

      {article.sourceUrls.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 11, color: '#9BB0C4' }}>
          <strong style={{ color: '#C9A96E' }}>Sources used:</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            {article.sourceUrls.map(u => (
              <li key={u} style={{ marginBottom: 2 }}>
                <a href={u} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>{u}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {article.relatedSlugs.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#9BB0C4' }}>
          <strong style={{ color: '#C9A96E' }}>Backlinks to:</strong> {article.relatedSlugs.map(s => `/blog/${s}`).join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.4)', color: '#C9A96E', borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Saving...' : 'Save edits'}
        </button>
        {article.status === 'DRAFT' && (
          <>
            <button onClick={publish} disabled={busy !== null} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: busy !== null ? 'wait' : 'pointer' }}>
              {busy === 'publish' ? 'Publishing...' : 'Save & publish'}
            </button>
            <button onClick={reject} disabled={busy !== null} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#F87171', borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: busy !== null ? 'wait' : 'pointer' }}>
              {busy === 'reject' ? 'Rejecting...' : 'Reject'}
            </button>
          </>
        )}
        {article.status === 'PUBLISHED' && (
          <a href={`/blog/${article.slug}`} target="_blank" rel="noopener noreferrer" style={{ background: 'transparent', border: '1px solid rgba(74,222,128,0.4)', color: '#4ADE80', textDecoration: 'none', borderRadius: 4, padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            View live
          </a>
        )}
      </div>
      {article.rejectedReason && (
        <div style={{ marginTop: 16, padding: 10, fontSize: 12, color: '#F87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4 }}>
          <strong>Rejected:</strong> {article.rejectedReason}
        </div>
      )}
    </div>
  )
}
