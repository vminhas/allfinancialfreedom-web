'use client'

// "Diagnose" button on each Recent Import row in /vault. Hits the
// /api/admin/import/[jobId]/diagnose endpoint and shows the actual
// state of the Contacts table for this job, so when the job's
// importedCount + skippedCount don't add up to totalRows you can
// see WHERE the rows went and (if needed) requeue orphans.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DiagnoseResult {
  job: {
    id: string
    fileName: string
    status: string
    totalRows: number
    importedCount: number
    skippedCount: number
    errorCount: number
    lastRowIndex: number
  }
  actuals: {
    contactsCreated: number
    withGhlContactId: number
    withoutGhlContactId: number
    orphansNeverAttempted: number
    stuckDuplicates: number
    statusBreakdown: Record<string, number>
  }
  gap: {
    reportedAccountedFor: number
    missingFromCounters: number
    neverProcessed: number
  }
}

export default function DiagnoseButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnoseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requeueing, setRequeueing] = useState(false)
  const router = useRouter()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/import/${jobId}/diagnose`)
      const data = await res.json() as DiagnoseResult & { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Diagnostic failed')
        return
      }
      setResult(data)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function requeueOrphans(clearStuck: boolean) {
    setRequeueing(true)
    setError(null)
    try {
      const url = `/api/admin/import/${jobId}/diagnose${clearStuck ? '?clearStuckDuplicates=true' : ''}`
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json() as { error?: string; stuckDuplicatesCleared?: number }
      if (!res.ok) {
        setError(data.error ?? 'Requeue failed')
        return
      }
      // Re-pull diagnostic to confirm new state, then nudge the parent
      // so the "Resume" button shows up if status flipped to PAUSED.
      await load()
      router.refresh()
    } finally {
      setRequeueing(false)
    }
  }

  function openAndLoad() {
    setOpen(true)
    if (!result) load()
  }

  return (
    <>
      <button
        onClick={openAndLoad}
        style={{
          padding: '4px 12px',
          background: 'transparent',
          color: '#9BB0C4',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          marginLeft: 6,
        }}
      >
        Diagnose
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#0F1E33', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 8, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(201,169,110,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Import Job Diagnostic</div>
                <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                  {result?.job.fileName ?? 'Loading...'}
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#9BB0C4', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {loading && <div style={{ color: '#6B8299', fontSize: 12 }}>Loading diagnostic...</div>}
              {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}

              {result && (
                <>
                  <Section title="What the job thinks happened">
                    <Row label="Total rows in CSV" value={result.job.totalRows} />
                    <Row label="Imported (counter)" value={result.job.importedCount} valueColor="#4ade80" />
                    <Row label="Skipped (counter)" value={result.job.skippedCount} valueColor="#9BB0C4" />
                    <Row label="Errors (counter)" value={result.job.errorCount} valueColor="#f87171" />
                    <Row label="Last row index" value={result.job.lastRowIndex} />
                    <Row label="Status" value={result.job.status} />
                  </Section>

                  <Section title="What's actually in the database">
                    <Row label="Contact rows created" value={result.actuals.contactsCreated} />
                    <Row label="With GHL contact id" value={result.actuals.withGhlContactId} valueColor="#4ade80" />
                    <Row label="Without GHL contact id" value={result.actuals.withoutGhlContactId} valueColor="#f59e0b" />
                    <Row label="Orphans (never attempted)" value={result.actuals.orphansNeverAttempted} valueColor={result.actuals.orphansNeverAttempted > 0 ? '#f87171' : '#9BB0C4'} />
                    <Row label="Stuck duplicates (no GHL id, status='duplicate')" value={result.actuals.stuckDuplicates} valueColor={result.actuals.stuckDuplicates > 0 ? '#f59e0b' : '#9BB0C4'} />
                  </Section>

                  <Section title="Status breakdown">
                    {Object.entries(result.actuals.statusBreakdown).map(([k, v]) => (
                      <Row key={k} label={k} value={v} />
                    ))}
                  </Section>

                  <Section title="Gap analysis">
                    <Row label="Reported accounted for (imported + skipped)" value={result.gap.reportedAccountedFor} />
                    <Row label="Missing from counters" value={result.gap.missingFromCounters} valueColor={result.gap.missingFromCounters > 0 ? '#f87171' : '#4ade80'} />
                    <Row label="Never processed (orphans + stuck)" value={result.gap.neverProcessed} valueColor={result.gap.neverProcessed > 0 ? '#f87171' : '#4ade80'} />
                  </Section>

                  {(result.gap.neverProcessed > 0 || result.gap.missingFromCounters > 0) && (
                    <div style={{ marginTop: 16, padding: 14, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6 }}>
                      <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, marginBottom: 8 }}>Recovery actions</div>
                      <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.6, marginBottom: 12 }}>
                        Reset the job's progress pointer and clear stuck duplicate flags so the (fixed) importer treats every untried row as pending again. Then click <strong>Resume</strong> on the job row.
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => requeueOrphans(false)}
                          disabled={requeueing}
                          style={{ padding: '6px 14px', background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: requeueing ? 'wait' : 'pointer' }}
                        >
                          {requeueing ? 'Requeueing...' : 'Requeue orphans'}
                        </button>
                        <button
                          onClick={() => requeueOrphans(true)}
                          disabled={requeueing}
                          style={{ padding: '6px 14px', background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: requeueing ? 'wait' : 'pointer' }}
                        >
                          Requeue + retry stuck duplicates
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>{title}</div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, padding: '8px 12px' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, valueColor = '#9BB0C4' }: { label: string; value: number | string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: '#6B8299' }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: 600 }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  )
}
