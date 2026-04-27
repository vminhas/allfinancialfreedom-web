'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, RadialBarChart, RadialBar, Legend,
} from 'recharts'
import { useIsMobile } from '@/lib/useIsMobile'

const EXPENSE_KEYS = [
  'rent', 'utilities', 'cable', 'carPayment', 'carGas', 'carInsurance',
  'cellPhones', 'fitness', 'healthInsurance', 'groceries', 'diningOut',
  'tithing', 'subscriptions', 'petCare', 'beauty', 'travel', 'ccLoans',
  'other', 'miscellaneous', 'entertainment',
] as const

const EXPENSE_LABELS: Record<string, string> = {
  rent: 'Rent / Mortgage / HOA', utilities: 'Utilities', cable: 'Cable / Wifi',
  carPayment: 'Car Payment', carGas: 'Car Gas', carInsurance: 'Car Insurance',
  cellPhones: 'Cell Phones', fitness: 'Fitness', healthInsurance: 'Health Insurance',
  groceries: 'Groceries', diningOut: 'Dining Out', tithing: 'Tithing / Charity',
  subscriptions: 'Subscriptions', petCare: 'Pet Care', beauty: 'Beauty / Barber',
  travel: 'Travel', ccLoans: 'CC & Loans', other: 'Other',
  miscellaneous: 'Miscellaneous', entertainment: 'Entertainment / Hobbies',
}

const ASSET_KEYS = ['retirement', 'checkingSavings', 'collegeFunds', 'lifeInsurance', 'livingTrust'] as const
const ASSET_LABELS: Record<string, string> = {
  retirement: 'Retirement', checkingSavings: 'Checking / Savings',
  collegeFunds: 'College Funds', lifeInsurance: 'Life Insurance', livingTrust: 'Living Trust & Will',
}

const DEBT_KEYS = ['mortgage', 'autoLoans', 'studentLoans', 'creditCards'] as const
const DEBT_LABELS: Record<string, string> = {
  mortgage: 'Mortgage', autoLoans: 'Auto Loans',
  studentLoans: 'Student Loans', creditCards: 'Credit Cards / Personal',
}

const BUCKET_COLORS = ['#4ade80', '#60a5fa', '#f59e0b', '#C9A96E']
const BUCKET_LABELS = ['Expenses / Bills', 'Fun / Entertainment', 'Emergency Fund', 'Retirement / Life Insurance']

interface PFRData {
  monthlyIncome: number
  expenses: Record<string, number>
  assets: Record<string, number>
  debts: Record<string, number>
  buckets: Record<string, number>
  retirementAge: number | null
  spouseRetAge: number | null
  desiredMonthlyRetirement: number
  monthlySavingsCommitment: number
  dreamsAndGoals: { timeFrame: string; dream: string; why: string }[]
  whatWouldThisDo: string
  whatIsStopping: string
  notes: string
}

const defaultPFR: PFRData = {
  monthlyIncome: 0, expenses: {}, assets: {}, debts: {},
  buckets: { expenses: 0, fun: 0, emergency: 0, retirement: 0 },
  retirementAge: null, spouseRetAge: null,
  desiredMonthlyRetirement: 0, monthlySavingsCommitment: 0,
  dreamsAndGoals: [], whatWouldThisDo: '', whatIsStopping: '', notes: '',
}

