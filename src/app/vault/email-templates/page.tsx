'use client'

// Vault page for managing the GHL webhook email template system.
//
// Three surfaces stacked top-to-bottom:
//
//   1. Connection setup card. Shows the webhook URL + step-by-step
//      "wire this into GHL" instructions. Also surfaces a per-event
//      "Last received from GHL N minutes ago" badge so admins can
//      confirm GHL is actually pinging us.
//
//   2. Templates section. List of all templates grouped by event
//      type. Click a row to open the editor drawer with the WYSIWYG
//      body, subject, sender, recipient, filter, and a "Send Test"
//      button that ends-to-end exercises the GHL connection.
//
//   3. Senders section. Manage the "from" identities templates can
//      send under (Vick, Operations, Melinee, etc.). New / edit /
//      delete with FK-guard against templates that reference a sender.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import EmailBodyEditor from '@/components/email-editor/EmailBodyEditor'
import { VARS_BY_EVENT, EVENT_TYPE_OPTIONS } from '@/lib/email-template'

interface Sender {
  id: string; key: string; name: string; email: string; role: string | null
  isDefault: boolean; enabled: boolean
}

interface Template {
  id: string; key: string; label: string; description: string | null
  eventType: string | null
  recipient: string; internalTo: string | null
  filterJson: unknown
  subject: string; bodyHtml: string
  senderId: string | null
  sender: Sender | null
  enabled: boolean
}

interface RecentEvent {
  id: string; eventType: string; contactId: string | null; contactEmail: string | null
  receivedAt: string; templatesFired: string[]; templatesSkipped: string[]; error: string | null
}

interface WebhookActivity {
  recent: RecentEvent[]
  latestByEvent: Record<string, { lastReceivedAt: string; count: number }>
}

