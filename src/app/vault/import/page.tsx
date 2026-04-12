'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'

type CsvRow = Record<string, string>

const FIELD_OPTIONS = [
  { value: '', label: '— skip —' },
  { value: 'firstName', label: 'First Name *' },
  { value: 'lastName', label: 'Last Name *' },
  { value: 'email', label: 'Email *' },
  { value: 'phone', label: 'Phone' },
  { value: 'licenseType', label: 'License Type' },
  { value: 'currentAgency', label: 'Current Agency' },
  { value: 'state', label: 'State' },
  { value: 'wornOut', label: 'Worn Out Flag' },
]

function guessMapping(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')
  if (h.includes('first')) return 'firstName'
  if (h.includes('last')) return 'lastName'
  if (h.includes('email') || h.includes('mail')) return 'email'
  if (h.includes('phone') || h.includes('cell') || h.includes('mobile')) return 'phone'
  if (h.includes('license') || h.includes('lob') || h.includes('type')) return 'licenseType'
  if (h.includes('agency') || h.includes('company') || h.includes('employer')) return 'currentAgency'
  if (h.includes('state') || h.includes('st') || h === 'state') return 'state'
  if (h.includes('worn') || h.includes('exhausted') || h.includes('dnd')) return 'wornOut'
  return ''
}

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: CsvRow = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
  return { headers, rows }
}

type Step = 'upload' | 'map' | 'confirm' | 'import' | 'done'

