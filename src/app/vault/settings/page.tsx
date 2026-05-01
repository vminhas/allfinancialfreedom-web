'use client'

import { useState, useEffect } from 'react'

// Lightweight helpers used by the Booking Links card. Inline so we
// don't have to thread a separate component file.
const bookingInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', background: '#0A1628',
  border: '1px solid rgba(201,169,110,0.18)', borderRadius: 4,
  color: '#d1d9e2', fontSize: 12, outline: 'none', fontFamily: 'inherit',
}

function BookingLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
      {children}
    </label>
  )
}

function BookingField({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  return (
    <div>
      <BookingLabel>{label}</BookingLabel>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...bookingInput, fontFamily: mono ? 'monospace' : 'inherit' }}
      />
    </div>
  )
}

function smallBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
    color: disabled ? '#374151' : '#9BB0C4', borderRadius: 4,
    padding: '5px 10px', fontSize: 11, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

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
    ZOOM_ACCOUNT_ID: '',
    ZOOM_CLIENT_ID: '',
    ZOOM_CLIENT_SECRET: '',
    ATTENDANCE_PRESENT_THRESHOLD_PCT: '',
  })

  const [zoomTesting, setZoomTesting] = useState(false)
  const [zoomTestResult, setZoomTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const [opsFields, setOpsFields] = useState({
    // Ongoing operations contact (Natalia) — voice + signature on welcome
    OPERATIONS_CONTACT_NAME: '',
    OPERATIONS_CONTACT_LAST_NAME: '',
    OPERATIONS_CONTACT_TITLE: '',
    OPERATIONS_CONTACT_EMAIL: '',
    OPERATIONS_CONTACT_PHONE: '',
    // Onboarding host (Melinee) — only does the initial Meet & Greet
    ONBOARDING_HOST_NAME: '',
    ONBOARDING_HOST_TITLE: '',
    ONBOARDING_HOST_CALENDLY_URL: '',
  })
  const [opsSaving, setOpsSaving] = useState(false)
  const [opsSaved, setOpsSaved] = useState(false)

  // ── Booking Links (Trainers / Leadership / Support) ──────────────
  // Curated list shown on /agents/book. Edit-on-add pattern: we keep
  // the working array in state and replace the whole list on save.
  type BookingGroup = 'leadership' | 'trainers' | 'support'
  interface BookingLink {
    id: string
    name: string
    role: string
    group: BookingGroup
    calendlyUrl: string
    description?: string
    icon?: string
  }
  const [bookings, setBookings] = useState<BookingLink[]>([])
  const [bookingsSaving, setBookingsSaving] = useState(false)
  const [bookingsSaved, setBookingsSaved] = useState(false)
  const [bookingsLoaded, setBookingsLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.settings) setFields(f => ({ ...f, ...d.settings }))
    })
    fetch('/api/admin/operations-contact').then(r => r.json()).then(d => {
      if (d.settings) setOpsFields(f => ({ ...f, ...d.settings }))
    })
    fetch('/api/admin/booking-links').then(r => r.json()).then(d => {
      if (Array.isArray(d.links)) setBookings(d.links as BookingLink[])
      setBookingsLoaded(true)
    }).catch(() => setBookingsLoaded(true))
  }, [])

  const setOps = (key: keyof typeof opsFields) => (v: string) =>
    setOpsFields(f => ({ ...f, [key]: v }))

  const addBooking = () => {
    setBookings(prev => [...prev, {
      id: `bl_${Math.random().toString(36).slice(2, 12)}`,
      name: '', role: '', group: 'trainers', calendlyUrl: '', description: '', icon: '',
    }])
  }
  const updateBooking = (id: string, patch: Partial<BookingLink>) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
  }
  const removeBooking = (id: string) => {
    setBookings(prev => prev.filter(b => b.id !== id))
  }
  const moveBooking = (id: string, dir: -1 | 1) => {
    setBookings(prev => {
      const idx = prev.findIndex(b => b.id === id)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }
  async function handleSaveBookings() {
    setBookingsSaving(true)
    setBookingsSaved(false)
    try {
      const res = await fetch('/api/admin/booking-links', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: bookings }),
      })
      if (res.ok) {
        const d = await res.json() as { links: BookingLink[] }
        // Server cleans/validates the list (drops blanks, fills missing
        // ids), so reflect what it persisted instead of what we sent.
        setBookings(d.links)
        setBookingsSaved(true)
        setTimeout(() => setBookingsSaved(false), 2000)
      }
    } finally { setBookingsSaving(false) }
  }

  async function handleSaveOps() {
    setOpsSaving(true)
    setOpsSaved(false)
    await fetch('/api/admin/operations-contact', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opsFields),
    })
    setOpsSaving(false)
    setOpsSaved(true)
    setTimeout(() => setOpsSaved(false), 2000)
  }

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

  async function handleZoomTest() {
    setZoomTesting(true)
    setZoomTestResult(null)
    // Save first so the test reads what's in the form, not the masked
    // values currently in state. We send only the Zoom keys so we
    // don't accidentally overwrite the masked GHL/Anthropic ones.
    const zoomToSend: Record<string, string> = {}
    for (const k of ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'] as const) {
      const v = fields[k]
      if (v && !v.includes('•')) zoomToSend[k] = v
    }
    if (Object.keys(zoomToSend).length > 0) {
      await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(zoomToSend) })
    }
    const res = await fetch('/api/admin/settings/zoom-test', { method: 'POST' })
    const data = await res.json() as { ok: boolean; error?: string }
    setZoomTestResult({
      ok: data.ok,
      msg: data.ok ? 'Connected. Zoom credentials are valid.' : (data.error ?? 'Test failed'),
    })
    setZoomTesting(false)
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

      {/* Zoom Attendance — Server-to-Server OAuth credentials for the
          attendance sync. Vick creates an app at marketplace.zoom.us
          and drops the three values here. */}
      {card(
        <>
          {cardHeader('Zoom Attendance Sync')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 12, margin: '0 0 18px', lineHeight: 1.6 }}>
              Pulls participant reports from Zoom after each training so attendance lands in the vault automatically. Create a <strong style={{ color: '#9BB0C4' }}>Server-to-Server OAuth</strong> app at <strong style={{ color: '#9BB0C4' }}>marketplace.zoom.us → Develop → Build App</strong>. Required scopes: <code style={{ color: '#C9A96E', fontSize: 11 }}>meeting:read:list_past_participants:admin</code>, <code style={{ color: '#C9A96E', fontSize: 11 }}>meeting:read:list_past_instances:admin</code>, <code style={{ color: '#C9A96E', fontSize: 11 }}>meeting:read:past_meeting:admin</code>, <code style={{ color: '#C9A96E', fontSize: 11 }}>user:read:list_users:admin</code>. The <code style={{ color: '#C9A96E', fontSize: 11 }}>list_past_instances</code> scope is required for recurring meetings (e.g. weekly trainings) so we can pull participants for the right occurrence.
            </p>
            <Field label="Zoom Account ID" name="ZOOM_ACCOUNT_ID" value={fields.ZOOM_ACCOUNT_ID} onChange={set('ZOOM_ACCOUNT_ID')} placeholder="From the App Credentials tab" />
            <Field label="Zoom Client ID" name="ZOOM_CLIENT_ID" value={fields.ZOOM_CLIENT_ID} onChange={set('ZOOM_CLIENT_ID')} placeholder="From the App Credentials tab" />
            <Field label="Zoom Client Secret" name="ZOOM_CLIENT_SECRET" value={fields.ZOOM_CLIENT_SECRET} onChange={set('ZOOM_CLIENT_SECRET')} placeholder="From the App Credentials tab" />
            <Field
              label="Present Threshold (% of meeting duration, default 50)"
              name="ATTENDANCE_PRESENT_THRESHOLD_PCT"
              value={fields.ATTENDANCE_PRESENT_THRESHOLD_PCT}
              onChange={set('ATTENDANCE_PRESENT_THRESHOLD_PCT')}
              placeholder="50"
            />
            <p style={{ color: '#6B8299', fontSize: 11, margin: '0 0 18px', lineHeight: 1.5 }}>
              Threshold governs the cell tooltip&apos;s &quot;short attendance&quot; flag, not whether someone counts as Present. Anyone who joined Zoom is marked Present; the percentage only adjusts what reads as a brief drop-in.
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 24px', background: '#C9A96E', color: '#142D48', border: 'none',
                borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Zoom Settings'}
              </button>
              <button onClick={handleZoomTest} disabled={zoomTesting} style={{
                padding: '10px 24px', background: 'transparent', color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, fontSize: 12,
                fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: zoomTesting ? 'not-allowed' : 'pointer',
              }}>
                {zoomTesting ? 'Testing...' : 'Test Zoom Connection'}
              </button>
            </div>

            {zoomTestResult && (
              <p style={{ marginTop: 14, fontSize: 13, color: zoomTestResult.ok ? '#4ade80' : '#f87171', wordBreak: 'break-word' }}>
                {zoomTestResult.ok ? '✓ ' : '✗ '}{zoomTestResult.msg}
              </p>
            )}
          </div>
        </>
      )}

      {/* Welcome email cast — two distinct people drive the auto-welcome */}
      {card(
        <>
          {cardHeader('Welcome Email Cast')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 12, margin: '0 0 24px', lineHeight: 1.6 }}>
              The auto-welcome email features two people. <strong style={{ color: '#9BB0C4' }}>Operations</strong> writes the email and is the agent's ongoing point of contact. <strong style={{ color: '#9BB0C4' }}>Meet &amp; Greet Host</strong> is the executive (typically the COO) who hosts the initial 60-minute call. Operations introduces the host inside the email — same warm 3-way intro you'd do over text. Update once; every welcome from then on uses it.
            </p>

            <p style={{ color: '#C9A96E', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 16px' }}>
              Operations Contact &nbsp;<span style={{ color: '#6B8299', fontWeight: 400 }}>· voice &amp; signature</span>
            </p>
            <Field label="First Name" name="OPERATIONS_CONTACT_NAME" value={opsFields.OPERATIONS_CONTACT_NAME} onChange={setOps('OPERATIONS_CONTACT_NAME')} placeholder="Natalia" />
            <Field label="Last Name" name="OPERATIONS_CONTACT_LAST_NAME" value={opsFields.OPERATIONS_CONTACT_LAST_NAME} onChange={setOps('OPERATIONS_CONTACT_LAST_NAME')} placeholder="(optional)" />
            <Field label="Title (shown in signature)" name="OPERATIONS_CONTACT_TITLE" value={opsFields.OPERATIONS_CONTACT_TITLE} onChange={setOps('OPERATIONS_CONTACT_TITLE')} placeholder="Agent Operations" />
            <Field label="Email" name="OPERATIONS_CONTACT_EMAIL" value={opsFields.OPERATIONS_CONTACT_EMAIL} onChange={setOps('OPERATIONS_CONTACT_EMAIL')} placeholder="operations@allfinancialfreedom.com" />
            <Field label="Phone" name="OPERATIONS_CONTACT_PHONE" value={opsFields.OPERATIONS_CONTACT_PHONE} onChange={setOps('OPERATIONS_CONTACT_PHONE')} placeholder="(optional, shown in signature)" />

            <hr style={{ border: 'none', borderTop: '1px solid rgba(201,169,110,0.12)', margin: '24px 0' }} />

            <p style={{ color: '#C9A96E', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 16px' }}>
              Meet &amp; Greet Host &nbsp;<span style={{ color: '#6B8299', fontWeight: 400 }}>· initial 60-min call only</span>
            </p>
            <Field label="First Name" name="ONBOARDING_HOST_NAME" value={opsFields.ONBOARDING_HOST_NAME} onChange={setOps('ONBOARDING_HOST_NAME')} placeholder="Melinee" />
            <Field label="Title" name="ONBOARDING_HOST_TITLE" value={opsFields.ONBOARDING_HOST_TITLE} onChange={setOps('ONBOARDING_HOST_TITLE')} placeholder="COO" />
            <Field label="Calendly / Booking URL" name="ONBOARDING_HOST_CALENDLY_URL" value={opsFields.ONBOARDING_HOST_CALENDLY_URL} onChange={setOps('ONBOARDING_HOST_CALENDLY_URL')} placeholder="https://links.allfinancialfreedom.com/widget/booking/..." />

            <button onClick={handleSaveOps} disabled={opsSaving} style={{
              padding: '10px 24px', background: '#C9A96E', color: '#142D48', border: 'none',
              borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: opsSaving ? 'not-allowed' : 'pointer',
              marginTop: 16,
            }}>
              {opsSaving ? 'Saving...' : opsSaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </>
      )}

      {/* Booking links — agents see these on /agents/book */}
      {card(
        <>
          {cardHeader('Trainer & Leadership Booking Links')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 12, margin: '0 0 20px', lineHeight: 1.6 }}>
              Curate the list agents see on <strong style={{ color: '#9BB0C4' }}>/agents/book</strong>. Add anyone with a Calendly (or other scheduling) link who agents should be able to book directly: leadership, CFTs, the licensing coordinator. Agents will see them grouped by category.
            </p>

            {!bookingsLoaded ? (
              <div style={{ color: '#6B8299', fontSize: 12 }}>Loading...</div>
            ) : bookings.length === 0 ? (
              <div style={{ color: '#4B5563', fontSize: 12, padding: '20px 0', textAlign: 'center', border: '1px dashed rgba(201,169,110,0.18)', borderRadius: 6 }}>
                No booking links yet. Tap &ldquo;+ Add link&rdquo; below to add the first.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {bookings.map((b, i) => (
                  <div key={b.id} style={{ border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      <BookingField label="Name" value={b.name} placeholder="e.g. Vick Minhas" onChange={v => updateBooking(b.id, { name: v })} />
                      <BookingField label="Role" value={b.role} placeholder="e.g. CEO" onChange={v => updateBooking(b.id, { role: v })} />
                      <div>
                        <BookingLabel>Group</BookingLabel>
                        <select
                          value={b.group}
                          onChange={e => updateBooking(b.id, { group: e.target.value as BookingGroup })}
                          style={bookingInput}
                        >
                          <option value="leadership">Leadership</option>
                          <option value="trainers">Trainers</option>
                          <option value="support">Licensing &amp; Support</option>
                        </select>
                      </div>
                      <BookingField label="Icon (emoji, optional)" value={b.icon ?? ''} placeholder="✦ / 🎯 / etc" onChange={v => updateBooking(b.id, { icon: v })} />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <BookingField label="Calendly / Booking URL" value={b.calendlyUrl} placeholder="https://calendly.com/..." onChange={v => updateBooking(b.id, { calendlyUrl: v })} mono />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <BookingField label="Short description (optional)" value={b.description ?? ''} placeholder="One-liner shown beneath the role" onChange={v => updateBooking(b.id, { description: v })} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveBooking(b.id, -1)}
                        style={smallBtn(i === 0)}
                      >↑</button>
                      <button
                        type="button"
                        disabled={i === bookings.length - 1}
                        onClick={() => moveBooking(b.id, 1)}
                        style={smallBtn(i === bookings.length - 1)}
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => removeBooking(b.id)}
                        style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', borderRadius: 4, padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={addBooking}
                style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.35)', color: '#C9A96E', borderRadius: 4, padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                + Add link
              </button>
              <button
                type="button"
                onClick={handleSaveBookings}
                disabled={bookingsSaving}
                style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: bookingsSaving ? 'not-allowed' : 'pointer' }}
              >
                {bookingsSaving ? 'Saving...' : bookingsSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>
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