export default function EmailTemplatesVaultPage() {
  const isMobile = useIsMobile()
  const [templates, setTemplates] = useState<Template[]>([])
  const [senders, setSenders] = useState<Sender[]>([])
  const [activity, setActivity] = useState<WebhookActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [editingSender, setEditingSender] = useState<Sender | null>(null)
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [isCreatingSender, setIsCreatingSender] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, sRes, eRes] = await Promise.all([
        fetch('/api/admin/email-templates'),
        fetch('/api/admin/email-senders'),
        fetch('/api/admin/webhook-events'),
      ])
      const t = tRes.ok ? await tRes.json() as { templates: Template[] } : { templates: [] }
      const s = sRes.ok ? await sRes.json() as { senders: Sender[] } : { senders: [] }
      const e = eRes.ok ? await eRes.json() as WebhookActivity : null
      setTemplates(t.templates ?? [])
      setSenders(s.senders ?? [])
      setActivity(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Templates grouped by event so the page reads as a workflow
  // mapping (one event = one section, with all its templates listed).
  const byEvent = useMemo(() => {
    const groups: Record<string, Template[]> = {}
    for (const t of templates) {
      const k = t.eventType ?? '(legacy / no event)'
      groups[k] = groups[k] ?? []
      groups[k].push(t)
    }
    return groups
  }, [templates])

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/ghl-webhook`
      : 'https://allfinancialfreedom.com/api/ghl-webhook'

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px', maxWidth: 1100, margin: '0 auto', color: '#C5D0DC' }}>
      <h1 style={{ fontSize: 22, fontWeight: 300, color: '#fff', margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
        Email Templates &amp; GHL Workflows
      </h1>
      <p style={{ color: '#6B8299', fontSize: 13, margin: '6px 0 24px' }}>
        Map GHL workflow webhooks to AFF-branded emails. Each template has its own sender so onboarding goes from Operations, CEO intros come from Vick, etc.
      </p>

      <ConnectionSetupCard webhookUrl={webhookUrl} latestByEvent={activity?.latestByEvent ?? {}} />

      <SectionLabel>Templates by GHL event</SectionLabel>
      {loading && <Loading />}
      {!loading && Object.keys(byEvent).length === 0 && (
        <Empty>No templates yet. Click &quot;New template&quot; to wire your first one up.</Empty>
      )}
      {!loading && Object.entries(byEvent).map(([eventType, rows]) => {
        const meta = EVENT_TYPE_OPTIONS.find(o => o.value === eventType)
        const latest = activity?.latestByEvent[eventType]
        return (
          <div key={eventType} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                {meta?.label ?? eventType}
              </div>
              <div style={{ fontSize: 10, color: '#6B8299' }}>
                event: <code style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 2 }}>{eventType}</code>
              </div>
              {latest && <LiveBadge ts={latest.lastReceivedAt} />}
            </div>
            {meta?.description && (
              <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 8, lineHeight: 1.5 }}>{meta.description}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map(t => <TemplateRow key={t.id} t={t} onClick={() => setEditing(t)} />)}
            </div>
          </div>
        )
      })}
      <button onClick={() => setIsCreatingTemplate(true)} style={btnPrimary}>+ New template</button>

      <SectionLabel style={{ marginTop: 40 }}>Senders</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {senders.map(s => <SenderRow key={s.id} s={s} onClick={() => setEditingSender(s)} />)}
      </div>
      <button onClick={() => setIsCreatingSender(true)} style={btnSecondary}>+ New sender</button>

      <SectionLabel style={{ marginTop: 40 }}>Recent GHL activity</SectionLabel>
      <RecentEventsList events={activity?.recent ?? []} />

      {(editing || isCreatingTemplate) && (
        <TemplateEditorDrawer
          template={editing}
          senders={senders}
          onClose={() => { setEditing(null); setIsCreatingTemplate(false) }}
          onSaved={() => { setEditing(null); setIsCreatingTemplate(false); loadAll() }}
        />
      )}
      {(editingSender || isCreatingSender) && (
        <SenderEditorDrawer
          sender={editingSender}
          onClose={() => { setEditingSender(null); setIsCreatingSender(false) }}
          onSaved={() => { setEditingSender(null); setIsCreatingSender(false); loadAll() }}
        />
      )}
    </div>
  )
}

// ─── Connection setup card ─────────────────────────────────────────

function ConnectionSetupCard({
  webhookUrl, latestByEvent,
}: {
  webhookUrl: string
  latestByEvent: Record<string, { lastReceivedAt: string; count: number }>
}) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  const eventsReceived = Object.keys(latestByEvent).length
  return (
    <div style={{
      background: '#132238', border: '1px solid rgba(201,169,110,0.22)',
      borderRadius: 8, padding: 18, marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
            GHL Connection
          </div>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
            {eventsReceived > 0
              ? `Receiving events from GHL: ${eventsReceived} event type${eventsReceived === 1 ? '' : 's'} have hit this webhook.`
              : "Not connected yet. GHL hasn't pinged this webhook."}
          </div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '5px 10px', borderRadius: 3,
          background: eventsReceived > 0 ? 'rgba(74,222,128,0.10)' : 'rgba(245,158,11,0.10)',
          border: `1px solid ${eventsReceived > 0 ? 'rgba(74,222,128,0.4)' : 'rgba(245,158,11,0.4)'}`,
          color: eventsReceived > 0 ? '#4ADE80' : '#f59e0b',
        }}>
          {eventsReceived > 0 ? '● Live' : 'Awaiting first event'}
        </div>
      </div>

      <div style={{ background: '#0A1628', borderRadius: 5, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <code style={{ flex: 1, fontSize: 12, color: '#9BB0C4', wordBreak: 'break-all' }}>{webhookUrl}</code>
        <button onClick={copy} style={btnSmall}>{copied ? '✓ Copied' : 'Copy URL'}</button>
      </div>

      <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.7 }}>
        <strong style={{ color: '#fff' }}>Wire this up in GHL:</strong>
        <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>In your GHL workflow, add a <em>Webhook</em> action.</li>
          <li>Set the URL above. Method <code>POST</code>, content type <code>application/json</code>.</li>
          <li>
            Include a <code>type</code> field in the payload set to one of:{' '}
            {EVENT_TYPE_OPTIONS.map((o, i) => (
              <span key={o.value}>
                <code>{o.value}</code>{i < EVENT_TYPE_OPTIONS.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </li>
          <li>Make sure <code>contactId</code> is included so we can resolve the contact and send through GHL conversations.</li>
        </ol>
      </div>
    </div>
  )
}

function LiveBadge({ ts }: { ts: string }) {
  const ago = useMemo(() => formatRelative(ts), [ts])
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: '#4ADE80', background: 'rgba(74,222,128,0.10)',
      border: '1px solid rgba(74,222,128,0.3)', borderRadius: 3, padding: '2px 7px',
    }}>
      Last received {ago}
    </div>
  )
}

// ─── Templates rows ────────────────────────────────────────────────

function TemplateRow({ t, onClick }: { t: Template; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: '#132238', border: `1px solid ${t.enabled ? 'rgba(201,169,110,0.18)' : 'rgba(107,130,153,0.18)'}`,
        borderRadius: 6, padding: '12px 14px',
        opacity: t.enabled ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{t.label}</span>
        {!t.enabled && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', padding: '2px 6px', background: 'rgba(107,130,153,0.10)', borderRadius: 3 }}>Disabled</span>
        )}
        <span style={{ fontSize: 10, color: '#6B8299' }}>
          <code style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 2 }}>{t.key}</code>
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 4 }}>
        <strong style={{ color: '#fff', fontWeight: 600 }}>From:</strong>{' '}
        {t.sender ? `${t.sender.name} <${t.sender.email}>` : '(no sender)'}{' '}
        &middot; <strong style={{ color: '#fff', fontWeight: 600 }}>To:</strong>{' '}
        {t.recipient === 'CONTACT' ? 'the contact in the event' : t.internalTo ?? '(no recipient)'}
      </div>
      {t.description && <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>{t.description}</div>}
    </button>
  )
}

function SenderRow({ s, onClick }: { s: Sender; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', cursor: 'pointer',
      background: '#132238', border: '1px solid rgba(201,169,110,0.15)',
      borderRadius: 6, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      opacity: s.enabled ? 1 : 0.55,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
          {s.name}
          {s.isDefault && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>Default</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9BB0C4' }}>{s.email}{s.role ? ` · ${s.role}` : ''}</div>
      </div>
      <code style={{ fontSize: 10, color: '#6B8299', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 2 }}>{s.key}</code>
    </button>
  )
}

// ─── Template editor drawer ────────────────────────────────────────

function TemplateEditorDrawer({
  template, senders, onClose, onSaved,
}: {
  template: Template | null
  senders: Sender[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    key: template?.key ?? '',
    label: template?.label ?? '',
    description: template?.description ?? '',
    eventType: template?.eventType ?? EVENT_TYPE_OPTIONS[0].value,
    recipient: (template?.recipient ?? 'CONTACT') as 'CONTACT' | 'INTERNAL',
    internalTo: template?.internalTo ?? '',
    tagStartsWith: (template?.filterJson as { tagStartsWith?: string } | null)?.tagStartsWith ?? '',
    subject: template?.subject ?? '',
    bodyHtml: template?.bodyHtml ?? '',
    senderId: template?.senderId ?? senders.find(s => s.isDefault)?.id ?? senders[0]?.id ?? '',
    enabled: template?.enabled ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testContactId, setTestContactId] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const vars = VARS_BY_EVENT[form.eventType] ?? []

  const save = async () => {
    setError(null); setSaving(true)
    try {
      const filterJson = form.tagStartsWith.trim() ? { tagStartsWith: form.tagStartsWith.trim() } : null
      const payload = {
        ...form,
        internalTo: form.internalTo.trim() || null,
        filterJson,
      }
      const url = template ? `/api/admin/email-templates/${template.id}` : '/api/admin/email-templates'
      const method = template ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? `Save failed (${res.status})`)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!template) return
    if (!window.confirm(`Delete "${template.label}"? This can't be undone.`)) return
    await fetch(`/api/admin/email-templates/${template.id}`, { method: 'DELETE' })
    onSaved()
  }

  const sendTest = async () => {
    if (!template) return
    if (!testEmail || !testContactId) {
      setTestResult('Need test email + GHL contact id.')
      return
    }
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch(`/api/admin/email-templates/${template.id}/test-send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: testEmail, toContactId: testContactId }),
      })
      const d = await res.json() as { ok?: boolean; error?: string; sentTo?: string }
      setTestResult(d.ok ? `✓ Sent to ${d.sentTo}` : `Failed: ${d.error ?? 'unknown'}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <DrawerScrim onClose={onClose}>
      <DrawerHeader title={template ? 'Edit template' : 'New template'} onClose={onClose} />
      <div style={drawerBody}>
        <Field label="Label">
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={inputStyle} placeholder="e.g. Discovery Call Confirmation" />
        </Field>
        <Field label="Key" hint="Stable identifier used in code paths. Lowercase, hyphens only.">
          <input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} style={inputStyle} placeholder="discovery-confirmation" disabled={!!template} />
        </Field>
        <Field label="Description" hint="Internal notes about what this template is for.">
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, minHeight: 50 }} />
        </Field>
        <Field label="GHL event" hint="Which inbound webhook event fires this template.">
          <select value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))} style={inputStyle}>
            {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Sender">
          <select value={form.senderId} onChange={e => setForm(f => ({ ...f, senderId: e.target.value }))} style={inputStyle}>
            {senders.map(s => <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>)}
          </select>
        </Field>
        <Field label="Recipient">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <RadioPill label="The GHL contact" active={form.recipient === 'CONTACT'} onClick={() => setForm(f => ({ ...f, recipient: 'CONTACT' }))} />
            <RadioPill label="Internal address" active={form.recipient === 'INTERNAL'} onClick={() => setForm(f => ({ ...f, recipient: 'INTERNAL' }))} />
          </div>
        </Field>
        {form.recipient === 'INTERNAL' && (
          <Field label="Internal address" hint="Where this email lands (e.g. vick@allfinancialfreedom.com).">
            <input type="email" value={form.internalTo} onChange={e => setForm(f => ({ ...f, internalTo: e.target.value }))} style={inputStyle} />
          </Field>
        )}
        <Field label="Filter (optional)" hint="Only fire when the contact has a tag starting with this prefix.">
          <input value={form.tagStartsWith} onChange={e => setForm(f => ({ ...f, tagStartsWith: e.target.value }))} placeholder="e.g. prophog" style={inputStyle} />
        </Field>
        <Field label="Subject" hint="Use {{variables}} from the editor.">
          <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Body" hint="Brand header, signature, and footer wrap this automatically. Write the inner message only.">
          <EmailBodyEditor value={form.bodyHtml} onChange={html => setForm(f => ({ ...f, bodyHtml: html }))} variables={vars} />
        </Field>
        <Field label="Enabled">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#9BB0C4', fontSize: 12 }}>
            <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
            Send this template when the event fires
          </label>
        </Field>

        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving...' : (template ? 'Save changes' : 'Create template')}</button>
          {template && <button onClick={remove} style={btnDanger}>Delete</button>}
        </div>

        {template && (
          <div style={{ marginTop: 24, padding: 14, background: 'rgba(201,169,110,0.05)', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
              Send a test
            </div>
            <div style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 10, lineHeight: 1.5 }}>
              Renders with placeholder data + sends through GHL to verify the connection. Use a real GHL contact (a dedicated &quot;test&quot; one is ideal).
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test-to@example.com" style={{ ...inputStyle, flex: 1, minWidth: 200 }} type="email" />
              <input value={testContactId} onChange={e => setTestContactId(e.target.value)} placeholder="GHL contact id" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
            </div>
            <button onClick={sendTest} disabled={testing} style={btnSecondary}>{testing ? 'Sending...' : 'Send test email'}</button>
            {testResult && (
              <div style={{ marginTop: 8, fontSize: 11, color: testResult.startsWith('✓') ? '#4ADE80' : '#f87171' }}>{testResult}</div>
            )}
          </div>
        )}
      </div>
    </DrawerScrim>
  )
}