export default function ImportPage() {
  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [contextPrompt, setContextPrompt] = useState('')
  const [wornOutStrategy, setWornOutStrategy] = useState<'flag_column' | 'none'>('none')
  const [jobId, setJobId] = useState('')
  const [jobStats, setJobStats] = useState<{ total: number; toImport: number; skipped: number } | null>(null)
  const [importProgress, setImportProgress] = useState<{ imported: number; total: number; status: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const { headers, rows } = parseCsv(e.target?.result as string)
      setHeaders(headers)
      setRows(rows)
      const auto: Record<string, string> = {}
      headers.forEach(h => { auto[h] = guessMapping(h) })
      setMapping(auto)
      setStep('map')
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) handleFile(file)
  }, [])

  async function handleConfirm() {
    // Build contact list from rows + mapping
    const contacts = rows.map(row => {
      const c: Record<string, string | boolean> = {}
      for (const [csvCol, field] of Object.entries(mapping)) {
        if (field) c[field] = field === 'wornOut' ? row[csvCol]?.toLowerCase() === 'true' : row[csvCol] ?? ''
      }
      return c
    }).filter(c => c.email && c.firstName && c.lastName)

    const res = await fetch('/api/admin/import-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, contacts, contextPrompt, wornOutStrategy }),
    })
    const data = await res.json()
    if (data.jobId) {
      setJobId(data.jobId)
      setJobStats({ total: data.total, toImport: data.toImport, skipped: data.skipped })
      setStep('confirm')
    }
  }

  async function handleImport() {
    setImporting(true)
    setStep('import')
    setImportProgress({ imported: 0, total: jobStats?.toImport ?? 0, status: 'RUNNING' })

    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    })
    const data = await res.json()

    if (data.paused) {
      setImportProgress({ imported: data.imported ?? 0, total: jobStats?.toImport ?? 0, status: 'PAUSED' })
    } else {
      setImportProgress({ imported: data.imported ?? 0, total: jobStats?.toImport ?? 0, status: 'COMPLETE' })
      setStep('done')
    }
    setImporting(false)
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', background: '#0C1E30',
    border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4,
    color: '#ffffff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>PropHog</p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>Import Contacts</h1>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
        {(['upload', 'map', 'confirm', 'import'] as Step[]).map((s, i) => {
          const labels = ['Upload', 'Map Fields', 'Review', 'Import']
          const active = step === s || (step === 'done' && s === 'import')
          const done = ['upload', 'map', 'confirm', 'import'].indexOf(step) > i
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <div style={{ width: 24, height: 1, background: 'rgba(201,169,110,0.2)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#C9A96E' : active ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active || done ? '#C9A96E' : 'rgba(255,255,255,0.1)'}`,
                  fontSize: 10, color: done ? '#142D48' : active ? '#C9A96E' : '#6B8299', fontWeight: 700,
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{ color: active ? '#ffffff' : done ? '#C9A96E' : '#6B8299', fontSize: 12 }}>{labels[i]}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#C9A96E' : 'rgba(201,169,110,0.3)'}`,
            borderRadius: 8, padding: '60px 40px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'rgba(201,169,110,0.05)' : 'transparent',
            transition: 'all 0.2s',
          }}
        >
          <p style={{ color: '#C9A96E', fontSize: 32, margin: '0 0 12px' }}>↑</p>
          <p style={{ color: '#ffffff', fontSize: 15, margin: '0 0 6px', fontWeight: 400 }}>
            Drag your PropHog CSV here
          </p>
          <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>or click to browse</p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {/* Step: Map Fields */}
      {step === 'map' && (
        <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
            <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 4px' }}>Field Mapping</p>
            <p style={{ color: '#6B8299', fontSize: 13, margin: 0 }}>{rows.length} rows found in {fileName}</p>
          </div>
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {headers.map(h => (
                <div key={h}>
                  <p style={{ color: '#9BB0C4', fontSize: 11, margin: '0 0 6px' }}>{h}</p>
                  <select
                    value={mapping[h] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div style={{ background: '#0C1E30', borderRadius: 4, padding: '16px 20px', marginBottom: 24, overflowX: 'auto' }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 12px' }}>Preview (first 5 rows)</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {headers.filter(h => mapping[h]).map(h => (
                      <th key={h} style={{ padding: '4px 12px 8px 0', color: '#6B8299', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {FIELD_OPTIONS.find(o => o.value === mapping[h])?.label.replace(' *', '') ?? mapping[h]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {headers.filter(h => mapping[h]).map(h => (
                        <td key={h} style={{ padding: '6px 12px 6px 0', color: '#9BB0C4', whiteSpace: 'nowrap' }}>
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 8px' }}>
                Worn Out Strategy
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                {[{ v: 'none', l: 'None — treat all as fresh leads' }, { v: 'flag_column', l: 'Use "Worn Out" column from CSV' }].map(opt => (
                  <label key={opt.v} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="radio" checked={wornOutStrategy === opt.v} onChange={() => setWornOutStrategy(opt.v as 'flag_column' | 'none')} />
                    <span style={{ color: '#9BB0C4', fontSize: 13 }}>{opt.l}</span>
                  </label>
                ))}
              </div>
            </div>

            <button onClick={handleConfirm} style={{
              padding: '10px 28px', background: '#C9A96E', color: '#142D48', border: 'none',
              borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && jobStats && (
        <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
            <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Ready to Import</p>
          </div>
          <div style={{ padding: '28px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'To Import', value: jobStats.toImport, color: '#4ade80' },
                { label: 'Skipped (duplicate/suppressed)', value: jobStats.skipped, color: '#f59e0b' },
                { label: 'Total in CSV', value: jobStats.total, color: '#ffffff' },
              ].map(s => (
                <div key={s.label} style={{ background: '#0C1E30', borderRadius: 4, padding: '16px 20px' }}>
                  <p style={{ color: '#6B8299', fontSize: 11, margin: '0 0 6px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</p>
                  <p style={{ color: s.color, fontSize: 24, fontWeight: 300, margin: 0 }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 24 }}>
              <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 8px' }}>
                Context (for AI email drafting later)
              </p>
              <textarea
                value={contextPrompt}
                onChange={e => setContextPrompt(e.target.value)}
                placeholder="e.g. These are State Farm agents. We want to show them AFF's higher income potential and mission-driven culture."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
              <p style={{ color: '#6B8299', fontSize: 11, margin: '6px 0 0' }}>
                Optional — you can also add this on the Outreach page later.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleImport} disabled={importing} style={{
                padding: '10px 28px', background: '#C9A96E', color: '#142D48', border: 'none',
                borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: 'pointer',
              }}>
                Import {jobStats.toImport} Contacts
              </button>
              <button onClick={() => setStep('map')} style={{
                padding: '10px 20px', background: 'transparent', color: '#6B8299',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, fontSize: 12, cursor: 'pointer',
              }}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'import' && importProgress && (
        <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', padding: '40px 48px', textAlign: 'center' }}>
          <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 16px' }}>
            {importProgress.status === 'RUNNING' ? 'Importing...' : importProgress.status === 'PAUSED' ? 'Daily Limit Reached' : 'Complete'}
          </p>
          <div style={{ width: '100%', background: '#0C1E30', borderRadius: 4, height: 6, margin: '0 0 16px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#C9A96E', borderRadius: 4,
              width: `${importProgress.total > 0 ? Math.round((importProgress.imported / importProgress.total) * 100) : 0}%`,
              transition: 'width 0.5s',
            }} />
          </div>
          <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 300, margin: '0 0 8px' }}>
            {importProgress.imported} / {importProgress.total}
          </p>
          {importProgress.status === 'PAUSED' && (
            <p style={{ color: '#f59e0b', fontSize: 13, margin: '12px 0 0' }}>
              Daily limit of 2,400 reached. Resume tomorrow or from the Dashboard.
            </p>
          )}
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(74,222,128,0.2)', padding: '48px', textAlign: 'center' }}>
          <p style={{ color: '#4ade80', fontSize: 28, margin: '0 0 12px' }}>✓</p>
          <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 300, margin: '0 0 8px' }}>Import complete</p>
          <p style={{ color: '#6B8299', fontSize: 13, margin: '0 0 28px' }}>
            Contacts are in GHL and your local database.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link href="/vault/outreach" style={{
              padding: '10px 24px', background: '#C9A96E', color: '#142D48',
              textDecoration: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              Draft Outreach Emails →
            </Link>
            <button onClick={() => { setStep('upload'); setFileName(''); setHeaders([]); setRows([]) }} style={{
              padding: '10px 20px', background: 'transparent', color: '#6B8299',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, fontSize: 12, cursor: 'pointer',
            }}>
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
