'use client'

import { useState, useEffect } from 'react'

function Field({ label, name, value, onChange, placeholder }: {
  label: string; name: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
        {label}
      </label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: '100%', padding: '10px 14px', background: '#0C1E30',
          border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
          color: '#ffffff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          fontFamily: 'monospace',
        }}
      />
    </div>
  )
}

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)

  const [fields, setFields] = useState({
    GHL_API_KEY: '',
    GHL_LOCATION_ID: '',
    ANTHROPIC_API_KEY: '',
    GHL_PROPHOG_BOOKING_URL: '',
    VICK_EMAIL: '',
  })

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.settings) setFields(f => ({ ...f, ...d.settings }))
    })
  }, [])

  const set = (key: keyof typeof fields) => (v: string) => setFields(f => ({ ...f, [key]: v }))

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    // Only send non-masked values (masked values contain •)
    const toSend: Record<string, string> = {}
    for (const [k, v] of Object.entries(fields)) {
      if (v && !v.includes('•')) toSend[k] = v
    }
    await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toSend) })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/admin/ghl-status')
    const data = await res.json()
    setTestResult({ ok: data.connected, msg: data.connected ? `Connected to "${data.locationName}"` : data.error ?? 'Not connected' })
    setTesting(false)
  }

  async function handleSetupPipeline() {
    setPipelineLoading(true)
    setPipelineMsg(null)
    const res = await fetch('/api/admin/setup-pipeline', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      setPipelineMsg(data.existing ? 'Pipeline already exists — stage IDs synced.' : 'AFF Recruit pipeline created in GHL.')
    } else {
      setPipelineMsg(`Error: ${data.error}`)
    }
    setPipelineLoading(false)
  }

  const card = (children: React.ReactNode) => (
    <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', marginBottom: 24 }}>
      {children}
    </div>
  )

  const cardHeader = (title: string) => (
    <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
      <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>{title}</p>
    </div>
  )

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>Configuration</p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>Settings</h1>
      </div>

      {/* API Keys */}
      {card(
        <>
          {cardHeader('API Keys')}
          <div style={{ padding: '28px' }}>
            <Field label="GHL API Key" name="GHL_API_KEY" value={fields.GHL_API_KEY} onChange={set('GHL_API_KEY')} placeholder="pit-..." />
            <Field label="GHL Location ID" name="GHL_LOCATION_ID" value={fields.GHL_LOCATION_ID} onChange={set('GHL_LOCATION_ID')} placeholder="tDxu4b..." />
            <Field label="Anthropic API Key (Claude)" name="ANTHROPIC_API_KEY" value={fields.ANTHROPIC_API_KEY} onChange={set('ANTHROPIC_API_KEY')} placeholder="sk-ant-..." />
            <Field label="Vick's Email (for PropHog briefings)" name="VICK_EMAIL" value={fields.VICK_EMAIL} onChange={set('VICK_EMAIL')} placeholder="vick@allfinancialfreedom.com" />

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 24px', background: '#C9A96E', color: '#142D48', border: 'none',
                borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Keys'}
              </button>
              <button onClick={handleTest} disabled={testing} style={{
                padding: '10px 24px', background: 'transparent', color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, fontSize: 12,
                fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: testing ? 'not-allowed' : 'pointer',
              }}>
                {testing ? 'Testing...' : 'Test GHL Connection'}
              </button>
            </div>

            {testResult && (
              <p style={{ marginTop: 14, fontSize: 13, color: testResult.ok ? '#4ade80' : '#f87171' }}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
              </p>
            )}
          </div>
        </>
      )}

      {/* PropHog Calendar */}
      {card(
        <>
          {cardHeader('PropHog Booking Calendar')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 13, lineHeight: 1.7, margin: '0 0 16px' }}>
              Create a dedicated calendar in GHL for PropHog leads so Vick knows the source. Paste the booking URL below — it will be included in all PropHog outreach emails and trigger a briefing email to Vick when someone books.
            </p>
            <div style={{ background: '#0C1E30', borderRadius: 4, padding: '14px 18px', marginBottom: 20 }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 8px' }}>How to create in GHL</p>
              {[
                'Go to Calendars in your GHL sub-account',
                'Create New Calendar → name it "PropHog Discovery Calls"',
                'Copy the booking page URL',
                'Paste it below and save',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
                  <span style={{ color: '#C9A96E', fontSize: 11, width: 16, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ color: '#9BB0C4', fontSize: 12 }}>{step}</span>
                </div>
              ))}
            </div>
            <Field
              label="PropHog Booking URL"
              name="GHL_PROPHOG_BOOKING_URL"
              value={fields.GHL_PROPHOG_BOOKING_URL}
              onChange={set('GHL_PROPHOG_BOOKING_URL')}
              placeholder="https://link.msgsndr.com/widget/booking/..."
            />
            <button onClick={handleSave} disabled={saving} style={{
              padding: '10px 24px', background: '#C9A96E', color: '#142D48', border: 'none',
              borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Calendar URL'}
            </button>
          </div>
        </>
      )}

      {/* Pipeline Setup */}
      {card(
        <>
          {cardHeader('GHL Pipeline Setup')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 13, lineHeight: 1.7, margin: '0 0 20px' }}>
              Creates the "AFF Recruit" pipeline in GoHighLevel with all 8 stages. Safe to run again — it will sync existing stage IDs if the pipeline already exists.
            </p>
            <div style={{ background: '#0C1E30', borderRadius: 4, padding: '16px 20px', marginBottom: 20 }}>
              {['Application Received', 'Contacted', 'Responded', 'Discovery Booked', 'Not Responding', 'Not Interested', 'Qualified', 'Ready to Onboard'].map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                  <span style={{ color: '#C9A96E', fontSize: 11, width: 16, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ color: '#9BB0C4', fontSize: 13 }}>{s}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSetupPipeline} disabled={pipelineLoading} style={{
              padding: '10px 24px', background: '#142D48', color: '#C9A96E',
              border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, fontSize: 12,
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: pipelineLoading ? 'not-allowed' : 'pointer',
            }}>
              {pipelineLoading ? 'Setting up...' : 'Setup Pipeline in GHL'}
            </button>
            {pipelineMsg && (
              <p style={{ marginTop: 14, fontSize: 13, color: pipelineMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>
                {pipelineMsg}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
