'use client'

import { useState, useEffect, useCallback } from 'react'

type Status = 'DRAFT' | 'PUBLISHED' | 'REJECTED'

interface ArticleRow {
  id: string
  title: string
  body: string
  status: Status
  generatedAt: string
  publishedAt: string | null
  reviewedAt: string | null
  agentProfile: {
    id: string
    firstName: string
    lastName: string
    agentCode: string
    avatarUrl: string | null
    isTest: boolean
  }
  milestone: {
    id: string
    title: string
    pointThreshold: number
    accentColor: string | null
  } | null
}

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: 'Awaiting review',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
}

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: '#f59e0b',
  PUBLISHED: '#4ade80',
  REJECTED: '#f87171',
}

export default function ClimbArticlesPage() {
  const [filter, setFilter] = useState<Status>('DRAFT')
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, { title: string; body: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/climb/articles?status=${filter}`)
    if (res.ok) {
      const d = await res.json() as { articles: ArticleRow[] }
      setArticles(d.articles)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const patchField = (id: string, field: 'title' | 'body', value: string) => {
    setEditing(prev => ({
      ...prev,
      [id]: {
        title: prev[id]?.title ?? articles.find(a => a.id === id)?.title ?? '',
        body: prev[id]?.body ?? articles.find(a => a.id === id)?.body ?? '',
        [field]: value,
      },
    }))
  }

  const save = async (id: string, status?: Status) => {
    setSaving(id)
    setError('')
    const e = editing[id]
    const body: Record<string, unknown> = {}
    if (e) {
      body.title = e.title
      body.body = e.body
    }
    if (status) body.status = status
    const res = await fetch(`/api/admin/climb/articles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Save failed')
    } else {
      setEditing(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      load()
    }
    setSaving(null)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0C1E30', border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 4, color: '#d1d9e2', padding: '10px 14px',
    fontSize: 13, fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    color: '#C9A96E', marginBottom: 6,
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28, padding: '20px 0 18px', borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          The Climb
        </div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 300, color: '#fff', margin: '0 0 4px' }}>
          Article Review Queue
        </h1>
        <p style={{ fontSize: 12, color: '#6B8299', margin: 0, maxWidth: 760, lineHeight: 1.55 }}>
          AI-generated personalized articles land here as drafts. Edit the title and body in place, then publish so the agent sees it on their Climb tab. Rejected drafts stay archived for reference.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['DRAFT', 'PUBLISHED', 'REJECTED'] as Status[]).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              background: filter === s ? STATUS_COLOR[s] + '22' : 'transparent',
              color: filter === s ? STATUS_COLOR[s] : '#9BB0C4',
              border: `1px solid ${filter === s ? STATUS_COLOR[s] + '55' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 4, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>}

      {!loading && articles.length === 0 && (
        <div style={{ padding: '48px 16px', textAlign: 'center', color: '#6B8299', fontSize: 13, border: '1px dashed rgba(201,169,110,0.2)', borderRadius: 6 }}>
          No {STATUS_LABEL[filter].toLowerCase()} articles.
        </div>
      )}

      {!loading && articles.map(a => {
        const e = editing[a.id]
        const title = e?.title ?? a.title
        const body = e?.body ?? a.body
        const dirty = !!e && (e.title !== a.title || e.body !== a.body)
        return (
          <div key={a.id} style={{
            marginBottom: 18, padding: 20, borderRadius: 6,
            background: '#0C1E30', border: `1px solid ${a.status === 'DRAFT' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 4 }}>
                  <strong style={{ color: '#fff' }}>{a.agentProfile.firstName} {a.agentProfile.lastName}</strong>
                  {' · '}{a.agentProfile.agentCode}
                  {a.agentProfile.isTest && (
                    <span style={{ marginLeft: 8, fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>TEST</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6B8299' }}>
                  {a.milestone ? `${a.milestone.title} · ${a.milestone.pointThreshold.toLocaleString()} pts` : 'Ad-hoc article'}
                  {' · generated '}{new Date(a.generatedAt).toLocaleDateString()}
                </div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '4px 10px', borderRadius: 999,
                background: STATUS_COLOR[a.status] + '22',
                color: STATUS_COLOR[a.status],
                border: `1px solid ${STATUS_COLOR[a.status]}55`,
                textTransform: 'uppercase',
              }}>
                {a.status}
              </span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Title</label>
              <input style={inputStyle} value={title} onChange={ev => patchField(a.id, 'title', ev.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Body</label>
              <textarea
                style={{ ...inputStyle, minHeight: 220, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }}
                value={body}
                onChange={ev => patchField(a.id, 'body', ev.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {dirty && (
                <button
                  style={{
                    background: '#C9A96E', color: '#142D48', border: 'none',
                    borderRadius: 4, padding: '8px 14px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: saving === a.id ? 'wait' : 'pointer',
                  }}
                  disabled={saving === a.id}
                  onClick={() => save(a.id)}
                >
                  {saving === a.id ? 'Saving...' : 'Save edits'}
                </button>
              )}
              {a.status !== 'PUBLISHED' && (
                <button
                  style={{
                    background: 'rgba(74,222,128,0.12)', color: '#4ade80',
                    border: '1px solid rgba(74,222,128,0.4)', borderRadius: 4,
                    padding: '8px 14px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: saving === a.id ? 'wait' : 'pointer',
                  }}
                  disabled={saving === a.id}
                  onClick={() => save(a.id, 'PUBLISHED')}
                >
                  Publish
                </button>
              )}
              {a.status !== 'REJECTED' && (
                <button
                  style={{
                    background: 'transparent', color: '#f87171',
                    border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4,
                    padding: '8px 14px', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: saving === a.id ? 'wait' : 'pointer',
                  }}
                  disabled={saving === a.id}
                  onClick={() => save(a.id, 'REJECTED')}
                >
                  Reject
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
