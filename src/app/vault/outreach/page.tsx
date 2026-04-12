'use client'

import { useState, useEffect } from 'react'

interface ContactOption {
  id: string
  firstName: string
  lastName: string
  email: string
  licenseType?: string
  currentAgency?: string
  state?: string
  wornOut: boolean
  importJobId?: string
  _count?: { messages: number }
}

interface Template {
  name: string
  subject: string
  body: string
}

interface SavedTemplate extends Template {
  savedAt: string
}

function normalizeLicense(raw?: string): string {
  if (!raw) return 'insurance'
  const r = raw.toLowerCase()
  if (r.includes('accident') && r.includes('health') && r.includes('life')) return 'life and health insurance'
  if (r.includes('accident') && r.includes('health')) return 'health insurance'
  if (r === 'life') return 'life insurance'
  if (r.includes('life')) return 'life insurance'
  if (r.includes('property') || r.includes('casualty') || r === 'p&c') return 'property and casualty insurance'
  if (r.includes('variable')) return 'variable annuity'
  if (r.includes('health')) return 'health insurance'
  return raw
}

function applyTokens(text: string, contact: ContactOption): string {
  return text
    .replace(/\{\{firstName\}\}/g, contact.firstName)
    .replace(/\{\{licenseType\}\}/g, normalizeLicense(contact.licenseType))
    .replace(/\{\{state\}\}/g, contact.state || 'your state')
    .replace(/\{\{currentAgency\}\}/g, contact.currentAgency || 'your current agency')
}

