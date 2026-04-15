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
            Outreach ({data.outreach.model}) &nbsp;&bull;&nbsp; Reviews ({data.callReviews.model})
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

          {/* Per-feature breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 16, padding: '14px 0 0' }}>
            <div>
              <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Outreach emails</p>
              <p style={{ color: '#C9A96E', fontSize: 14, fontWeight: 600, margin: 0 }}>
                ${data.outreach.allTime.cost.toFixed(4)}
              </p>
              <p style={{ color: '#4B5563', fontSize: 10, margin: '2px 0 0' }}>
                {data.outreach.count.toLocaleString()} emails
              </p>
            </div>
            <div>
              <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Call reviews</p>
              <p style={{ color: '#C9A96E', fontSize: 14, fontWeight: 600, margin: 0 }}>
                ${data.callReviews.allTime.cost.toFixed(4)}
              </p>
              <p style={{ color: '#4B5563', fontSize: 10, margin: '2px 0 0' }}>
                {data.callReviews.count.toLocaleString()} reviews
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
