'use client'

import { useEffect, useState } from 'react'

interface BucketTotals {
  inputTokens: number
  outputTokens: number
  cost: number
}

interface FeatureBucket {
  allTime: BucketTotals & { cacheReadTokens?: number; cacheCreateTokens?: number }
  thisMonth: BucketTotals & { cacheReadTokens?: number; cacheCreateTokens?: number }
  today: BucketTotals & { cacheReadTokens?: number; cacheCreateTokens?: number }
  count: number
  model: string
}

interface CostData {
  outreach: FeatureBucket
  callReviews: FeatureBucket
  trainings: FeatureBucket
  allTime: BucketTotals
  thisMonth: BucketTotals
  today: BucketTotals
  totalMessages: number
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export default function ClaudeCostWidget() {
  const [data, setData] = useState<CostData | null>(null)

  useEffect(() => {
    fetch('/api/admin/claude-cost').then(r => r.json()).then(setData)
  }, [])

  const row = (label: string, value: string, sub?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#6B8299', fontSize: 12 }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ color: '#ffffff', fontSize: 15, fontWeight: 500 }}>${value}</span>
        {sub && <span style={{ color: '#6B8299', fontSize: 11, marginLeft: 8 }}>{sub}</span>}
      </span>
    </div>
  )

  return (
    <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', marginBottom: 24 }}>
      <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(201,169,110,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Claude API Usage</p>
        {data && (
          <span style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.1em' }}>
            3 sources · {data.outreach.model.split(' ')[0]} + {data.callReviews.model.split(' ')[0]}
          </span>
        )}
      </div>

      {!data ? (
        <div style={{ padding: '24px 28px', color: '#6B8299', fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{ padding: '8px 28px 20px' }}>
          {row('Today', fmt(data.today.cost),
            `${fmtTokens(data.today.inputTokens + data.today.outputTokens)} tokens`)}
          {row('This month', fmt(data.thisMonth.cost),
            `${fmtTokens(data.thisMonth.inputTokens + data.thisMonth.outputTokens)} tokens`)}
          {row('All time', fmt(data.allTime.cost),
            `${data.totalMessages.toLocaleString()} ops · ${fmtTokens(data.allTime.inputTokens + data.allTime.outputTokens)} tokens`)}

          {/* Per-source breakdown — shows where the spend is coming from */}
          <div style={{ marginTop: 16, padding: '14px 0 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <p style={{ color: '#9BB0C4', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Source breakdown
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <SourceCard
                label="Outreach emails"
                model={data.outreach.model}
                cost={data.outreach.allTime.cost}
                count={data.outreach.count}
                unit="emails"
              />
              <SourceCard
                label="Call reviews"
                model={data.callReviews.model}
                cost={data.callReviews.allTime.cost}
                count={data.callReviews.count}
                unit="reviews"
              />
              <SourceCard
                label="Training flyers"
                model={data.trainings.model}
                cost={data.trainings.allTime.cost}
                count={data.trainings.count}
                unit="parsed"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SourceCard({ label, model, cost, count, unit }: {
  label: string
  model: string
  cost: number
  count: number
  unit: string
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(201,169,110,0.08)',
      borderRadius: 4, padding: '10px 12px',
    }}>
      <p style={{ color: '#6B8299', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>{label}</p>
      <p style={{ color: '#C9A96E', fontSize: 14, fontWeight: 600, margin: 0 }}>
        ${cost.toFixed(4)}
      </p>
      <p style={{ color: '#4B5563', fontSize: 10, margin: '2px 0 0' }}>
        {count.toLocaleString()} {unit}
      </p>
      <p style={{ color: '#4B5563', fontSize: 9, margin: '2px 0 0', fontStyle: 'italic' }}>
        {model}
      </p>
    </div>
  )
}
