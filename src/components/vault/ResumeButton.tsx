'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResumeButton({ jobId }: { jobId: string }) {
  const [resuming, setResuming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleResume() {
    setResuming(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to resume')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setResuming(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleResume}
        disabled={resuming}
        style={{
          padding: '4px 12px',
          background: resuming ? '#2a4a6a' : '#C9A96E',
          color: resuming ? '#4B5563' : '#142D48',
          border: 'none',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: resuming ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {resuming ? 'Resuming...' : 'Resume'}
      </button>
      {error && <span style={{ color: '#f87171', fontSize: 10 }}>{error}</span>}
    </div>
  )
}
