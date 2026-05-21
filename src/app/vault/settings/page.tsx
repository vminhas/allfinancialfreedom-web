'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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

// Curated emoji set for booking-link icons. Keeps the choices on-brand
// (no random food / animal emoji), matches the kind of titles that
// actually show up (CEO, COO, trainer, coordinator), and dodges
// admin typos like trailing whitespace or invalid UTF-8 sequences.
const BOOKING_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: '✦',   label: 'Star (gold accent)' },
  { value: '⭐',  label: 'Star' },
  { value: '🌟',  label: 'Glowing star' },
  { value: '✨',  label: 'Sparkles' },
  { value: '💎',  label: 'Diamond' },
  { value: '🏆',  label: 'Trophy' },
  { value: '👑',  label: 'Crown' },
  { value: '🚀',  label: 'Rocket' },
  { value: '🎯',  label: 'Target' },
  { value: '💡',  label: 'Lightbulb' },
  { value: '⚡',  label: 'Lightning' },
  { value: '🎓',  label: 'Graduation cap' },
  { value: '📚',  label: 'Books' },
  { value: '💼',  label: 'Briefcase' },
  { value: '🔑',  label: 'Key' },
  { value: '🤝',  label: 'Handshake' },
  { value: '📞',  label: 'Phone' },
  { value: '✉',   label: 'Envelope' },
]

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
  const [discordConnected, setDiscordConnected] = useState(false)
  const [discordUsername, setDiscordUsername] = useState<string | null>(null)
  const [discordMsg, setDiscordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [discordDisconnecting, setDiscordDisconnecting] = useState(false)
  const discordChecked = useRef(false)

  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [teamTagSyncing, setTeamTagSyncing] = useState(false)
  const [teamTagMsg, setTeamTagMsg] = useState<string | null>(null)
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const [syncingPipeline, setSyncingPipeline] = useState(false)

  const [pwFields, setPwFields] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  // Team management
  type TeamRole = 'ADMIN' | 'LICENSING_COORDINATOR'
  interface AdminUser { id: string; email: string; name: string; role?: TeamRole; isTest?: boolean; createdAt: string; lastLoginAt: string | null }
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

  async function handleToggleTestAdmin(userId: string, currentIsTest: boolean) {
    setTeamLoading(true)
    setTeamMsg(null)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTest: !currentIsTest }),
    })
    const data = await res.json() as { user?: AdminUser; error?: string }
    if (res.ok && data.user) {
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, isTest: data.user!.isTest } : u))
      setTeamMsg({ ok: true, text: !currentIsTest ? 'Marked as test account. Run a sync to reassign their submissions.' : 'Removed test flag.' })
    } else {
      setTeamMsg({ ok: false, text: data.error ?? 'Failed to update' })
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

  // Licensing Coordinator booking calendar — linked from the agent
  // Phase 1 licensing checklist items and the licensing request modal.
  const [lcFields, setLcFields] = useState({ LC_CALENDAR_URL: '', LC_DISCORD_USER_ID: '' })
  const [lcSaving, setLcSaving] = useState(false)
  const [lcSaved, setLcSaved] = useState(false)

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
    avatarUrl?: string
    personType?: 'admin' | 'agent'
    personId?: string
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
    fetch('/api/admin/licensing-coordinator').then(r => r.json()).then(d => {
      if (d.settings) setLcFields(f => ({ ...f, ...d.settings }))
    })
    fetch('/api/admin/booking-links').then(r => r.json()).then(d => {
      if (Array.isArray(d.links)) setBookings(d.links as BookingLink[])
      setBookingsLoaded(true)
    }).catch(() => setBookingsLoaded(true))

    // Check Discord connection status
    if (!discordChecked.current) {
      discordChecked.current = true
      fetch('/api/admin/discord-status').then(r => r.json()).then(d => {
        if (d.connected) { setDiscordConnected(true); setDiscordUsername(d.username ?? null) }
      })
      // Handle redirect back from Discord OAuth
      const params = new URLSearchParams(window.location.search)
      const discordParam = params.get('discord')
      if (discordParam === 'connected') {
        const uname = params.get('username')
        setDiscordConnected(true)
        setDiscordUsername(uname)
        setDiscordMsg({ ok: true, text: `Discord connected${uname ? ` as ${uname}` : ''}.` })
        window.history.replaceState({}, '', '/vault/settings')
      } else if (discordParam === 'error') {
        const reason = params.get('reason')
        setDiscordMsg({ ok: false, text: `Discord connection failed${reason ? `: ${reason}` : ''}. Try again.` })
        window.history.replaceState({}, '', '/vault/settings')
      }
    }
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

  async function handleSaveLc() {
    setLcSaving(true)
    setLcSaved(false)
    await fetch('/api/admin/licensing-coordinator', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lcFields),
    })
    setLcSaving(false)
    setLcSaved(true)
    setTimeout(() => setLcSaved(false), 2000)
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

  async function handleSyncTeamTags() {
    setTeamTagSyncing(true)
    setTeamTagMsg(null)
    try {
      const res = await fetch('/api/admin/agents/sync-ghl-team-tags', { method: 'POST' })
      const d = await res.json() as { ok?: boolean; reason?: string; processed?: number; created?: number; tagged?: number; already?: number; failed?: number }
      if (d.ok === false) {
        setTeamTagMsg(`Error: ${d.reason ?? 'sync failed'}`)
      } else {
        setTeamTagMsg(`Done · ${d.processed ?? 0} agents · ${d.tagged ?? 0} newly tagged · ${d.created ?? 0} contacts created · ${d.already ?? 0} already tagged · ${d.failed ?? 0} failed`)
      }
    } catch {
      setTeamTagMsg('Error: request failed')
    }
    setTeamTagSyncing(false)
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

  async function handleDiscordDisconnect() {
    setDiscordDisconnecting(true)
    setDiscordMsg(null)
    const res = await fetch('/api/admin/discord-status', { method: 'DELETE' })
    if (res.ok) {
      setDiscordConnected(false)
      setDiscordUsername(null)
      setDiscordMsg({ ok: true, text: 'Discord disconnected.' })
    } else {
      setDiscordMsg({ ok: false, text: 'Failed to disconnect. Try again.' })
    }
    setDiscordDisconnecting(false)
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

      {/* Licensing Coordinator calendar — linked from the agent
          Phase 1 licensing checklist + licensing request modal */}
      {card(
        <>
          {cardHeader('Licensing Coordinator')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 12, margin: '0 0 24px', lineHeight: 1.6 }}>
              The booking link agents use to schedule time with the Licensing Coordinator. It appears on every licensing-related Phase 1 checklist item and in the licensing request modal. Leave blank to use the built-in default.
            </p>
            <Field label="Booking / Calendar URL" name="LC_CALENDAR_URL" value={lcFields.LC_CALENDAR_URL} onChange={(v) => setLcFields(f => ({ ...f, LC_CALENDAR_URL: v }))} placeholder="https://links.allfinancialfreedom.com/widget/booking/..." />

            <p style={{ color: '#6B8299', fontSize: 12, margin: '28px 0 24px', lineHeight: 1.6 }}>
              The Licensing Coordinator&apos;s Discord user ID. When set, she gets a Discord DM each morning listing any agents whose birthday is that day. Leave blank to turn the birthday DM off. (In Discord: User Settings &middot; Advanced &middot; Developer Mode on, then right-click her name &middot; Copy User ID.)
            </p>
            <Field label="Discord User ID" name="LC_DISCORD_USER_ID" value={lcFields.LC_DISCORD_USER_ID} onChange={(v) => setLcFields(f => ({ ...f, LC_DISCORD_USER_ID: v }))} placeholder="e.g. 412938571203847562" />

            <button onClick={handleSaveLc} disabled={lcSaving} style={{
              padding: '10px 24px', background: '#C9A96E', color: '#142D48', border: 'none',
              borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: lcSaving ? 'not-allowed' : 'pointer',
              marginTop: 16,
            }}>
              {lcSaving ? 'Saving...' : lcSaved ? 'Saved ✓' : 'Save'}
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
                {bookings.map((b, i) => {
                  const linked = !!(b.personType && b.personId)
                  return (
                  <div key={b.id} style={{ border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <BookingPersonPicker
                        link={b}
                        onPick={(p) => updateBooking(b.id, {
                          personType: p.type,
                          personId: p.id,
                          name: p.name,
                          avatarUrl: p.avatarUrl ?? b.avatarUrl,
                        })}
                        onUnlink={() => updateBooking(b.id, { personType: undefined, personId: undefined })}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      {!linked && (
                        <BookingField label="Name" value={b.name} placeholder="e.g. Vick Minhas" onChange={v => updateBooking(b.id, { name: v })} />
                      )}
                      <BookingField label="Role / title" value={b.role} placeholder="e.g. CEO" onChange={v => updateBooking(b.id, { role: v })} />
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
                      <div>
                        <BookingLabel>Icon (optional)</BookingLabel>
                        <select
                          value={b.icon ?? ''}
                          onChange={e => updateBooking(b.id, { icon: e.target.value })}
                          style={{ ...bookingInput, cursor: 'pointer' }}
                        >
                          <option value="">&mdash; None &mdash;</option>
                          {BOOKING_ICON_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.value} &nbsp; {opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {!linked && (
                      <div style={{ marginTop: 10 }}>
                        <BookingAvatarRow
                          link={b}
                          onChange={(url) => updateBooking(b.id, { avatarUrl: url })}
                        />
                      </div>
                    )}
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
                  )
                })}
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

      {/* GHL "AFF Team Member" tag sync */}
      {card(
        <>
          {cardHeader('GHL Team Tag')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 13, lineHeight: 1.7, margin: '0 0 16px' }}>
              Ensures every active agent&apos;s GHL contact carries the <strong style={{ color: '#9BB0C4' }}>AFF Team Member</strong> tag, so workflows can drop them out of recruiting drips once they&apos;re on the team. Applied automatically at invite and re-synced daily; run it here to backfill now. Safe to run repeatedly &middot; existing tags are kept.
            </p>
            <button onClick={handleSyncTeamTags} disabled={teamTagSyncing} style={{
              padding: '10px 24px', background: '#C9A96E', color: '#142D48', border: 'none',
              borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: teamTagSyncing ? 'not-allowed' : 'pointer',
            }}>
              {teamTagSyncing ? 'Syncing…' : 'Sync AFF Team tags now'}
            </button>
            {teamTagMsg && (
              <p style={{ marginTop: 12, fontSize: 13, color: teamTagMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>
                {teamTagMsg}
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
                        {u.isTest && (
                          <span style={{
                            display: 'inline-block',
                            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                            color: '#f87171', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
                            textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3,
                          }}>Test</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                        {u.email} · {u.lastLoginAt ? `last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : 'never logged in'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleToggleTestAdmin(u.id, !!u.isTest)}
                        disabled={teamLoading}
                        title={u.isTest ? 'Remove test flag' : 'Mark as test account (excluded from auto-assign)'}
                        style={{
                          background: u.isTest ? 'rgba(239,68,68,0.12)' : 'transparent',
                          border: `1px solid ${u.isTest ? 'rgba(239,68,68,0.35)' : 'rgba(107,130,153,0.3)'}`,
                          color: u.isTest ? '#f87171' : '#6B8299', borderRadius: 4,
                          padding: '6px 12px', fontSize: 10, fontWeight: 700,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          cursor: teamLoading ? 'wait' : 'pointer', minHeight: 32,
                        }}
                      >
                        {u.isTest ? 'Unmark Test' : 'Test'}
                      </button>
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

      {/* Your Discord */}
      {card(
        <>
          {cardHeader('Your Discord')}
          <div style={{ padding: '28px' }}>
            <p style={{ color: '#6B8299', fontSize: 12, margin: '0 0 20px', lineHeight: 1.6 }}>
              Link your personal Discord to get DMs from the AFF Concierge bot when something in the vault needs your attention. Licensing coordinators are pinged on new business submissions, licensing tickets, and agent replies. Admins can opt in too.
            </p>

            {discordConnected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  background: 'rgba(74,222,128,0.06)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: 6,
                  flex: 1, minWidth: 0,
                }}>
                  <span style={{ fontSize: 16 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
                      Discord connected
                    </div>
                    {discordUsername && (
                      <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                        {discordUsername}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleDiscordDisconnect}
                  disabled={discordDisconnecting}
                  style={{
                    padding: '10px 20px', background: 'transparent',
                    border: '1px solid rgba(248,113,113,0.35)', color: '#f87171',
                    borderRadius: 4, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: discordDisconnecting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {discordDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <a
                href="/api/vault/discord-connect"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '10px 22px',
                  background: '#5865F2',
                  color: '#ffffff',
                  borderRadius: 4, fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  textDecoration: 'none',
                }}
              >
                <svg width="18" height="14" viewBox="0 0 24 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.317 1.492a19.825 19.825 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 1.492a.07.07 0 0 0-.032.027C.533 6.093-.32 10.555.099 14.961a.08.08 0 0 0 .031.055 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.442a.061.061 0 0 0-.031-.03z"/>
                </svg>
                Connect Discord
              </a>
            )}

            {discordMsg && (
              <p style={{ marginTop: 14, fontSize: 12, color: discordMsg.ok ? '#4ade80' : '#f87171' }}>
                {discordMsg.ok ? '✓ ' : '✗ '}{discordMsg.text}
              </p>
            )}
          </div>
        </>
      )}

      {/* Maintenance — one-shot admin fixers for data backfills.
          Each entry is a single button that runs an idempotent
          server-side script and reports a count. Add new ones here
          as they come up; this card is intentionally low-key so
          rare-use tools don't clutter the main settings flow. */}
      {card(
        <>
          {cardHeader('Maintenance')}
          <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <TevahSyncRow />
            <div style={{ borderTop: '1px solid rgba(201,169,110,0.08)', paddingTop: 20 }}>
              <PurgeTevahRow />
            </div>
            <div style={{ borderTop: '1px solid rgba(201,169,110,0.08)', paddingTop: 20 }}>
              <BackfillDiscordConnectRow />
            </div>
            <div style={{ borderTop: '1px solid rgba(201,169,110,0.08)', paddingTop: 20 }}>
              <MassPortalInviteRow />
            </div>
            <div style={{ borderTop: '1px solid rgba(201,169,110,0.08)', paddingTop: 20 }}>
              <ProspectingToggleRow />
            </div>
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

// Avatar upload control inside the admin booking-links editor.
// Lives in /vault/settings on each row of the Booking Links section
// so admins can give Vick / Melinee / each CFT a real headshot.
// Uploads to Vercel Blob via /api/admin/booking-links/avatar, gets
// the public URL back, and patches the link via the parent's
// onChange so the next Save persists it. Optimistic preview while
// the upload is in flight.
function BookingAvatarRow({ link, onChange }: {
  link: { id: string; name: string; avatarUrl?: string }
  onChange: (url: string | undefined) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initials = link.name.split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase() || '·'

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('linkId', link.id)
      const res = await fetch('/api/admin/booking-links/avatar', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({})) as { avatarUrl?: string; error?: string }
      if (!res.ok || !d.avatarUrl) {
        setError(d.error ?? 'Upload failed')
        return
      }
      onChange(d.avatarUrl)
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await fetch(`/api/admin/booking-links/avatar?linkId=${encodeURIComponent(link.id)}`, { method: 'DELETE' })
      onChange(undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9BB0C4', marginBottom: 6 }}>
        Profile photo (optional)
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: link.avatarUrl ? 'transparent' : 'rgba(201,169,110,0.12)',
          border: '1px solid rgba(201,169,110,0.3)',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#C9A96E', fontWeight: 700, fontSize: 13,
        }}>
          {link.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={link.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          cursor: busy ? 'wait' : 'pointer',
          padding: '6px 12px', borderRadius: 4,
          background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)',
          color: '#C9A96E', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: busy ? 0.6 : 1,
        }}>
          {busy ? 'Uploading...' : link.avatarUrl ? 'Replace' : 'Upload photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
            style={{ display: 'none' }}
          />
        </label>
        {link.avatarUrl && !busy && (
          <button
            type="button"
            onClick={remove}
            style={{
              background: 'transparent', border: '1px solid rgba(239,68,68,0.4)',
              color: '#EF4444', borderRadius: 4, padding: '5px 10px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Remove
          </button>
        )}
        <span style={{ fontSize: 10, color: '#6B8299', marginLeft: 'auto', maxWidth: 200, lineHeight: 1.4 }}>
          Shown on the agent Book page when they pick this person.
        </span>
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#EF4444', marginTop: 6 }}>{error}</div>
      )}
    </div>
  )
}

// Search-as-you-type picker that links a booking-link row to an actual
// AFF user (admin staff or active agent profile). When a person is
// linked, the agent-side endpoint resolves their live name + headshot
// from the source record — so updating the user's profile elsewhere
// flows through to the Book page automatically.
type PersonHit = {
  id: string
  type: 'admin' | 'agent'
  name: string
  hint: string
  avatarUrl: string | null
}
function BookingPersonPicker({ link, onPick, onUnlink }: {
  link: { name: string; avatarUrl?: string; personType?: 'admin' | 'agent'; personId?: string }
  onPick: (p: { id: string; type: 'admin' | 'agent'; name: string; avatarUrl: string | null }) => void
  onUnlink: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PersonHit[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    setBusy(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/booking-links/people-search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const d = await res.json() as { people?: PersonHit[] }
        setResults(d.people ?? [])
      } catch { /* aborted or network */ }
      finally { setBusy(false) }
    }, 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, open])

  const linked = !!(link.personType && link.personId)

  if (linked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', border: '1px solid rgba(34,197,94,0.35)',
        background: 'rgba(34,197,94,0.06)', borderRadius: 6,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#22C55E' }}>
          Linked
        </span>
        <span style={{ fontSize: 13, color: '#E2E8F0', fontWeight: 600 }}>{link.name || '(no name)'}</span>
        <span style={{ fontSize: 11, color: '#6B8299' }}>
          {link.personType === 'admin' ? 'Admin user' : 'Agent profile'} &middot; live name &amp; photo from their record
        </span>
        <button
          type="button"
          onClick={onUnlink}
          style={{
            marginLeft: 'auto', background: 'transparent',
            border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444',
            borderRadius: 4, padding: '4px 10px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          Unlink
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9BB0C4', marginBottom: 6 }}>
        Pick person (recommended)
      </div>
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search admins &amp; agents by name..."
        style={bookingInput}
      />
      {open && q.trim().length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
          marginTop: 4, background: '#0F2238',
          border: '1px solid rgba(201,169,110,0.3)', borderRadius: 6,
          maxHeight: 280, overflowY: 'auto',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}>
          {busy && results.length === 0 ? (
            <div style={{ padding: '12px 14px', color: '#6B8299', fontSize: 12 }}>Searching...</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '12px 14px', color: '#6B8299', fontSize: 12 }}>No matches.</div>
          ) : results.map(p => (
            <button
              key={`${p.type}:${p.id}`}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onPick({ id: p.id, type: p.type, name: p.name, avatarUrl: p.avatarUrl })
                setQ('')
                setOpen(false)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#E2E8F0', textAlign: 'left',
                borderBottom: '1px solid rgba(201,169,110,0.08)',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', overflow: 'hidden',
                background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#C9A96E', fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>
                {p.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : p.name.split(/\s+/).slice(0, 2).map(s => s[0] ?? '').join('').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 1 }}>{p.hint}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
        Linking to a real user keeps their name &amp; headshot in sync automatically.
        Leave unlinked for external partners; you&rsquo;ll fill in name + photo manually below.
      </div>
    </div>
  )
}

// Triggers a full Tevah supervision + new-business sync from the vault.
// Calls /api/admin/tevah-sync which runs the same logic as the cron job
// but authenticated via admin session instead of CRON_SECRET.
function TevahSyncRow() {
  type SyncState = 'idle' | 'running' | 'done' | 'error'
  interface SyncResult {
    agents: { created?: number; updated?: number; pending?: number; errors?: number; created_codes?: string[] } | { error: string }
    submissions: { created?: number; updated?: number; announced?: number; errors?: number } | { error: string }
  }
  const [state, setState] = useState<SyncState>('idle')
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setState('running')
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/tevah-sync', { method: 'POST' })
      const d = await res.json() as { ok?: boolean; error?: string; agents?: SyncResult['agents']; submissions?: SyncResult['submissions'] }
      if (!res.ok || !d.ok) {
        setError(d.error ?? 'Sync failed')
        setState('error')
        return
      }
      setResult({ agents: d.agents ?? {}, submissions: d.submissions ?? {} })
      setState('done')
    } catch {
      setError('Network error')
      setState('error')
    }
  }

  const agentLine = result
    ? ('error' in result.agents
        ? `Agents: failed (${result.agents.error})`
        : `Agents: ${result.agents.created ?? 0} created, ${result.agents.updated ?? 0} updated, ${result.agents.pending ?? 0} pending Tevah code`)
    : null

  const subLine = result
    ? ('error' in result.submissions
        ? `Submissions: failed (${result.submissions.error})`
        : `Submissions: ${result.submissions.created ?? 0} created, ${result.submissions.updated ?? 0} updated, ${result.submissions.announced ?? 0} announced`)
    : null

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          Sync with Tevah
        </div>
        <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
          Pulls all agents and new business submissions from the Tevah supervision platform. New agents are created in the portal and connected to their upline. New submissions are announced in Discord. A summary posts to the admin activity channel when complete.
        </div>
        {state === 'done' && result && (
          <div style={{
            marginTop: 8, fontSize: 11, color: '#4ADE80',
            background: 'rgba(74,222,128,0.08)',
            border: '1px solid rgba(74,222,128,0.25)',
            padding: '8px 12px', borderRadius: 4,
            lineHeight: 1.6,
          }}>
            {agentLine && <div>{agentLine}</div>}
            {subLine && <div>{subLine}</div>}
          </div>
        )}
        {state === 'error' && error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>{error}</div>
        )}
      </div>
      <button
        onClick={run}
        disabled={state === 'running'}
        style={{
          padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: state === 'done' ? 'rgba(74,222,128,0.10)' : 'rgba(201,169,110,0.10)',
          border: `1px solid ${state === 'done' ? 'rgba(74,222,128,0.4)' : 'rgba(201,169,110,0.35)'}`,
          color: state === 'done' ? '#4ADE80' : '#C9A96E',
          borderRadius: 4, cursor: state === 'running' ? 'wait' : 'pointer',
          flexShrink: 0,
        }}
      >
        {state === 'running' ? 'Syncing...' : state === 'done' ? 'Sync again' : 'Sync now'}
      </button>
    </div>
  )
}

// Deletes all submissions that were imported via the Tevah sync.
// Use this to wipe a bad historical import before re-running the sync.
function PurgeTevahRow() {
  const [state, setState] = useState<'idle' | 'confirm' | 'running' | 'done' | 'error'>('idle')
  const [deleted, setDeleted] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setState('running')
    setError(null)
    try {
      const res = await fetch('/api/admin/tevah-sync/purge', { method: 'POST' })
      const d = await res.json() as { ok?: boolean; deleted?: number; error?: string }
      if (!res.ok || !d.ok) { setError(d.error ?? 'Purge failed'); setState('error'); return }
      setDeleted(d.deleted ?? 0)
      setState('done')
    } catch { setError('Network error'); setState('error') }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171', marginBottom: 4 }}>
          Purge Tevah Imports
        </div>
        <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
          Deletes all new business submissions that were created by the Tevah sync. Use this to clear a bad import before re-syncing with corrected logic. Manual submissions are not affected.
        </div>
        {state === 'done' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#4ADE80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', padding: '8px 12px', borderRadius: 4 }}>
            Deleted {deleted} Tevah-imported submissions. Run Sync Now to re-import.
          </div>
        )}
        {state === 'error' && error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>{error}</div>
        )}
        {state === 'confirm' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>
            This will permanently delete all Tevah-imported submissions. Are you sure?
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {state === 'confirm' && (
          <button onClick={() => setState('idle')} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, background: 'transparent', border: '1px solid rgba(107,130,153,0.4)', color: '#6B8299', borderRadius: 4, cursor: 'pointer' }}>
            Cancel
          </button>
        )}
        <button
          onClick={state === 'idle' ? () => setState('confirm') : state === 'confirm' ? run : undefined}
          disabled={state === 'running' || state === 'done'}
          style={{
            padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            background: state === 'done' ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)',
            border: `1px solid ${state === 'done' ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.35)'}`,
            color: state === 'done' ? '#4ADE80' : '#f87171',
            borderRadius: 4, cursor: (state === 'running' || state === 'done') ? 'not-allowed' : 'pointer', flexShrink: 0,
          }}
        >
          {state === 'running' ? 'Purging...' : state === 'done' ? 'Done' : state === 'confirm' ? 'Yes, Delete All' : 'Purge Tevah Data'}
        </button>
      </div>
    </div>
  )
}

// One-shot maintenance tool: backfills the connect_discord PhaseItem
// for every agent who has discordUserId set on their profile but
// missed the row because they linked Discord before the auto-tick was
// shipped. Idempotent server-side; safe to click twice.
function BackfillDiscordConnectRow() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ scanned: number; alreadyComplete: number; fixed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setState('running')
    setError(null)
    try {
      const res = await fetch('/api/admin/maintenance/backfill-discord-connect', { method: 'POST' })
      const d = await res.json() as { ok?: boolean; error?: string; scanned?: number; alreadyComplete?: number; fixed?: number }
      if (!res.ok || !d.ok) {
        setError(d.error ?? 'Backfill failed')
        setState('error')
        return
      }
      setResult({ scanned: d.scanned ?? 0, alreadyComplete: d.alreadyComplete ?? 0, fixed: d.fixed ?? 0 })
      setState('done')
    } catch {
      setError('Network error')
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          Backfill Discord-connected checkmarks
        </div>
        <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
          Marks the Phase 1 &ldquo;Connect Discord&rdquo; checklist item complete for every agent who already linked
          Discord but is missing the row. Idempotent &middot; safe to run anytime.
        </div>
        {state === 'done' && result && (
          <div style={{
            marginTop: 8, fontSize: 11, color: '#4ADE80',
            background: 'rgba(74,222,128,0.08)',
            border: '1px solid rgba(74,222,128,0.25)',
            padding: '6px 10px', borderRadius: 4,
            display: 'inline-block',
          }}>
            Scanned {result.scanned} &middot; already complete {result.alreadyComplete} &middot; fixed {result.fixed}
          </div>
        )}
        {state === 'error' && error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>{error}</div>
        )}
      </div>
      <button
        onClick={run}
        disabled={state === 'running'}
        style={{
          padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: state === 'done' ? 'rgba(74,222,128,0.10)' : 'rgba(201,169,110,0.10)',
          border: `1px solid ${state === 'done' ? 'rgba(74,222,128,0.4)' : 'rgba(201,169,110,0.35)'}`,
          color: state === 'done' ? '#4ADE80' : '#C9A96E',
          borderRadius: 4, cursor: state === 'running' ? 'wait' : 'pointer',
          flexShrink: 0,
        }}
      >
        {state === 'running' ? 'Running...' : state === 'done' ? 'Run again' : 'Run backfill'}
      </button>
    </div>
  )
}

// Mass (re)send of the portal invite email to every ACTIVE agent who
// was invited but never activated (no password set = never logged in /
// never accepted). Each send mints a fresh 72h invite link. Shows the
// eligible count up front and confirms before blasting.
function MassPortalInviteRow() {
  const [count, setCount] = useState<number | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ sent: number; failed: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/maintenance/mass-portal-invite')
      const d = await res.json() as { eligible?: number }
      setCount(d.eligible ?? 0)
    } catch {
      setCount(null)
    }
  }, [])

  useEffect(() => { loadCount() }, [loadCount])

  const run = async () => {
    if (count === 0) return
    if (!confirm(
      `Send the portal invite email to ${count ?? 'all eligible'} active agent(s) who have never logged in or accepted their invite?\n\nEach gets a fresh 72-hour invite link. This emails real people.`,
    )) return
    setState('sending')
    setError(null)
    try {
      const res = await fetch('/api/admin/maintenance/mass-portal-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const d = await res.json() as { ok?: boolean; error?: string; sent?: number; failed?: number; errors?: string[] }
      if (!res.ok || !d.ok) {
        setError(d.error ?? 'Send failed')
        setState('error')
        return
      }
      setResult({ sent: d.sent ?? 0, failed: d.failed ?? 0, errors: d.errors ?? [] })
      setState('done')
      loadCount()
    } catch {
      setError('Network error')
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          Mass portal invite
        </div>
        <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
          (Re)sends the welcome / portal-setup email to every <strong style={{ color: '#9BB0C4' }}>active</strong> agent who was invited but never logged in or accepted.
          {count !== null && (
            <> Currently <strong style={{ color: '#C9A96E' }}>{count}</strong> eligible.</>
          )}
        </div>
        {state === 'done' && result && (
          <div style={{
            marginTop: 8, fontSize: 11, color: '#4ADE80',
            background: 'rgba(74,222,128,0.08)',
            border: '1px solid rgba(74,222,128,0.25)',
            padding: '6px 10px', borderRadius: 4,
          }}>
            Sent {result.sent}{result.failed > 0 ? ` · failed ${result.failed}` : ''}
            {result.errors.length > 0 && (
              <div style={{ marginTop: 4, color: '#f59e0b', fontSize: 10, lineHeight: 1.5 }}>
                {result.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                {result.errors.length > 5 && <div>and {result.errors.length - 5} more</div>}
              </div>
            )}
          </div>
        )}
        {state === 'error' && error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>{error}</div>
        )}
      </div>
      <button
        onClick={run}
        disabled={state === 'sending' || count === 0}
        style={{
          padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: state === 'done' ? 'rgba(74,222,128,0.10)' : 'rgba(201,169,110,0.10)',
          border: `1px solid ${state === 'done' ? 'rgba(74,222,128,0.4)' : 'rgba(201,169,110,0.35)'}`,
          color: count === 0 ? '#6B8299' : state === 'done' ? '#4ADE80' : '#C9A96E',
          borderRadius: 4, cursor: state === 'sending' ? 'wait' : count === 0 ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {state === 'sending'
          ? 'Sending...'
          : count === 0
            ? 'None pending'
            : `Send ${count ?? ''} invite${count === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}

// Pause / resume the daily prospecting (cold-outreach) cron. Flips the
// shared AUTO_SEND_ENABLED setting that /api/cron/daily-outreach reads
// every morning. Useful when the sending IP is getting throttled (e.g.
// Yahoo TSS04 deferrals) and we need to let reputation recover without
// touching code.
function ProspectingToggleRow() {
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'error'>('loading')
  const [enabled, setEnabled] = useState(false)
  const [sentToday, setSentToday] = useState(0)
  const [dailyLimit, setDailyLimit] = useState(0)
  const [queueDepth, setQueueDepth] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/auto-send')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json() as {
        enabled?: boolean; sentToday?: number; dailyLimit?: number; queueDepth?: number
      }
      setEnabled(!!d.enabled)
      setSentToday(d.sentToday ?? 0)
      setDailyLimit(d.dailyLimit ?? 0)
      setQueueDepth(d.queueDepth ?? 0)
      setState('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
      setState('error')
    }
  }

  useEffect(() => { load() }, [])

  const toggle = async () => {
    const next = !enabled
    if (next && !confirm('Resume daily prospecting sends?')) return
    if (!next && !confirm('Pause daily prospecting sends?\n\nThe cron will skip every morning until you resume it. Already-queued contacts stay queued.')) return
    setState('saving')
    setError(null)
    try {
      const res = await fetch('/api/admin/auto-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          Prospecting outreach (daily cron)
        </div>
        <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
          The cold-outreach drip that sends pending contacts each morning. Pause it if the sending IP is getting throttled or you need to protect deliverability for transactional mail.
        </div>
        {state !== 'loading' && state !== 'error' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#9BB0C4' }}>
            Status:{' '}
            <strong style={{ color: enabled ? '#4ADE80' : '#F87171' }}>
              {enabled ? 'Sending' : 'Paused'}
            </strong>
            {' '}&middot; Sent today: {sentToday} / {dailyLimit} &middot; Queue: {queueDepth}
          </div>
        )}
        {state === 'error' && error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>{error}</div>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={state === 'loading' || state === 'saving'}
        style={{
          padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: enabled ? 'rgba(248,113,113,0.10)' : 'rgba(74,222,128,0.10)',
          border: `1px solid ${enabled ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.4)'}`,
          color: enabled ? '#F87171' : '#4ADE80',
          borderRadius: 4, cursor: (state === 'loading' || state === 'saving') ? 'wait' : 'pointer',
          flexShrink: 0,
        }}
      >
        {state === 'loading' ? 'Loading...' : state === 'saving' ? 'Saving...' : enabled ? 'Pause prospecting' : 'Resume prospecting'}
      </button>
    </div>
  )
}

