'use client'

import { useEffect, useState } from 'react'

interface CostData {
  allTime: { inputTokens: number; outputTokens: number; cost: number }
  thisMonth: { inputTokens: number; outputTokens: number; cost: number }
  today: { inputTokens: number; outputTokens: number; cost: number }
  totalMessages: number
  model: string
  pricing: { inputPerM: number; outputPerM: number }
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
      <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(201,169,110,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Claude API Usage</p>
        {data && (
          <span style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.1em' }}>
            {data.model} &nbsp;&bull;&nbsp; ${data.pricing.inputPerM}/M in &nbsp;&bull;&nbsp; ${data.pricing.outputPerM}/M out
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
            `${data.totalMessages.toLocaleString()} emails · ${fmtTokens(data.allTime.inputTokens + data.allTime.outputTokens)} tokens`)}

          <div style={{ display: 'flex', gap: 24, marginTop: 16, padding: '14px 0 0' }}>
            <div>
              <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Avg cost / email</p>
              <p style={{ color: '#C9A96E', fontSize: 14, fontWeight: 600, margin: 0 }}>
                {data.totalMessages > 0
                  ? `$${(data.allTime.cost / data.totalMessages).toFixed(5)}`
                  : '—'}
              </p>
            </div>
            <div>
              <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Cost per 1,000 emails</p>
              <p style={{ color: '#C9A96E', fontSize: 14, fontWeight: 600, margin: 0 }}>
                {data.totalMessages > 0
                  ? `$${((data.allTime.cost / data.totalMessages) * 1000).toFixed(2)}`
                  : `~$${((300 / 1_000_000 * data.pricing.inputPerM + 150 / 1_000_000 * data.pricing.outputPerM) * 1000).toFixed(2)} est.`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
