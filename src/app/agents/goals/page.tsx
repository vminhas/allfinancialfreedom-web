'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ImagePlus, X, RefreshCw } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'

interface GoalsData {
  dreamsAndGoals: { timeFrame: string; dream: string; why: string }[]
  fears: string[]
  strengths: string[]
  weaknesses: string[]
}

const defaultGoals: GoalsData = {
  dreamsAndGoals: [],
  fears: ['', '', ''],
  strengths: ['', '', ''],
  weaknesses: ['', '', ''],
}

export default function GoalsPage() {
  return <Suspense><GoalsPageInner /></Suspense>
}

function GoalsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const previewToken = searchParams.get('preview')
  const adminAgentId = searchParams.get('agentProfileId')
  const qs = previewToken
    ? `?preview=${encodeURIComponent(previewToken)}`
    : adminAgentId ? `?agentProfileId=${encodeURIComponent(adminAgentId)}` : ''
  const isMobile = useIsMobile()

  const [data, setData] = useState<GoalsData>(defaultGoals)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const [visionBoardUrl, setVisionBoardUrl] = useState<string | null>(null)
  const [uploadingVision, setUploadingVision] = useState(false)
  const [visionLightbox, setVisionLightbox] = useState(false)
  const visionInputRef = useRef<HTMLInputElement>(null)

  const [whyStatements, setWhyStatements] = useState<{ id: string; content: string; createdAt: string }[]>([])
  const [whyDraft, setWhyDraft] = useState('')
  const [whyEditing, setWhyEditing] = useState(false)
  const [whySaving, setWhySaving] = useState(false)
  const [whySaved, setWhySaved] = useState(false)
  const [whyShowHistory, setWhyShowHistory] = useState(false)

  const [goalSnapshots, setGoalSnapshots] = useState<{ id: string; goals: GoalsData['dreamsAndGoals']; createdAt: string }[]>([])
  const [goalsDirty, setGoalsDirty] = useState(false)
  const [goalsSaving, setGoalsSaving] = useState(false)
  const [goalsSaved, setGoalsSaved] = useState(false)
  const [goalsShowHistory, setGoalsShowHistory] = useState(false)

  useEffect(() => {
    fetch(`/api/agents/why-statements${qs}`).then(r => r.ok ? r.json() : null)
      .then((d: { statements?: { id: string; content: string; createdAt: string }[] } | null) => {
        if (d?.statements) setWhyStatements(d.statements)
      })
    fetch(`/api/agents/goal-snapshots${qs}`).then(r => r.ok ? r.json() : null)
      .then((d: { snapshots?: { id: string; goals: GoalsData['dreamsAndGoals']; createdAt: string }[] } | null) => {
        if (d?.snapshots) setGoalSnapshots(d.snapshots)
      })
    fetch(`/api/agents/pfr${qs}`).then(r => {
      if (r.status === 401 && !previewToken && !adminAgentId) { router.push('/agents/login'); return null }
      return r.json()
    }).then((d: { pfr?: GoalsData & { visionBoardUrl?: string | null } } | null) => {
      if (d?.pfr) {
        const { visionBoardUrl: vbUrl, ...rest } = d.pfr
        const fears = Array.isArray(rest.fears) ? rest.fears as string[] : ['', '', '']
        const strengths = Array.isArray(rest.strengths) ? rest.strengths as string[] : ['', '', '']
        const weaknesses = Array.isArray(rest.weaknesses) ? rest.weaknesses as string[] : ['', '', '']
        setData({
          dreamsAndGoals: Array.isArray(rest.dreamsAndGoals) ? rest.dreamsAndGoals as GoalsData['dreamsAndGoals'] : [],
          fears: fears.length >= 3 ? fears : [...fears, ...Array(3 - fears.length).fill('')],
          strengths: strengths.length >= 3 ? strengths : [...strengths, ...Array(3 - strengths.length).fill('')],
          weaknesses: weaknesses.length >= 3 ? weaknesses : [...weaknesses, ...Array(3 - weaknesses.length).fill('')],
        })
        if (vbUrl) setVisionBoardUrl(vbUrl)
      }
      setLoading(false)
    })
  }, [router, qs, previewToken, adminAgentId])

  const saveAssessment = useCallback(async (updated: GoalsData) => {
    setSaving(true)
    await fetch(`/api/agents/pfr${qs}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fears: updated.fears,
        strengths: updated.strengths,
        weaknesses: updated.weaknesses,
      }),
    })
    setSaving(false)
    setLastSaved(new Date())
  }, [qs])

  const saveGoals = async () => {
    if (goalsSaving) return
    setGoalsSaving(true)
    try {
      const res = await fetch(`/api/agents/goal-snapshots${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: data.dreamsAndGoals }),
      })
      if (res.ok) {
        const d = await res.json() as { snapshot: { id: string; goals: GoalsData['dreamsAndGoals']; createdAt: string } }
        setGoalSnapshots(prev => [d.snapshot, ...prev])
        setGoalsDirty(false)
        setGoalsSaved(true)
        setTimeout(() => setGoalsSaved(false), 3000)
      }
    } finally {
      setGoalsSaving(false)
    }
  }

  const updateAssessment = <K extends 'fears' | 'strengths' | 'weaknesses'>(key: K, value: GoalsData[K]) => {
    const updated = { ...data, [key]: value }; setData(updated); saveAssessment(updated)
  }

  const handleVisionUpload = async (file: File) => {
    setUploadingVision(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`/api/agents/vision-board${qs}`, { method: 'POST', body: fd })
      const json = await res.json() as { ok?: boolean; visionBoardUrl?: string; error?: string }
      if (json.ok && json.visionBoardUrl) setVisionBoardUrl(json.visionBoardUrl)
    } finally {
      setUploadingVision(false)
      if (visionInputRef.current) visionInputRef.current.value = ''
    }
  }

  const handleVisionRemove = async () => {
    if (!confirm('Remove your vision board?')) return
    setUploadingVision(true)
    try {
      await fetch(`/api/agents/vision-board${qs}`, { method: 'DELETE' })
      setVisionBoardUrl(null)
    } finally {
      setUploadingVision(false)
    }
  }

  const handleWhySave = async () => {
    const trimmed = whyDraft.trim()
    if (!trimmed || whySaving) return
    setWhySaving(true)
    try {
      const res = await fetch(`/api/agents/why-statements${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })
      if (res.ok) {
        const d = await res.json() as { statement: { id: string; content: string; createdAt: string } }
        setWhyStatements(prev => [d.statement, ...prev])
        setWhyEditing(false)
        setWhySaved(true)
        setTimeout(() => setWhySaved(false), 3000)
      }
    } finally {
      setWhySaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
      </div>
    )
  }

  const card: React.CSSProperties = {
    background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8,
    padding: isMobile ? '16px 16px' : '20px 24px',
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
    color: '#C9A96E', marginBottom: 8,
  }
  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)',
    borderRadius: 4, color: '#ffffff', outline: 'none', textAlign: 'left',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#ffffff', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{
        padding: isMobile ? `calc(16px + env(safe-area-inset-top)) 16px 16px` : `calc(20px + env(safe-area-inset-top)) 32px 20px`,
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <button
            onClick={() => router.back()}
            style={{
              background: 'none', border: 'none', color: '#C9A96E',
              fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 4,
            }}
          >
            ← Back to Portal
          </button>
          <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, margin: 0, letterSpacing: '0.03em' }}>Goal Setting</h1>
          <p style={{ fontSize: 11, color: '#6B8299', margin: '4px 0 0' }}>Define your vision, understand your strengths, and set meaningful goals. Auto-saves as you type.</p>
        </div>
        <div style={{ fontSize: 10, color: saving ? '#f59e0b' : '#4ade80' }}>
          {saving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ''}
        </div>
      </div>

      <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Vision Board */}
        <div style={card}>
          <div style={lbl}>Vision Board</div>
          <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 12, lineHeight: 1.5 }}>
            Upload an image of your vision board to keep your goals front and center.
          </div>
          <input
            ref={visionInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleVisionUpload(f) }}
          />
          {visionBoardUrl ? (
            <div style={{ position: 'relative' }}>
              <div
                onClick={() => setVisionLightbox(true)}
                style={{ cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(201,169,110,0.15)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={visionBoardUrl} alt="My Vision Board" style={{ width: '100%', maxHeight: 300, objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => visionInputRef.current?.click()} disabled={uploadingVision}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 4, padding: '4px 10px', fontSize: 10, color: '#9BB0C4', cursor: 'pointer' }}>
                  <RefreshCw size={11} /> Replace
                </button>
                <button onClick={handleVisionRemove} disabled={uploadingVision}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid rgba(255,100,100,0.3)', borderRadius: 4, padding: '4px 10px', fontSize: 10, color: '#f87171', cursor: 'pointer' }}>
                  <X size={11} /> Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => !uploadingVision && visionInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(201,169,110,0.3)', borderRadius: 8,
                padding: isMobile ? '24px 16px' : '32px 24px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                cursor: uploadingVision ? 'wait' : 'pointer', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(201,169,110,0.6)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(201,169,110,0.3)')}
            >
              {uploadingVision ? (
                <div style={{ fontSize: 12, color: '#C9A96E' }}>Uploading...</div>
              ) : (
                <>
                  <ImagePlus size={28} color="#C9A96E" strokeWidth={1.5} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#C9A96E' }}>Upload Your Vision Board</div>
                  <div style={{ fontSize: 11, color: '#6B8299', textAlign: 'center' }}>
                    Add an image of your vision board to keep your goals front and center
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Lightbox */}
        {visionLightbox && visionBoardUrl && (
          <div onClick={() => setVisionLightbox(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 24 }}>
            <button onClick={() => setVisionLightbox(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} color="#ffffff" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visionBoardUrl} alt="Vision Board" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          </div>
        )}

        {/* Your Why */}
        <div style={card}>
          <div style={lbl}>Your &ldquo;Why&rdquo;</div>
          <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.6, marginBottom: 10 }}>
            Understanding your &ldquo;why&rdquo; in business is important because it keeps you focused and motivated during challenges and difficult times. A strong purpose helps you make smarter long-term decisions, build loyal client relationships, and stay committed enough to continue growing instead of giving up when problems arise.
          </div>

          {whyStatements.length > 0 && !whyEditing && (
            <div style={{ background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#ffffff', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{whyStatements[0].content}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 10, color: '#4B5563' }}>
                    {new Date(whyStatements[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  {whySaved && <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>Saved</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setWhyDraft(whyStatements[0].content); setWhyEditing(true) }}
                    style={{ background: 'none', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 4, padding: '3px 10px', fontSize: 10, color: '#C9A96E', cursor: 'pointer' }}>Edit</button>
                  <button onClick={async () => {
                    if (!confirm('Remove your Why statement?')) return
                    await fetch(`/api/agents/why-statements?id=${whyStatements[0].id}${qs ? '&' + qs.slice(1) : ''}`, { method: 'DELETE' })
                    setWhyStatements([]); setWhyDraft('')
                  }} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, padding: '3px 10px', fontSize: 10, color: '#f87171', cursor: 'pointer' }}>Remove</button>
                </div>
              </div>
            </div>
          )}

          {(whyEditing || whyStatements.length === 0) && (
            <div>
              <textarea value={whyDraft} onChange={e => setWhyDraft(e.target.value)}
                placeholder="What drives you? Why did you choose this path?"
                style={{ ...inp, textAlign: 'left', minHeight: 80, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                {whyStatements.length > 0 && (
                  <button onClick={() => { setWhyEditing(false); setWhyDraft('') }}
                    style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '5px 14px', fontSize: 11, color: '#6B8299', cursor: 'pointer' }}>Cancel</button>
                )}
                <button onClick={handleWhySave} disabled={whySaving || !whyDraft.trim()}
                  style={{ background: whyDraft.trim() ? '#C9A96E' : '#4B5563', color: '#142D48', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 11, fontWeight: 700, cursor: whyDraft.trim() ? 'pointer' : 'default', opacity: whySaving ? 0.6 : 1 }}>
                  {whySaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {whyStatements.length > 1 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setWhyShowHistory(!whyShowHistory)}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 10, color: '#6B8299', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {whyShowHistory ? 'Hide History' : `View History (${whyStatements.length - 1} previous)`}
              </button>
              {whyShowHistory && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {whyStatements.slice(1).map(s => (
                    <div key={s.id} style={{ padding: '10px 14px', borderRadius: 4, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderLeft: '3px solid rgba(201,169,110,0.2)' }}>
                      <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{s.content}</div>
                      <div style={{ fontSize: 10, color: '#4B5563', marginTop: 6 }}>
                        {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fears, Strengths, Weaknesses */}
        <div style={card}>
          <div style={lbl}>Self-Assessment</div>
          <div style={{ fontSize: 12, color: '#6B8299', lineHeight: 1.6, marginBottom: 20 }}>
            Knowing your fears, strengths, and weaknesses helps you grow faster. Be honest with yourself.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <AssessmentSection
              label="3 Fears"
              description="What holds you back or scares you about this journey?"
              color="#f87171"
              values={data.fears}
              placeholder="Describe a fear..."
              onChange={vals => updateAssessment('fears', vals)}
            />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} />
            <AssessmentSection
              label="3 Strengths"
              description="What skills and qualities will help you succeed?"
              color="#4ade80"
              values={data.strengths}
              placeholder="Describe a strength..."
              onChange={vals => updateAssessment('strengths', vals)}
            />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} />
            <AssessmentSection
              label="3 Weaknesses"
              description="Where do you need the most growth and development?"
              color="#f59e0b"
              values={data.weaknesses}
              placeholder="Describe a weakness..."
              onChange={vals => updateAssessment('weaknesses', vals)}
            />
          </div>
        </div>

        {/* Dreams & Goals */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={lbl}>Dreams & Goals</div>
              <div style={{ fontSize: 11, color: '#6B8299' }}>What financial goals do you want to accomplish?</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {goalsSaved && <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, alignSelf: 'center' }}>Saved</span>}
              <button
                onClick={() => {
                  setData(prev => ({ ...prev, dreamsAndGoals: [...prev.dreamsAndGoals, { timeFrame: '', dream: '', why: '' }] }))
                  setGoalsDirty(true)
                }}
                style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#C9A96E', cursor: 'pointer' }}
              >+ Add Goal</button>
              <button
                onClick={saveGoals}
                disabled={goalsSaving || !goalsDirty}
                style={{
                  background: goalsDirty ? '#C9A96E' : '#4B5563',
                  color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px',
                  fontSize: 11, fontWeight: 700,
                  cursor: goalsDirty ? 'pointer' : 'default',
                  opacity: goalsSaving ? 0.6 : 1,
                }}
              >
                {goalsSaving ? 'Saving...' : 'Save Goals'}
              </button>
            </div>
          </div>

          {data.dreamsAndGoals.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
              No goals yet. Click &quot;+ Add Goal&quot; to start building your vision.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.dreamsAndGoals.map((goal, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '1fr 32px' : '100px 1fr 1fr 32px', gap: 8, alignItems: 'center',
                  padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <select
                    value={goal.timeFrame}
                    onChange={e => { const g = [...data.dreamsAndGoals]; g[i] = { ...g[i], timeFrame: e.target.value }; setData(prev => ({ ...prev, dreamsAndGoals: g })); setGoalsDirty(true) }}
                    style={{ ...inp, textAlign: 'left', padding: '8px 10px', fontSize: 12, cursor: 'pointer' }}
                  >
                    <option value="">When?</option>
                    <option value="6 months">6 months</option>
                    <option value="1 year">1 year</option>
                    <option value="2 years">2 years</option>
                    <option value="5 years">5 years</option>
                    <option value="10 years">10 years</option>
                    <option value="20+ years">20+ years</option>
                  </select>
                  {isMobile && (
                    <button onClick={() => { setData(prev => ({ ...prev, dreamsAndGoals: prev.dreamsAndGoals.filter((_, j) => j !== i) })); setGoalsDirty(true) }}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 14, cursor: 'pointer', padding: 0, gridRow: '1 / 3' }} title="Remove">x</button>
                  )}
                  <input value={goal.dream} onChange={e => { const g = [...data.dreamsAndGoals]; g[i] = { ...g[i], dream: e.target.value }; setData(prev => ({ ...prev, dreamsAndGoals: g })); setGoalsDirty(true) }}
                    placeholder="Your dream or goal..." style={{ ...inp, textAlign: 'left', padding: '8px 10px', fontSize: 13, gridColumn: isMobile ? '1 / -1' : undefined }} />
                  <input value={goal.why} onChange={e => { const g = [...data.dreamsAndGoals]; g[i] = { ...g[i], why: e.target.value }; setData(prev => ({ ...prev, dreamsAndGoals: g })); setGoalsDirty(true) }}
                    placeholder="Why does this matter to you?" style={{ ...inp, textAlign: 'left', padding: '8px 10px', fontSize: 13, gridColumn: isMobile ? '1 / -1' : undefined }} />
                  {!isMobile && (
                    <button onClick={() => { setData(prev => ({ ...prev, dreamsAndGoals: prev.dreamsAndGoals.filter((_, j) => j !== i) })); setGoalsDirty(true) }}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 14, cursor: 'pointer', padding: 0 }} title="Remove">x</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {goalSnapshots.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <button onClick={() => setGoalsShowHistory(!goalsShowHistory)}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 10, color: '#6B8299', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {goalsShowHistory ? 'Hide History' : `View History (${goalSnapshots.length} saved version${goalSnapshots.length === 1 ? '' : 's'})`}
              </button>
              {goalsShowHistory && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {goalSnapshots.map(snap => {
                    const goals = snap.goals as GoalsData['dreamsAndGoals']
                    return (
                      <div key={snap.id} style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderLeft: '3px solid rgba(201,169,110,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: '#4B5563' }}>
                            {new Date(snap.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(snap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <button
                            onClick={() => { setData(prev => ({ ...prev, dreamsAndGoals: goals })); setGoalsDirty(true) }}
                            style={{ background: 'none', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 4, padding: '2px 8px', fontSize: 9, color: '#C9A96E', cursor: 'pointer' }}
                          >Restore</button>
                        </div>
                        {goals.map((g, gi) => (
                          <div key={gi} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#9BB0C4', marginBottom: 2 }}>
                            {g.timeFrame && <span style={{ color: '#C9A96E', fontWeight: 600, flexShrink: 0 }}>{g.timeFrame}</span>}
                            <span>{g.dream}</span>
                            {g.why && <span style={{ color: '#4B5563' }}>({g.why})</span>}
                          </div>
                        ))}
                        {goals.length === 0 && <div style={{ fontSize: 11, color: '#4B5563', fontStyle: 'italic' }}>No goals in this version</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AssessmentSection({ label, description, color, values, placeholder, onChange }: {
  label: string; description: string; color: string; values: string[]; placeholder: string
  onChange: (vals: string[]) => void
}) {
  const update = (idx: number, val: string) => {
    const next = [...values]
    next[idx] = val
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 4, height: 16, borderRadius: 2, background: color, flexShrink: 0 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5, marginBottom: 12, paddingLeft: 12 }}>
        {description}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 4,
              background: `${color}15`, border: `1px solid ${color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color,
            }}>
              {i + 1}
            </div>
            <textarea
              value={values[i] || ''}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              rows={2}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${color}20`, borderRadius: 6,
                color: '#ffffff', fontSize: 13, padding: '10px 14px',
                outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.6, minHeight: 52,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = `${color}50` }}
              onBlur={e => { e.currentTarget.style.borderColor = `${color}20` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