export default function PFRPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [data, setData] = useState<PFRData>(defaultPFR)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    fetch('/api/agents/pfr').then(r => {
      if (r.status === 401) { router.push('/agents/login'); return null }
      return r.json()
    }).then((d: { pfr?: PFRData } | null) => {
      if (d?.pfr) {
        setData({
          ...defaultPFR, ...d.pfr,
          expenses: (d.pfr.expenses && typeof d.pfr.expenses === 'object') ? d.pfr.expenses as Record<string, number> : {},
          assets: (d.pfr.assets && typeof d.pfr.assets === 'object') ? d.pfr.assets as Record<string, number> : {},
          debts: (d.pfr.debts && typeof d.pfr.debts === 'object') ? d.pfr.debts as Record<string, number> : {},
          buckets: (d.pfr.buckets && typeof d.pfr.buckets === 'object') ? d.pfr.buckets as Record<string, number> : defaultPFR.buckets,
          dreamsAndGoals: Array.isArray(d.pfr.dreamsAndGoals) ? d.pfr.dreamsAndGoals as PFRData['dreamsAndGoals'] : [],
        })
      }
      setLoading(false)
    })
  }, [router])

  const save = useCallback(async (updated: PFRData) => {
    setSaving(true)
    await fetch('/api/agents/pfr', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    setSaving(false)
    setLastSaved(new Date())
  }, [])

  const updateField = <K extends keyof PFRData>(key: K, value: PFRData[K]) => {
    const updated = { ...data, [key]: value }; setData(updated); save(updated)
  }
  const updateExpense = (key: string, value: number) => {
    const updated = { ...data, expenses: { ...data.expenses, [key]: value } }; setData(updated); save(updated)
  }
  const updateAsset = (key: string, value: number) => {
    const updated = { ...data, assets: { ...data.assets, [key]: value } }; setData(updated); save(updated)
  }
  const updateDebt = (key: string, value: number) => {
    const updated = { ...data, debts: { ...data.debts, [key]: value } }; setData(updated); save(updated)
  }
  const updateBucket = (key: string, value: number) => {
    const updated = { ...data, buckets: { ...data.buckets, [key]: value } }; setData(updated); save(updated)
  }

  const totalExpenses = useMemo(() => Object.values(data.expenses).reduce((a, b) => a + (b || 0), 0), [data.expenses])
  const leftOver = data.monthlyIncome - totalExpenses
  const totalAssets = useMemo(() => Object.values(data.assets).reduce((a, b) => a + (b || 0), 0), [data.assets])
  const totalDebts = useMemo(() => Object.values(data.debts).reduce((a, b) => a + (b || 0), 0), [data.debts])
  const totalBuckets = useMemo(() => Object.values(data.buckets).reduce((a, b) => a + (b || 0), 0), [data.buckets])

  const dimeDebt = totalDebts
  const dimeIncome = data.monthlyIncome * 12 * 10
  const dimeMortgage = (data.debts.mortgage || 0)
  const dimeEducation = (data.assets.collegeFunds || 0)
  const totalInsurableNeed = dimeDebt + dimeIncome + dimeMortgage + dimeEducation

  const bucketData = useMemo(() => [
    { name: 'Expenses', value: data.buckets.expenses || 0 },
    { name: 'Fun', value: data.buckets.fun || 0 },
    { name: 'Emergency', value: data.buckets.emergency || 0 },
    { name: 'Retirement', value: data.buckets.retirement || 0 },
  ].filter(d => d.value > 0), [data.buckets])

  const expenseBreakdown = useMemo(() => {
    const items = EXPENSE_KEYS
      .map(k => ({ name: EXPENSE_LABELS[k].split('/')[0].trim(), value: data.expenses[k] || 0 }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
    return items
  }, [data.expenses])

  const dimeData = useMemo(() => [
    { name: 'Debt', value: dimeDebt, fill: '#f87171' },
    { name: 'Income (10yr)', value: dimeIncome, fill: '#60a5fa' },
    { name: 'Mortgage', value: dimeMortgage, fill: '#f59e0b' },
    { name: 'Education', value: dimeEducation, fill: '#a78bfa' },
  ].filter(d => d.value > 0), [dimeDebt, dimeIncome, dimeMortgage, dimeEducation])

  const netWorth = totalAssets - totalDebts

  const card: React.CSSProperties = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 8, padding: isMobile ? '16px 16px' : '20px 24px' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, background: '#0A1628', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4, color: '#ffffff', outline: 'none', textAlign: 'right' }

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
  const tooltipStyle = { background: '#132238', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, fontSize: 11 }

  if (loading) return <div style={{ padding: 40, color: '#6B8299', minHeight: '100vh', background: '#0A1628' }}>Loading...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#ffffff', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: isMobile ? '16px 16px' : '20px 32px', borderBottom: '1px solid rgba(201,169,110,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button onClick={() => router.push('/agents')} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 4 }}>
            ← Back to Portal
          </button>
          <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, margin: 0, letterSpacing: '0.03em' }}>Personal Financial Review</h1>
          <p style={{ fontSize: 11, color: '#6B8299', margin: '4px 0 0' }}>Complete this with your trainer. Auto-saves as you type.</p>
        </div>
        <div style={{ fontSize: 10, color: saving ? '#f59e0b' : '#4ade80' }}>
          {saving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ''}
        </div>
      </div>

      <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Financial Snapshot Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Monthly Income', value: fmt(data.monthlyIncome), color: '#C9A96E' },
            { label: 'Left Over', value: fmt(leftOver), color: leftOver >= 0 ? '#4ade80' : '#f87171' },
            { label: 'Net Worth', value: fmt(netWorth), color: netWorth >= 0 ? '#4ade80' : '#f87171' },
            { label: 'Insurable Need', value: fmt(totalInsurableNeed), color: '#60a5fa' },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', padding: isMobile ? '14px 10px' : '16px 20px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Row 1: Income + Buckets + Expenses */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={lbl}>Total Monthly Income</div>
              <input type="number" style={{ ...inp, fontSize: 18, fontWeight: 700, padding: '12px 14px' }} value={data.monthlyIncome || ''} onChange={e => updateField('monthlyIncome', parseFloat(e.target.value) || 0)} placeholder="0" />
            </div>

            <div style={card}>
              <div style={lbl}>4-Bucket Breakdown</div>
              {['expenses', 'fun', 'emergency', 'retirement'].map((key, i) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: BUCKET_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#9BB0C4', flex: 1 }}>{BUCKET_LABELS[i]}</span>
                  <input type="number" style={{ ...inp, width: 80 }} value={data.buckets[key] || ''} onChange={e => updateBucket(key, parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
              ))}
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: '#6B8299' }}>Monthly Funding:</span>
                <span style={{ color: '#C9A96E', fontWeight: 700 }}>{fmt(totalBuckets)}</span>
              </div>
              {bucketData.length > 0 && (
                <div style={{ height: 140, marginTop: 12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={bucketData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                        {bucketData.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(Number(v ?? 0))} contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div style={card}>
            <div style={lbl}>Monthly Expenses</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px 16px' }}>
              {EXPENSE_KEYS.map(key => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#9BB0C4', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{EXPENSE_LABELS[key]}</span>
                  <input type="number" style={{ ...inp, width: 80, padding: '6px 8px', fontSize: 12 }} value={data.expenses[key] || ''} onChange={e => updateExpense(key, parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: '#9BB0C4' }}>Total:</span>
              <span style={{ color: '#C9A96E' }}>{fmt(totalExpenses)}</span>
            </div>
          </div>
        </div>

        {/* Expense Breakdown Chart */}
        {expenseBreakdown.length > 0 && (
          <div style={card}>
            <div style={lbl}>Top Expenses</div>
            <div style={{ height: isMobile ? 200 : 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseBreakdown} layout="vertical" margin={{ left: isMobile ? 60 : 100, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#6B8299', fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9BB0C4', fontSize: 10 }} width={isMobile ? 60 : 100} />
                  <Tooltip formatter={(v) => fmt(Number(v ?? 0))} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill="#C9A96E" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Row 2: Assets + Debts */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <div style={card}>
            <div style={lbl}>Current Assets</div>
            {ASSET_KEYS.map(key => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#9BB0C4', flex: 1 }}>{ASSET_LABELS[key]}</span>
                <input type="number" style={{ ...inp, width: 100 }} value={data.assets[key] || ''} onChange={e => updateAsset(key, parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>
            ))}
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#6B8299' }}>Total Assets:</span>
              <span style={{ color: '#4ade80' }}>{fmt(totalAssets)}</span>
            </div>
          </div>

          <div style={card}>
            <div style={lbl}>Current Debt</div>
            {DEBT_KEYS.map(key => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#9BB0C4', flex: 1 }}>{DEBT_LABELS[key]}</span>
                <input type="number" style={{ ...inp, width: 100 }} value={data.debts[key] || ''} onChange={e => updateDebt(key, parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>
            ))}
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#6B8299' }}>Total Debt:</span>
              <span style={{ color: '#f87171' }}>{fmt(totalDebts)}</span>
            </div>
          </div>
        </div>

        {/* D.I.M.E. + Net Worth Chart */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <div style={card}>
            <div style={lbl}>D.I.M.E. — Total Insurable Need</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Debt', value: dimeDebt, color: '#f87171' },
                { label: 'Income (x10 years)', value: dimeIncome, color: '#60a5fa' },
                { label: 'Mortgage', value: dimeMortgage, color: '#f59e0b' },
                { label: 'Children Education', value: dimeEducation, color: '#a78bfa' },
              ].map(d => (
                <div key={d.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: '#9BB0C4' }}>{d.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: d.color }}>{fmt(d.value)}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, background: d.color,
                      width: totalInsurableNeed > 0 ? `${Math.min(100, (d.value / totalInsurableNeed) * 100)}%` : '0%',
                      transition: 'width 0.5s',
                    }} />
                  </div>
                </div>
              ))}
              <div style={{ paddingTop: 10, borderTop: '2px solid rgba(201,169,110,0.2)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#C9A96E' }}>Total Insurable Need</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#C9A96E' }}>{fmt(totalInsurableNeed)}</span>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={lbl}>Assets vs Debt</div>
            {(totalAssets > 0 || totalDebts > 0) ? (
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Assets', value: totalAssets, fill: '#4ade80' },
                    { name: 'Debt', value: totalDebts, fill: '#f87171' },
                  ]} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: '#9BB0C4', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={60}>
                      {[{ fill: '#4ade80' }, { fill: '#f87171' }].map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ color: '#4B5563', fontSize: 12, padding: '32px 0', textAlign: 'center' }}>
                Enter your assets and debts to see the comparison.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 11, color: '#6B8299' }}>Net Worth:</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: netWorth >= 0 ? '#4ade80' : '#f87171' }}>{fmt(netWorth)}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={card}>
          <div style={lbl}>Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>At what age would you like to retire?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 9, color: '#4B5563' }}>You</span>
                  <input type="number" style={inp} value={data.retirementAge ?? ''} onChange={e => updateField('retirementAge', parseInt(e.target.value) || null)} placeholder="65" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 9, color: '#4B5563' }}>Spouse</span>
                  <input type="number" style={inp} value={data.spouseRetAge ?? ''} onChange={e => updateField('spouseRetAge', parseInt(e.target.value) || null)} placeholder="65" />
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>Desired monthly income in retirement</div>
              <input type="number" style={inp} value={data.desiredMonthlyRetirement || ''} onChange={e => updateField('desiredMonthlyRetirement', parseFloat(e.target.value) || 0)} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>Monthly savings commitment</div>
              <input type="number" style={inp} value={data.monthlySavingsCommitment || ''} onChange={e => updateField('monthlySavingsCommitment', parseFloat(e.target.value) || 0)} placeholder="0" />
              <div style={{ fontSize: 9, color: '#4B5563', marginTop: 4 }}>Budget: $100-$300 / Average: $500-$1,000 / Elite: $1,500+</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>What would this do for you?</div>
              <textarea style={{ ...inp, textAlign: 'left', minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={data.whatWouldThisDo} onChange={e => updateField('whatWouldThisDo', e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>What is stopping you?</div>
              <textarea style={{ ...inp, textAlign: 'left', minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={data.whatIsStopping} onChange={e => updateField('whatIsStopping', e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 4 }}>Comments / Notes</div>
            <textarea style={{ ...inp, textAlign: 'left', minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={data.notes} onChange={e => updateField('notes', e.target.value)} />
          </div>
        </div>

        {/* Dreams & Goals */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={lbl}>Dreams & Goals</div>
              <div style={{ fontSize: 10, color: '#6B8299' }}>What financial goals do you want to accomplish?</div>
            </div>
            <button
              onClick={() => {
                const updated = { ...data, dreamsAndGoals: [...data.dreamsAndGoals, { timeFrame: '', dream: '', why: '' }] }
                setData(updated); save(updated)
              }}
              style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
            >+ Add Goal</button>
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
                  padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <select
                    value={goal.timeFrame}
                    onChange={e => { const g = [...data.dreamsAndGoals]; g[i] = { ...g[i], timeFrame: e.target.value }; updateField('dreamsAndGoals', g) }}
                    style={{ ...inp, textAlign: 'left', padding: '6px 8px', fontSize: 11, cursor: 'pointer' }}
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
                    <button onClick={() => updateField('dreamsAndGoals', data.dreamsAndGoals.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 14, cursor: 'pointer', padding: 0, gridRow: '1 / 3' }} title="Remove">x</button>
                  )}
                  <input value={goal.dream} onChange={e => { const g = [...data.dreamsAndGoals]; g[i] = { ...g[i], dream: e.target.value }; updateField('dreamsAndGoals', g) }}
                    placeholder="Your dream or goal..." style={{ ...inp, textAlign: 'left', padding: '6px 8px', fontSize: 12, gridColumn: isMobile ? '1 / -1' : undefined }} />
                  <input value={goal.why} onChange={e => { const g = [...data.dreamsAndGoals]; g[i] = { ...g[i], why: e.target.value }; updateField('dreamsAndGoals', g) }}
                    placeholder="Why does this matter to you?" style={{ ...inp, textAlign: 'left', padding: '6px 8px', fontSize: 12, gridColumn: isMobile ? '1 / -1' : undefined }} />
                  {!isMobile && (
                    <button onClick={() => updateField('dreamsAndGoals', data.dreamsAndGoals.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 14, cursor: 'pointer', padding: 0 }} title="Remove">x</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
