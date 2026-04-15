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
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const [syncingPipeline, setSyncingPipeline] = useState(false)

  const [pwFields, setPwFields] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  // Team management
  type TeamRole = 'ADMIN' | 'LICENSING_COORDINATOR'
  interface AdminUser { id: string; email: string; name: string; role?: TeamRole; createdAt: string; lastLoginAt: string | null }
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [newAdmin, setNewAdmin] = useState<{ email: string; name: string; password: string; role: TeamRole }>({
    email: '', name: '', password: '', role: 'ADMIN',
  })
  const [teamMsg, setTeamMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)

  const loadAdmins = async () => {
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const d = await res.json() as { users: AdminUser[] }
      setAdminUsers(d.users)
    }
  }

  useEffect(() => { loadAdmins() }, [])

  async function handleAddAdmin() {
    setTeamLoading(true)
    setTeamMsg(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAdmin),
    })
    const data = await res.json() as { user?: AdminUser; error?: string }
    if (res.ok && data.user) {
      setAdminUsers(prev => [...prev, data.user!])
      setNewAdmin({ email: '', name: '', password: '', role: 'ADMIN' })
      setShowAddAdmin(false)
      setTeamMsg({ ok: true, text: `Admin account created for ${data.user.email}` })
    } else {
      setTeamMsg({ ok: false, text: data.error ?? 'Failed to create admin' })
    }
    setTeamLoading(false)
  }

  async function handleRemoveAdmin(userId: string, email: string) {
    if (!confirm(`Remove admin access for ${email}? They will no longer be able to log in.`)) return
    setTeamLoading(true)
    setTeamMsg(null)
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (res.ok && data.ok) {
      setAdminUsers(prev => prev.filter(u => u.id !== userId))
      setTeamMsg({ ok: true, text: `Removed ${email}` })
    } else {
      setTeamMsg({ ok: false, text: data.error ?? 'Failed to remove admin' })
    }
    setTeamLoading(false)
  }

  async function handleResetAdminPassword(userId: string, email: string) {
    const newPassword = prompt(`Set a new password for ${email} (min 8 chars):`)
    if (!newPassword) return
    if (newPassword.length < 8) {
      setTeamMsg({ ok: false, text: 'Password must be at least 8 characters' })
      return
    }
    setTeamLoading(true)
    setTeamMsg(null)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    })
    const data = await res.json() as { user?: AdminUser; error?: string }
    if (res.ok && data.user) {
      setTeamMsg({ ok: true, text: `Password updated for ${email}. Share it with them securely.` })
    } else {
      setTeamMsg({ ok: false, text: data.error ?? 'Failed to update password' })
    }
    setTeamLoading(false)
  }

  async function handleChangePassword() {
    if (pwFields.newPassword !== pwFields.confirmPassword) {
      setPwMsg({ ok: false, text: 'New passwords do not match' })
      return
    }
    setPwLoading(true)
    setPwMsg(null)
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwFields.currentPassword, newPassword: pwFields.newPassword }),
    })
    const data = await res.json()
    if (data.ok) {
      setPwMsg({ ok: true, text: 'Password updated successfully.' })
      setPwFields({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } else {
      setPwMsg({ ok: false, text: data.error ?? 'Failed to update password' })
    }
    setPwLoading(false)
  }

  const [fields, setFields] = useState({
    GHL_API_KEY: '',
    GHL_LOCATION_ID: '',
    GHL_PIPELINE_ID: '',
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

  async function handleLoadPipelines() {
    setSyncingPipeline(true)
    setPipelineMsg(null)
    const res = await fetch('/api/admin/list-pipelines')
    const data = await res.json()
    if (data.pipelines) {
      setPipelines(data.pipelines)
      setPipelineMsg(data.pipelines.length === 0 ? 'No pipelines found in GHL.' : null)
    } else {
      setPipelineMsg(`Error: ${data.error}`)
    }
    setSyncingPipeline(false)
  }

  async function handleSyncPipeline() {
    if (!selectedPipelineId) return
    setSyncingPipeline(true)
    setPipelineMsg(null)
    const res = await fetch('/api/admin/list-pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineId: selectedPipelineId }),
    })
    const data = await res.json()
    if (data.ok) {
      setPipelineMsg(`Synced — ${data.stages?.length ?? 0} stages saved.`)
    } else {
      setPipelineMsg(`Error: ${data.error}`)
    }
    setSyncingPipeline(false)
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
            <p style={{ color: '#6B8299', fontSize: 12, margin: '0 0 24px', lineHeight: 1.6 }}>
              All keys are encrypted before being stored. Find your GHL API key at <strong style={{ color: '#9BB0C4' }}>GHL → Settings → Private Integrations</strong>. Your Anthropic key is at <strong style={{ color: '#9BB0C4' }}>console.anthropic.com → API Keys</strong>.
            </p>
            <Field label="GHL API Key" name="GHL_API_KEY" value={fields.GHL_API_KEY} onChange={set('GHL_API_KEY')} placeholder="pit-..." />
            <Field label="GHL Location ID" name="GHL_LOCATION_ID" value={fields.GHL_LOCATION_ID} onChange={set('GHL_LOCATION_ID')} placeholder="tDxu4b... (found in GHL URL)" />
            <Field label="GHL Pipeline ID (AFF Recruit)" name="GHL_PIPELINE_ID" value={fields.GHL_PIPELINE_ID} onChange={set('GHL_PIPELINE_ID')} placeholder="Found in GHL → Opportunities → Pipelines URL" />
            <Field label="Anthropic API Key (Claude)" name="ANTHROPIC_API_KEY" value={fields.ANTHROPIC_API_KEY} onChange={set('ANTHROPIC_API_KEY')} placeholder="sk-ant-... (used for AI email drafting)" />
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
              Creates the "AFF Recruit" pipeline in GHL automatically, or sync an existing pipeline you've already created manually.
            </p>

            {/* Auto-create */}
            <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 10px' }}>Option A — Auto-create</p>
            <div style={{ background: '#0C1E30', borderRadius: 4, padding: '14px 18px', marginBottom: 14 }}>
              {['Application Received', 'Contacted', 'Responded', 'Discovery Booked', 'Not Responding', 'Not Interested', 'Qualified', 'Ready to Onboard'].map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
                  <span style={{ color: '#C9A96E', fontSize: 11, width: 16, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ color: '#9BB0C4', fontSize: 13 }}>{s}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSetupPipeline} disabled={pipelineLoading} style={{
              padding: '10px 24px', background: '#142D48', color: '#C9A96E',
              border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, fontSize: 12,
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: pipelineLoading ? 'not-allowed' : 'pointer', marginBottom: 28,
            }}>
              {pipelineLoading ? 'Setting up...' : 'Setup Pipeline in GHL'}
            </button>

            {/* Manual sync */}
            <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 8px' }}>Option B — Sync existing pipeline</p>
            <p style={{ color: '#6B8299', fontSize: 12, lineHeight: 1.6, margin: '0 0 14px' }}>
              Already created a pipeline in GHL? Load your pipelines and select it to sync the stage IDs.
            </p>
            <button onClick={handleLoadPipelines} disabled={syncingPipeline} style={{
              padding: '10px 24px', background: '#142D48', color: '#C9A96E',
              border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, fontSize: 12,
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: syncingPipeline ? 'not-allowed' : 'pointer', marginBottom: 14,
            }}>
              {syncingPipeline ? 'Loading...' : 'Load My Pipelines'}
            </button>

            {pipelines.length > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <select
                  value={selectedPipelineId}
                  onChange={e => setSelectedPipelineId(e.target.value)}
                  style={{
                    flex: 1, padding: '10px 14px', background: '#0C1E30',
                    border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
                    color: '#ffffff', fontSize: 13, outline: 'none',
                  }}
                >
                  <option value="">Select a pipeline...</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button onClick={handleSyncPipeline} disabled={!selectedPipelineId || syncingPipeline} style={{
                  padding: '10px 20px', background: '#C9A96E', color: '#142D48', border: 'none',
                  borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: (!selectedPipelineId || syncingPipeline) ? 'not-allowed' : 'pointer',
                }}>
                  Sync
                </button>
              </div>
            )}

            {pipelineMsg && (
              <p style={{ marginTop: 4, fontSize: 13, color: pipelineMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>
                {pipelineMsg}
              </p>
            )}
          </div>
        </>
      )}

      {/* Team Management */}
      {card(
        <>
          {cardHeader('Team Management')}
          <div style={{ padding: '24px 28px' }}>
            <p style={{ fontSize: 12, color: '#9BB0C4', margin: '0 0 18px', lineHeight: 1.55 }}>
              Admin accounts can log in to the vault, manage agents, and access all tracker data. Add a new admin below, or remove / reset passwords for existing ones.
            </p>

            {/* Existing admins list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {adminUsers.length === 0 ? (
                <div style={{ fontSize: 12, color: '#6B8299' }}>Loading...</div>
              ) : (
                adminUsers.map(u => (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, flexWrap: 'wrap',
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(201,169,110,0.08)',
                    borderRadius: 5,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 500 }}>{u.name}</div>
                        <span style={{
                          display: 'inline-block',
                          background: u.role === 'LICENSING_COORDINATOR' ? 'rgba(155,109,255,0.12)' : 'rgba(201,169,110,0.12)',
                          border: `1px solid ${u.role === 'LICENSING_COORDINATOR' ? 'rgba(155,109,255,0.35)' : 'rgba(201,169,110,0.35)'}`,
                          color: u.role === 'LICENSING_COORDINATOR' ? '#9B6DFF' : '#C9A96E',
                          fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                          padding: '2px 7px', borderRadius: 3,
                        }}>
                          {u.role === 'LICENSING_COORDINATOR' ? 'Licensing' : 'Admin'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                        {u.email} · {u.lastLoginAt ? `last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : 'never logged in'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleResetAdminPassword(u.id, u.email)}
                        disabled={teamLoading}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(201,169,110,0.3)',
                          color: '#C9A96E', borderRadius: 4,
                          padding: '6px 12px', fontSize: 10, fontWeight: 700,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          cursor: teamLoading ? 'wait' : 'pointer', minHeight: 32,
                        }}
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => handleRemoveAdmin(u.id, u.email)}
                        disabled={teamLoading}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(248,113,113,0.25)',
                          color: '#f87171', borderRadius: 4,
                          padding: '6px 12px', fontSize: 10, fontWeight: 700,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          cursor: teamLoading ? 'wait' : 'pointer', minHeight: 32,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add admin form */}
            {showAddAdmin ? (
              <div style={{
                padding: 16,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(201,169,110,0.15)',
                borderRadius: 6,
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }}>Name</label>
                    <input
                      value={newAdmin.name}
                      onChange={e => setNewAdmin(a => ({ ...a, name: e.target.value }))}
                      placeholder="Melinee Minhas"
                      style={{ width: '100%', boxSizing: 'border-box', background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4, color: '#ffffff', padding: '9px 12px', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }}>Email</label>
                    <input
                      type="email"
                      value={newAdmin.email}
                      onChange={e => setNewAdmin(a => ({ ...a, email: e.target.value }))}
                      placeholder="melinee@allfinancialfreedom.com"
                      style={{ width: '100%', boxSizing: 'border-box', background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4, color: '#ffffff', padding: '9px 12px', fontSize: 13 }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }}>Role</label>
                  <select
                    value={newAdmin.role}
                    onChange={e => setNewAdmin(a => ({ ...a, role: e.target.value as TeamRole }))}
                    style={{ width: '100%', boxSizing: 'border-box', background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4, color: '#ffffff', padding: '9px 12px', fontSize: 13, appearance: 'auto' }}
                  >
                    <option value="ADMIN">Admin — full vault access</option>
                    <option value="LICENSING_COORDINATOR">Licensing Coordinator — inbox + licensing fields only</option>
                  </select>
                  <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>
                    {newAdmin.role === 'LICENSING_COORDINATOR'
                      ? "This user will only see the Licensing Inbox and Profile pages. They can manage requests, update licensing fields (exam date, license #, NPN), but cannot access the main tracker, outreach, or call reviews."
                      : 'This user will have full access to the vault, including team management and all agent data.'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }}>Temporary Password (min 8 chars)</label>
                  <input
                    type="text"
                    value={newAdmin.password}
                    onChange={e => setNewAdmin(a => ({ ...a, password: e.target.value }))}
                    placeholder="Share this securely — they can change it after first login"
                    style={{ width: '100%', boxSizing: 'border-box', background: '#0C1E30', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 4, color: '#ffffff', padding: '9px 12px', fontSize: 13, fontFamily: 'monospace' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setShowAddAdmin(false); setNewAdmin({ email: '', name: '', password: '', role: 'ADMIN' }) }}
                    disabled={teamLoading}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#9BB0C4', borderRadius: 4, padding: '9px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', minHeight: 38 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddAdmin}
                    disabled={teamLoading || !newAdmin.email || !newAdmin.name || newAdmin.password.length < 8}
                    style={{ background: teamLoading || !newAdmin.email || !newAdmin.name || newAdmin.password.length < 8 ? 'rgba(201,169,110,0.4)' : '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '9px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: teamLoading ? 'wait' : 'pointer', minHeight: 38 }}
                  >
                    {teamLoading ? 'Creating...' : 'Create Admin'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddAdmin(true)}
                style={{
                  background: 'transparent',
                  border: '1px dashed rgba(201,169,110,0.35)',
                  color: '#C9A96E', borderRadius: 5,
                  padding: '12px 18px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: 'pointer', width: '100%', minHeight: 44,
                }}
              >
                + Add Admin User
              </button>
            )}

            {teamMsg && (
              <p style={{ marginTop: 14, fontSize: 12, color: teamMsg.ok ? '#4ade80' : '#f87171' }}>
                {teamMsg.ok ? '✓ ' : '✗ '}{teamMsg.text}
              </p>
            )}
          </div>
        </>
      )}

      {/* Change Password */}
      {card(
        <>
          {cardHeader('Change Password')}
          <div style={{ padding: '28px' }}>
            {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map(key => (
              <div key={key} style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                  {key === 'currentPassword' ? 'Current Password' : key === 'newPassword' ? 'New Password' : 'Confirm New Password'}
                </label>
                <input
                  type="password"
                  value={pwFields[key]}
                  onChange={e => setPwFields(f => ({ ...f, [key]: e.target.value }))}
                  autoComplete="new-password"
                  style={{
                    width: '100%', padding: '10px 14px', background: '#0C1E30',
                    border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
                    color: '#ffffff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
            <button onClick={handleChangePassword} disabled={pwLoading} style={{
              padding: '10px 24px', background: '#C9A96E', color: '#142D48', border: 'none',
              borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: pwLoading ? 'not-allowed' : 'pointer',
            }}>
              {pwLoading ? 'Updating...' : 'Update Password'}
            </button>
            {pwMsg && (
              <p style={{ marginTop: 14, fontSize: 13, color: pwMsg.ok ? '#4ade80' : '#f87171' }}>
                {pwMsg.ok ? '✓ ' : '✗ '}{pwMsg.text}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
