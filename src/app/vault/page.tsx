import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import GhlStatusWidget from '@/components/vault/GhlStatusWidget'
import ClaudeCostWidget from '@/components/vault/ClaudeCostWidget'

export default async function VaultDashboard() {
  const session = await getServerSession(authOptions)

  const [totalContacts, recentJobs, totalSent] = await Promise.all([
    db.contact.count(),
    db.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    db.outreachMessage.count({ where: { status: 'SENT' } }),
  ])

  const statusColors: Record<string, string> = {
    COMPLETE: '#4ade80',
    RUNNING: '#C9A96E',
    PAUSED: '#f59e0b',
    ERROR: '#f87171',
    PENDING: '#6B8299',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>
          Welcome back
        </p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>
          {session?.user?.name ?? 'Dashboard'}
        </h1>
      </div>

      {/* GHL Connector */}
      <GhlStatusWidget />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, margin: '24px 0' }}>
        {[
          { label: 'Total Contacts', value: totalContacts.toLocaleString() },
          { label: 'Emails Sent', value: totalSent.toLocaleString() },
          { label: 'Import Jobs', value: recentJobs.length },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#142D48', borderRadius: 6, padding: '24px 28px',
            border: '1px solid rgba(201,169,110,0.1)',
          }}>
            <p style={{ color: '#6B8299', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px' }}>
              {stat.label}
            </p>
            <p style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Claude Cost */}
      <ClaudeCostWidget />

      {/* Recent imports */}
      <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
          <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
            Recent Import Jobs
          </p>
        </div>
        {recentJobs.length === 0 ? (
          <div style={{ padding: '28px', color: '#6B8299', fontSize: 13, textAlign: 'center' }}>
            No imports yet. Head to Import to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['File', 'Imported', 'Skipped', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '12px 28px', textAlign: 'left', color: '#6B8299', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentJobs.map(job => (
                <tr key={job.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px 28px', color: '#ffffff', fontSize: 13 }}>{job.fileName}</td>
                  <td style={{ padding: '14px 28px', color: '#4ade80', fontSize: 13 }}>{job.importedCount}</td>
                  <td style={{ padding: '14px 28px', color: '#6B8299', fontSize: 13 }}>{job.skippedCount}</td>
                  <td style={{ padding: '14px 28px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: statusColors[job.status] ?? '#6B8299',
                    }}>
                      {job.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 28px', color: '#6B8299', fontSize: 12 }}>
                    {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
