'use client'

import { useState, useEffect } from 'react'

interface PipelineStage {
  id: string
  name: string
  count: number
  contacts: { name: string; email: string }[]
}

const STAGE_COLORS: Record<string, string> = {
  'Application Received': '#C9A96E',
  'Contacted': '#60a5fa',
  'Responded': '#a78bfa',
  'Discovery Booked': '#34d399',
  'Not Responding': '#f59e0b',
  'Not Interested': '#f87171',
  'Qualified': '#4ade80',
  'Ready to Onboard': '#C9A96E',
}

export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [pipelineConfigured, setPipelineConfigured] = useState(true)
  const [error, setError] = useState('')

  async function loadPipeline() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/pipeline-stages')
      const data = await res.json()
      if (data.notConfigured) {
        setPipelineConfigured(false)
        setStages([])
      } else if (data.stages) {
        setStages(data.stages)
        setPipelineConfigured(true)
      } else {
        setError(data.error ?? 'Failed to load pipeline')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    await loadPipeline()
    setSyncing(false)
  }

  useEffect(() => { loadPipeline() }, [])

  return (
    <div>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>AFF Recruit</p>
          <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>Pipeline</h1>
        </div>
        <button onClick={handleSync} disabled={syncing || loading} style={{
          padding: '8px 20px', background: 'transparent', color: '#C9A96E',
          border: '1px solid rgba(201,169,110,0.3)', borderRadius: 4, fontSize: 11,
          fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
        }}>
          {syncing ? 'Syncing...' : 'Sync from GHL'}
        </button>
      </div>

      {!pipelineConfigured && (
        <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.2)', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: '#C9A96E', fontSize: 13, margin: '0 0 16px' }}>Pipeline not set up yet.</p>
          <a href="/vault/settings" style={{
            padding: '10px 24px', background: '#C9A96E', color: '#142D48',
            textDecoration: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Go to Settings → Setup Pipeline
          </a>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '16px 24px' }}>
          <p style={{ color: '#f87171', margin: 0, fontSize: 13 }}>{error}</p>
        </div>
      )}

      {loading && !error && pipelineConfigured && (
        <p style={{ color: '#6B8299', fontSize: 13 }}>Loading pipeline data...</p>
      )}

      {/* Pipeline board */}
      {!loading && stages.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 12, minWidth: 'max-content', paddingBottom: 8 }}>
            {stages.map(stage => (
              <div key={stage.id} style={{
                width: 180, background: '#142D48', borderRadius: 6,
                border: '1px solid rgba(201,169,110,0.1)', overflow: 'hidden', flexShrink: 0,
              }}>
                {/* Stage header */}
                <div style={{
                  padding: '12px 14px',
                  borderBottom: `2px solid ${STAGE_COLORS[stage.name] ?? 'rgba(201,169,110,0.3)'}`,
                  background: 'rgba(0,0,0,0.2)',
                }}>
                  <p style={{ color: STAGE_COLORS[stage.name] ?? '#C9A96E', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 4px' }}>
                    {stage.name}
                  </p>
                  <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 300, margin: 0 }}>{stage.count}</p>
                </div>

                {/* Contact chips */}
                <div style={{ padding: '10px 12px', minHeight: 80 }}>
                  {stage.contacts.slice(0, 4).map((c, i) => (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: 3,
                      padding: '6px 8px', marginBottom: 4,
                    }}>
                      <p style={{ color: '#9BB0C4', fontSize: 11, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </p>
                    </div>
                  ))}
                  {stage.count > 4 && (
                    <p style={{ color: '#6B8299', fontSize: 10, margin: '4px 0 0', textAlign: 'center' }}>
                      +{stage.count - 4} more
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow info */}
      {!loading && stages.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 28 }}>
          {[
            { tag: 'prophog-fresh', label: 'Workflow A: Fresh Leads', color: '#60a5fa', steps: ['Day 0: Intro email', 'Day 3: Follow-up email', 'Day 7: Social proof + CTA', 'Day 10: SMS (after email reply only)', 'Day 14: Final email or manual task'] },
            { tag: 'prophog-worn-out', label: 'Workflow B: Soft Touch', color: '#f59e0b', steps: ['Day 0: Value-add email (no pitch)', 'Day 7: Light check-in', 'Day 14: SMS (after email reply only)'] },
          ].map(w => (
            <div key={w.tag} style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '20px 24px' }}>
              <p style={{ color: w.color, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 6px' }}>GHL Workflow</p>
              <p style={{ color: '#ffffff', fontSize: 14, fontWeight: 500, margin: '0 0 14px' }}>{w.label}</p>
              <p style={{ color: '#6B8299', fontSize: 10, margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trigger: tag = {w.tag}</p>
              {w.steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ color: w.color, fontSize: 10, marginTop: 2 }}>·</span>
                  <span style={{ color: '#9BB0C4', fontSize: 12 }}>{s}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