export default function OutreachPage() {
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [context, setContext] = useState('')
  const [contextSource, setContextSource] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)
  const [editedTemplate, setEditedTemplate] = useState<Template | null>(null)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [defaultTemplateName, setDefaultTemplateName] = useState<string | null>(null)
  const [settingDefault, setSettingDefault] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const [advanceStage, setAdvanceStage] = useState(true)
  const [previewContact, setPreviewContact] = useState<ContactOption | null>(null)
  const [wornOutOnly, setWornOutOnly] = useState(false)

  useEffect(() => {
    fetch('/api/admin/saved-templates')
      .then(r => r.json())
      .then(d => setSavedTemplates(d.templates ?? []))
    fetch('/api/admin/auto-send')
      .then(r => r.json())
      .then(d => setDefaultTemplateName(d.templateName ?? null))
  }, [])

  useEffect(() => {
    fetch('/api/admin/contacts?outreachStatus=pending&limit=200')
      .then(r => r.json())
      .then(async d => {
        const loaded = d.contacts ?? []
        setContacts(loaded)
        if (loaded.length > 0) setPreviewContact(loaded[0])

        // Auto-fill context from the most recent import job that has a contextPrompt
        const jobIds = Array.from(new Set<string>(
          loaded.map((c: ContactOption) => c.importJobId).filter(Boolean)
        ))
        for (const jobId of jobIds) {
          const jobRes = await fetch(`/api/admin/import-job/${jobId}`)
          if (jobRes.ok) {
            const job = await jobRes.json()
            if (job.contextPrompt) {
              setContext(job.contextPrompt)
              setContextSource(job.fileName)
              break
            }
          }
        }
      })
  }, [])

  const filteredContacts = wornOutOnly
    ? contacts.filter(c => c.wornOut)
    : contacts

  function toggleSelect(id: string) {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleGenerate() {
    setGenerating(true)
    setTemplates([])
    setSelectedTemplate(null)
    setEditedTemplate(null)
    setSentCount(null)
    const res = await fetch('/api/admin/generate-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, wornOut: wornOutOnly }),
    })
    const data = await res.json()
    if (data.templates) {
      setTemplates(data.templates)
      setSelectedTemplate(0)
      setEditedTemplate(data.templates[0])
    }
    setGenerating(false)
  }

  async function handleSaveTemplate() {
    if (!editedTemplate) return
    setSaving(true)
    const newSaved: SavedTemplate = { ...editedTemplate, savedAt: new Date().toISOString() }
    const updated = [newSaved, ...savedTemplates.filter(t => t.name !== editedTemplate.name)]
    await fetch('/api/admin/saved-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: updated }),
    })
    setSavedTemplates(updated)
    setSaving(false)
  }

  async function handleDeleteSaved(name: string) {
    const updated = savedTemplates.filter(t => t.name !== name)
    await fetch('/api/admin/saved-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: updated }),
    })
    setSavedTemplates(updated)
  }

  function selectTemplate(i: number) {
    setSelectedTemplate(i)
    setEditedTemplate({ ...templates[i] })
  }

  async function handleTestSend() {
    if (!editedTemplate || !testEmail) return
    setTestSending(true)
    setTestMsg(null)
    const mockContact: ContactOption = {
      id: 'test',
      firstName: 'Test',
      lastName: 'User',
      email: testEmail,
      licenseType: 'Life',
      state: 'TX',
      currentAgency: 'State Farm',
      wornOut: false,
    }
    const res = await fetch('/api/admin/send-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          contactId: 'test-preview',
          subject: applyTokens(editedTemplate.subject, mockContact),
          body: applyTokens(editedTemplate.body, mockContact),
          testEmail,
        }],
        testMode: true,
      }),
    })
    const data = await res.json()
    setTestMsg(data.ok ? `Test sent to ${testEmail}` : `Error: ${data.error ?? 'Failed'}`)
    setTestSending(false)
  }

  async function handleSend() {
    if (!editedTemplate || selected.size === 0) return
    setSending(true)
    const selectedContacts = filteredContacts.filter(c => selected.has(c.id))
    const messages = selectedContacts.map(c => ({
      contactId: c.id,
      subject: applyTokens(editedTemplate.subject, c),
      body: applyTokens(editedTemplate.body, c),
      inputTokens: 0,
      outputTokens: 0,
    }))
    const res = await fetch('/api/admin/send-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, advanceStage }),
    })
    const data = await res.json()
    setSentCount(data.sent ?? 0)
    setSending(false)
    setTemplates([])
    setSelectedTemplate(null)
    setEditedTemplate(null)
    setSelected(new Set())
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', background: '#0C1E30',
    border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
    color: '#ffffff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
  }

  const activeTemplate = editedTemplate

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>AI-Powered</p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: '0 0 6px' }}>Outreach</h1>
        <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>Claude generates 3 email templates. Pick one, edit if needed, then send to all selected contacts. Tokens like {`{{firstName}}`} are replaced per contact at send time.</p>
      </div>

      {sentCount !== null && (
        <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 6, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ color: '#4ade80', margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>✓ {sentCount} email{sentCount !== 1 ? 's' : ''} sent successfully.</p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#C9A96E', fontSize: 12, marginTop: 1 }}>1</span>
              <p style={{ color: '#9BB0C4', fontSize: 12, margin: 0, lineHeight: 1.6 }}>Contacts moved to <strong style={{ color: '#ffffff' }}>Contacted</strong> in your GHL pipeline.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#C9A96E', fontSize: 12, marginTop: 1 }}>2</span>
              <p style={{ color: '#9BB0C4', fontSize: 12, margin: 0, lineHeight: 1.6 }}>Monitor replies in <strong style={{ color: '#ffffff' }}>GHL → Conversations</strong>. Move contacts to <strong style={{ color: '#ffffff' }}>Responded</strong> when they reply.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#C9A96E', fontSize: 12, marginTop: 1 }}>3</span>
              <p style={{ color: '#9BB0C4', fontSize: 12, margin: 0, lineHeight: 1.6 }}>No reply after 3-5 days? Come back here and send a follow-up to the same contacts.</p>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>

        {/* Left: contacts + context */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Contact list */}
          <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(201,169,110,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
                Contacts ({selected.size} selected)
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSelected(new Set(filteredContacts.map(c => c.id)))} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer' }}>All</button>
                <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 11, cursor: 'pointer' }}>None</button>
              </div>
            </div>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={wornOutOnly} onChange={e => { setWornOutOnly(e.target.checked); setSelected(new Set()) }} />
                <span style={{ color: '#9BB0C4', fontSize: 12 }}>Worn-out leads only</span>
                <span
                  title="Agents who've been heavily pitched by other agencies. Templates for these contacts lead with value — no pitch, no booking link on the first email."
                  style={{ color: '#4B5563', fontSize: 11, cursor: 'help', border: '1px solid #4B5563', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >?</span>
              </label>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {filteredContacts.length === 0 ? (
                <p style={{ color: '#6B8299', fontSize: 13, padding: '20px', textAlign: 'center' }}>No contacts pending.</p>
              ) : filteredContacts.map(c => (
                <label key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px',
                  cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: selected.has(c.id) ? 'rgba(201,169,110,0.05)' : 'transparent',
                }}
                  onClick={() => setPreviewContact(c)}
                >
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} onClick={e => e.stopPropagation()} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#ffffff', fontSize: 12, margin: '0 0 1px', display: 'flex', gap: 6, alignItems: 'center' }}>
                      {c.firstName} {c.lastName}
                      {c.wornOut && <span style={{ fontSize: 9, color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: '0 4px', borderRadius: 2 }}>soft</span>}
                      {(c._count?.messages ?? 0) > 0 && (
                        <span title={`${c._count?.messages} email${c._count?.messages !== 1 ? 's' : ''} sent`} style={{ fontSize: 9, color: '#C9A96E', border: '1px solid rgba(201,169,110,0.3)', padding: '0 4px', borderRadius: 2 }}>
                          F{c._count?.messages}
                        </span>
                      )}
                    </p>
                    <p style={{ color: '#6B8299', fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {normalizeLicense(c.licenseType)}{c.state ? ` · ${c.state}` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Context + generate */}
          <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Context</p>
              {contextSource && <span style={{ color: '#4ade80', fontSize: 10 }}>✓ {contextSource}</span>}
            </div>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="e.g. State Farm agents in Texas. Show them AFF's higher income potential."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, marginBottom: 12, fontSize: 12 }}
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                width: '100%', padding: '10px', background: generating ? '#2a4a6a' : '#C9A96E',
                color: generating ? '#6B8299' : '#142D48', border: 'none', borderRadius: 4,
                fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: generating ? 'not-allowed' : 'pointer',
              }}
            >
              {generating ? 'Generating...' : 'Generate 3 Templates'}
            </button>
          </div>
        </div>

        {/* Right: template picker + preview + send */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Saved templates */}
          {savedTemplates.length > 0 && (
            <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
                <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Saved Templates</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {savedTemplates.map(t => (
                  <div key={t.name} style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 10 }}>
                    <button
                      onClick={() => { setEditedTemplate(t); setSelectedTemplate(null); setTemplates([]) }}
                      style={{ flex: 1, background: 'none', border: 'none', color: '#ffffff', fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                    >
                      {t.name}
                    </button>
                    <span style={{ color: '#4B5563', fontSize: 10 }}>{new Date(t.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <button onClick={() => handleDeleteSaved(t.name)} style={{ background: 'none', border: 'none', color: '#4B5563', fontSize: 12, cursor: 'pointer', padding: '0 4px' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generating ? (
            <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '48px', textAlign: 'center', flex: 1 }}>
              <p style={{ color: '#C9A96E', fontSize: 13, margin: 0 }}>Claude is writing 3 template variants...</p>
            </div>
          ) : !editedTemplate ? (
            <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '48px', textAlign: 'center', flex: 1 }}>
              <p style={{ color: '#4B5563', fontSize: 24, margin: '0 0 12px' }}>✉</p>
              <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>Generate new templates or load a saved one above.</p>
            </div>
          ) : (
            <>
              {/* Template picker tabs — only shown when generated templates exist */}
              {templates.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {templates.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => selectTemplate(i)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11,
                        fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        background: selectedTemplate === i ? '#C9A96E' : '#142D48',
                        color: selectedTemplate === i ? '#142D48' : '#6B8299',
                        outline: selectedTemplate === i ? 'none' : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}

              {activeTemplate && (
                <>
                  {/* Editable template */}
                  <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.15)' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(201,169,110,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Template — edit freely</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ color: '#4B5563', fontSize: 10 }}>{'{{firstName}} {{licenseType}} {{state}} {{currentAgency}}'}</span>
                        <button onClick={handleSaveTemplate} disabled={saving} style={{ background: 'none', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 3, color: '#C9A96E', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 10px', cursor: saving ? 'not-allowed' : 'pointer' }}>
                          {saving ? 'Saving...' : 'Save Template'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!editedTemplate) return
                            setSettingDefault(true)
                            await fetch('/api/admin/auto-send', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ template: editedTemplate }),
                            })
                            setDefaultTemplateName(editedTemplate.name)
                            setSettingDefault(false)
                          }}
                          disabled={settingDefault}
                          title="Set as the template used by auto-send"
                          style={{
                            background: defaultTemplateName === editedTemplate?.name ? 'rgba(74,222,128,0.1)' : 'none',
                            border: `1px solid ${defaultTemplateName === editedTemplate?.name ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 3, color: defaultTemplateName === editedTemplate?.name ? '#4ade80' : '#6B8299',
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          {defaultTemplateName === editedTemplate?.name ? '✓ Auto-Send Default' : 'Set as Default'}
                        </button>
                      </div>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                      <label style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Subject</label>
                      <input
                        value={editedTemplate?.subject ?? ''}
                        onChange={e => setEditedTemplate(t => t ? { ...t, subject: e.target.value } : t)}
                        style={{ ...inputStyle, marginBottom: 12, fontSize: 12 }}
                      />
                      <label style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Body</label>
                      <textarea
                        value={editedTemplate?.body ?? ''}
                        onChange={e => setEditedTemplate(t => t ? { ...t, body: e.target.value } : t)}
                        rows={8}
                        style={{ ...inputStyle, resize: 'vertical', fontSize: 12, lineHeight: 1.7 }}
                      />
                    </div>
                  </div>

                  {/* Live preview */}
                  {previewContact && (
                    <div style={{ background: '#0C1E30', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Preview — {previewContact.firstName} {previewContact.lastName}</p>
                        <span style={{ color: '#4B5563', fontSize: 10 }}>click a contact on the left to change preview</span>
                      </div>
                      <div style={{ padding: '16px 20px' }}>
                        <p style={{ color: '#C9A96E', fontSize: 12, fontWeight: 600, margin: '0 0 10px' }}>
                          {applyTokens(editedTemplate?.subject ?? '', previewContact)}
                        </p>
                        <p style={{ color: '#9BB0C4', fontSize: 12, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                          {applyTokens(editedTemplate?.body ?? '', previewContact)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Test send */}
                  <div style={{ background: '#0C1E30', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 18px' }}>
                    <p style={{ color: '#6B8299', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 10px' }}>Send Test Email</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="email"
                        value={testEmail}
                        onChange={e => { setTestEmail(e.target.value); setTestMsg(null) }}
                        placeholder="your@email.com"
                        style={{ flex: 1, padding: '8px 12px', background: '#142D48', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#ffffff', fontSize: 12, outline: 'none' }}
                      />
                      <button
                        onClick={handleTestSend}
                        disabled={testSending || !testEmail}
                        style={{
                          padding: '8px 16px', background: 'transparent', color: '#C9A96E',
                          border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, fontSize: 11,
                          fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          cursor: testEmail && !testSending ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
                        }}
                      >
                        {testSending ? 'Sending...' : 'Send Test'}
                      </button>
                    </div>
                    {testMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: testMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{testMsg}</p>}
                  </div>

                  {/* Send bar */}
                  <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                      <input type="checkbox" checked={advanceStage} onChange={e => setAdvanceStage(e.target.checked)} />
                      <span style={{ color: '#9BB0C4', fontSize: 12 }}>Move to "Contacted" in GHL pipeline after sending</span>
                    </label>
                    <button
                      onClick={handleSend}
                      disabled={sending || selected.size === 0}
                      style={{
                        padding: '10px 28px', background: selected.size > 0 && !sending ? '#C9A96E' : '#2a4a6a',
                        color: selected.size > 0 && !sending ? '#142D48' : '#6B8299',
                        border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: selected.size > 0 && !sending ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
                      }}
                    >
                      {sending ? 'Sending...' : `Send to ${selected.size} Contact${selected.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