// ─── Sender editor drawer ──────────────────────────────────────────

function SenderEditorDrawer({
  sender, onClose, onSaved,
}: {
  sender: Sender | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    key: sender?.key ?? '',
    name: sender?.name ?? '',
    email: sender?.email ?? '',
    role: sender?.role ?? '',
    isDefault: sender?.isDefault ?? false,
    enabled: sender?.enabled ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null); setSaving(true)
    try {
      const url = '/api/admin/email-senders'
      const method = sender ? 'PATCH' : 'POST'
      const body = sender ? { id: sender.id, ...form } : form
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? `Save failed (${res.status})`)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!sender) return
    if (!window.confirm(`Delete "${sender.name}" sender?`)) return
    const res = await fetch(`/api/admin/email-senders?id=${encodeURIComponent(sender.id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setError(d.error ?? 'Delete failed')
      return
    }
    onSaved()
  }

  return (
    <DrawerScrim onClose={onClose}>
      <DrawerHeader title={sender ? 'Edit sender' : 'New sender'} onClose={onClose} />
      <div style={drawerBody}>
        <Field label="Display name" hint="Shown in the email From header. e.g. 'Vick Minhas'.">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Email" hint="Must be verified in GHL / SPF for sends to actually deliver.">
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Role" hint="Shows under the signature in every email. e.g. 'Chief Executive Officer, All Financial Freedom'.">
          <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Key" hint="Stable identifier. Can't be changed once set.">
          <input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} disabled={!!sender} style={inputStyle} />
        </Field>
        <Field label="">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#9BB0C4', fontSize: 12 }}>
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
            Use as default sender for new templates
          </label>
        </Field>
        <Field label="">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#9BB0C4', fontSize: 12 }}>
            <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
            Enabled
          </label>
        </Field>
        {error && <div style={errBox}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving...' : (sender ? 'Save changes' : 'Create sender')}</button>
          {sender && <button onClick={remove} style={btnDanger}>Delete</button>}
        </div>
      </div>
    </DrawerScrim>
  )
}

// ─── Recent events log ─────────────────────────────────────────────

function RecentEventsList({ events }: { events: RecentEvent[] }) {
  if (events.length === 0) {
    return <Empty>No GHL webhook events recorded yet. Once GHL pings the URL above, hits will show up here.</Empty>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {events.map(e => (
        <div key={e.id} style={{
          background: '#132238', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 5, padding: '8px 12px', fontSize: 11, color: '#9BB0C4',
        }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>{e.eventType}</span>
            <span style={{ color: '#6B8299' }}>{formatRelative(e.receivedAt)}</span>
            {e.contactEmail && <span>{e.contactEmail}</span>}
          </div>
          {e.templatesFired.length > 0 && (
            <div style={{ color: '#4ADE80' }}>
              ✓ Sent: {e.templatesFired.join(', ')}
            </div>
          )}
          {e.templatesSkipped.length > 0 && (
            <div style={{ color: '#f59e0b' }}>
              skipped: {e.templatesSkipped.join(', ')}
            </div>
          )}
          {e.templatesFired.length === 0 && e.templatesSkipped.length === 0 && (
            <div style={{ color: '#6B8299', fontStyle: 'italic' }}>
              No templates matched this event yet. Add one above.
            </div>
          )}
          {e.error && <div style={{ color: '#f87171' }}>Error: {e.error}</div>}
        </div>
      ))}
    </div>
  )
}

// ─── Small UI primitives ───────────────────────────────────────────

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
      color: '#C9A96E', marginBottom: 12, ...style,
    }}>{children}</div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          {label}
        </div>
      )}
      {children}
      {hint && <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

function DrawerScrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.7)', backdropFilter: 'blur(4px)',
      zIndex: 100, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(620px, 100%)', height: '100%', background: '#0A1628',
        borderLeft: '1px solid rgba(201,169,110,0.25)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{
      padding: '16px 20px', borderBottom: '1px solid rgba(201,169,110,0.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{title}</div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9BB0C4', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
  )
}

function RadioPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} type="button" style={{
      cursor: 'pointer',
      background: active ? 'rgba(201,169,110,0.15)' : 'transparent',
      border: `1px solid ${active ? 'rgba(201,169,110,0.45)' : 'rgba(255,255,255,0.12)'}`,
      color: active ? '#C9A96E' : '#9BB0C4',
      padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    }}>{label}</button>
  )
}

function Loading() {
  return <div style={{ color: '#6B8299', fontSize: 12, padding: 28, textAlign: 'center' }}>Loading...</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#6B8299', fontSize: 12, padding: 18, textAlign: 'center', background: '#132238', borderRadius: 5, lineHeight: 1.5 }}>{children}</div>
}

// Styles

const drawerBody: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px 20px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0F2440', border: '1px solid rgba(201,169,110,0.2)',
  borderRadius: 4, color: '#E5EBF2', padding: '8px 10px', fontSize: 13,
  fontFamily: 'inherit',
}

const btnPrimary: React.CSSProperties = {
  background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4,
  padding: '9px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.35)',
  borderRadius: 4, padding: '9px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.35)',
  borderRadius: 4, padding: '9px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', cursor: 'pointer',
}
const btnSmall: React.CSSProperties = {
  background: 'rgba(201,169,110,0.10)', color: '#C9A96E',
  border: '1px solid rgba(201,169,110,0.3)', borderRadius: 3,
  padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', cursor: 'pointer',
}

const errBox: React.CSSProperties = {
  marginTop: 8, padding: '8px 12px',
  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: 4, color: '#f87171', fontSize: 12,
}

function formatRelative(iso: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return `${Math.floor(ms / 86400_000)}d ago`
}
