'use client'

import { useEffect, useState, useCallback } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

interface Presenter { name: string; role: string }

interface TrainingEvent {
  id: string
  driveFileId: string | null
  driveFileName: string | null
  driveThumbnailUrl: string | null
  flyerImageUrl: string | null
  published: boolean
  title: string
  subtitle: string | null
  category: string | null
  startsAt: string
  durationMinutes: number
  presenters: Presenter[] | unknown
  streamType: 'GFI_LIVE' | 'ZOOM'
  streamRoomName: string | null
  streamId: string | null
  passcode: string | null
  audienceRestriction: string | null
  partnerBrand: string | null
  targetRegion: string | null
  discordEventId: string | null
  reminderSentAt: string | null
  parseError: string | null
  manuallyEdited: boolean
}

interface TrainingsPayload {
  liveNow: TrainingEvent[]
  startingSoon: TrainingEvent[]
  upcoming: TrainingEvent[]
  recentPast: TrainingEvent[]
  parseErrors: TrainingEvent[]
  syncActivity: {
    lastCheckedAt: string | null
    lastUpdatedAt: string | null
  }
  stats: {
    totalUpcoming: number
    reminderQueue: number
    discordEventsCreated: number
    futureMissingDiscord: number
    parseErrorCount: number
  }
  configStatus: {
    googleApiKey: boolean
    driveFolderId: boolean
    anthropicConfigured: boolean
    discordBotToken: boolean
    discordGuildId: boolean
    discordChannelId: string
    cronSecret: boolean
  }
}

interface SyncResponse {
  scanned: number
  skippedExisting: number
  parsed: number
  parseErrors: number
  upserted: number
  discordEventsCreated: number
  discordErrors: number
  roundupPosted: boolean
  errors: { fileName: string; error: string }[]
}

export default function TrainingsPage() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<TrainingsPayload | null>(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testingDiscord, setTestingDiscord] = useState(false)
  const [discordTestResult, setDiscordTestResult] = useState<{
    ok: boolean
    summary: string
    checks: { step: string; ok: boolean; detail?: string }[]
    visibleGuilds?: { id: string; name: string }[]
    botName?: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/trainings')
    if (res.ok) setData(await res.json() as TrainingsPayload)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const previewAnnouncement = async () => {
    setSyncMsg(null)
    const res = await fetch('/api/admin/trainings/preview-announcement', { method: 'POST' })
    const d = await res.json() as { posted?: boolean; event?: { title: string }; error?: string }
    if (res.ok) {
      setSyncMsg({ ok: true, text: `✓ Preview announcement posted to Discord for: ${d.event?.title ?? 'next upcoming event'}` })
    } else {
      setSyncMsg({ ok: false, text: d.error ?? 'Failed to post preview' })
    }
  }

  const postWeeklyRoundup = async () => {
    setSyncMsg(null)
    const res = await fetch('/api/admin/trainings/post-roundup', { method: 'POST' })
    const d = await res.json() as { posted?: boolean; eventCount?: number; error?: string }
    if (res.ok && d.posted) {
      setSyncMsg({ ok: true, text: `📣 Weekly roundup posted to Discord with ${d.eventCount} training${d.eventCount === 1 ? '' : 's'}` })
    } else {
      setSyncMsg({ ok: false, text: d.error ?? 'Failed to post roundup' })
    }
  }

  const clearStaleErrors = async () => {
    setSyncMsg(null)
    const res = await fetch('/api/admin/trainings/clear-stale-errors', { method: 'POST' })
    const d = await res.json() as { cleared?: number; error?: string }
    if (res.ok) {
      setSyncMsg({ ok: true, text: `Cleared stale errors on ${d.cleared ?? 0} row(s). T-15 reminders will now fire for them.` })
      await load()
    } else {
      setSyncMsg({ ok: false, text: d.error ?? 'Failed to clear errors' })
    }
  }

  const runDiscordTest = async () => {
    setTestingDiscord(true)
    setDiscordTestResult(null)
    try {
      const res = await fetch('/api/admin/trainings/test-discord', { method: 'POST' })
      const data = await res.json() as {
        summary: string
        checks: { step: string; ok: boolean; detail?: string }[]
        visibleGuilds?: { id: string; name: string }[]
        botName?: string
      }
      setDiscordTestResult({ ok: res.ok, ...data })
    } catch (err) {
      setDiscordTestResult({
        ok: false,
        summary: err instanceof Error ? err.message : String(err),
        checks: [],
      })
    }
    setTestingDiscord(false)
  }

  const runSync = async (force: boolean) => {
    setSyncing(true)
    setSyncResult(null)
    setSyncMsg(null)
    try {
      const res = await fetch(`/api/admin/trainings/sync${force ? '?force=true' : ''}`, { method: 'POST' })
      const json = await res.json() as SyncResponse | { error: string }
      if (!res.ok || 'error' in json) {
        setSyncMsg({ ok: false, text: ('error' in json ? json.error : 'Sync failed') })
      } else {
        setSyncResult(json)
        const parts = [
          `Scanned ${json.scanned} files`,
          `${json.upserted} parsed`,
          `${json.skippedExisting} unchanged`,
          `${json.discordEventsCreated} Discord events created`,
        ]
        if (json.discordErrors > 0) parts.push(`${json.discordErrors} Discord errors`)
        if (json.roundupPosted) parts.push('📣 weekly roundup posted')
        setSyncMsg({ ok: true, text: parts.join(' · ') })
        await load()
      }
    } catch (err) {
      setSyncMsg({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
    setSyncing(false)
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 24,
        padding: isMobile ? '20px 0 18px' : '28px 0 24px',
        borderBottom: '1px solid rgba(201,169,110,0.08)',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
              All Financial Freedom
            </div>
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Training Calendar
            </h1>
            <p style={{ color: '#6B8299', fontSize: 13, margin: 0, lineHeight: 1.55 }}>
              Auto-synced hourly from the GFI Weekly Training Drive folder. Each flyer is parsed by Claude vision into a structured event. Announcements fire 15 minutes before each training starts in the <strong style={{ color: '#C9A96E' }}>training-and-events</strong> Discord channel.
            </p>
            {data?.syncActivity && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 10, color: '#6B8299' }}>
                <div>
                  <span style={{ fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9BB0C4' }}>Last checked:</span>{' '}
                  <span style={{ color: '#C9A96E' }}>{formatRelative(data.syncActivity.lastCheckedAt)}</span>
                </div>
                <div>
                  <span style={{ fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9BB0C4' }}>Last updated:</span>{' '}
                  <span style={{ color: '#C9A96E' }}>{formatRelative(data.syncActivity.lastUpdatedAt)}</span>
                </div>
              </div>
            )}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(120px, max-content))',
            gap: 8,
            flexShrink: 0,
            width: isMobile ? '100%' : 'auto',
          }}>
            <button
              onClick={() => setShowAddEvent(true)}
              style={{
                background: '#C9A96E', color: '#142D48',
                border: 'none', borderRadius: 4,
                padding: '12px 16px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
                minHeight: 44, width: '100%',
                gridColumn: isMobile ? '1 / -1' : undefined,
              }}
            >
              + Add Event
            </button>
            <button
              onClick={() => runSync(false)}
              disabled={syncing}
              style={{
                background: 'transparent', color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4,
                padding: '12px 16px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: syncing ? 'wait' : 'pointer',
                minHeight: 44, width: '100%',
              }}
            >
              {syncing ? 'Syncing...' : '↻ Sync Now'}
            </button>
            <button
              onClick={() => runSync(true)}
              disabled={syncing}
              title="Re-parse every file even if unchanged. Use after tweaking the prompt."
              style={{
                background: 'transparent',
                color: '#9BB0C4',
                border: '1px solid rgba(201,169,110,0.25)',
                borderRadius: 4,
                padding: '12px 12px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: syncing ? 'wait' : 'pointer',
                minHeight: 44, width: '100%',
              }}
            >
              Force
            </button>
            <button
              onClick={runDiscordTest}
              disabled={testingDiscord}
              title="Verify the Discord bot can reach the configured guild + channel"
              style={{
                background: 'transparent',
                color: '#9B6DFF',
                border: '1px solid rgba(155,109,255,0.35)',
                borderRadius: 4,
                padding: '12px 12px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: testingDiscord ? 'wait' : 'pointer',
                minHeight: 44, width: '100%',
              }}
            >
              {testingDiscord ? 'Testing...' : '🛠 Test Discord'}
            </button>
            <button
              onClick={clearStaleErrors}
              title="Wipe stale parseError strings on rows that already have a valid Discord event — unblocks T-15 reminders"
              style={{
                background: 'transparent',
                color: '#6B8299',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                padding: '12px 12px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
                minHeight: 44, width: '100%',
              }}
            >
              Clear Errors
            </button>
            <button
              onClick={postWeeklyRoundup}
              title="Post a fresh @everyone weekly roundup covering every current + upcoming training in the next 7 days. Use this to correct or update the roundup at any time."
              style={{
                background: 'transparent',
                color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.45)',
                borderRadius: 4,
                padding: '12px 12px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
                minHeight: 44, width: '100%',
                gridColumn: isMobile ? '1 / -1' : undefined,
              }}
            >
              📢 Post Week Roundup
            </button>
            <button
              onClick={previewAnnouncement}
              title="Post a 'live now' announcement for the next upcoming event so you can see what the T-15 reminder looks like in the real channel"
              style={{
                background: 'transparent',
                color: '#4ade80',
                border: '1px solid rgba(74,222,128,0.35)',
                borderRadius: 4,
                padding: '12px 12px', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
                minHeight: 44, width: '100%',
                gridColumn: isMobile ? '1 / -1' : undefined,
              }}
            >
              📣 Preview
            </button>
          </div>
        </div>
        {syncMsg && (
          <div style={{
            marginTop: 14, fontSize: 12,
            color: syncMsg.ok ? '#4ade80' : '#f87171',
            padding: '10px 14px',
            background: syncMsg.ok ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
            border: `1px solid ${syncMsg.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
            borderRadius: 4,
          }}>
            {syncMsg.ok ? '✓ ' : '✗ '}{syncMsg.text}
            {syncResult && syncResult.errors.length > 0 && (
              <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18, color: '#f87171', fontSize: 11 }}>
                {syncResult.errors.map((e, i) => (
                  <li key={i}>{e.fileName}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {discordTestResult && (
          <div style={{
            marginTop: 14,
            padding: '14px 16px',
            background: discordTestResult.ok ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
            border: `1px solid ${discordTestResult.ok ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.3)'}`,
            borderRadius: 6,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
              color: discordTestResult.ok ? '#4ade80' : '#f87171',
              marginBottom: 10,
            }}>
              Discord smoke test {discordTestResult.ok ? '· passed' : '· failed'}
            </div>
            <div style={{ fontSize: 12, color: '#d1d9e2', marginBottom: 10 }}>
              {discordTestResult.summary}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#9BB0C4', lineHeight: 1.6 }}>
              {discordTestResult.checks.map((c, i) => (
                <li key={i}>
                  <span style={{ color: c.ok ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                    {c.ok ? '✓' : '✗'}
                  </span>{' '}
                  {c.step}
                  {c.detail && (
                    <div style={{ color: '#6B8299', fontSize: 10, marginTop: 2, marginLeft: 14, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {c.detail}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {discordTestResult.visibleGuilds && discordTestResult.visibleGuilds.length > 0 && (
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: 'rgba(155,109,255,0.06)',
                border: '1px solid rgba(155,109,255,0.25)',
                borderRadius: 4,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9B6DFF', marginBottom: 6 }}>
                  Guilds the bot can see — copy the right ID into DISCORD_GUILD_ID
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#d1d9e2', lineHeight: 1.6 }}>
                  {discordTestResult.visibleGuilds.map(g => (
                    <li key={g.id}>
                      <strong>{g.name}</strong> — <code style={{ color: '#C9A96E', fontFamily: 'monospace', userSelect: 'all' }}>{g.id}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      {data && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}>
          <StatCard label="Upcoming" value={data.stats.totalUpcoming} color="#C9A96E" />
          <StatCard label="Reminder Queue" value={data.stats.reminderQueue} color="#9B6DFF" />
          <StatCard label="Discord Events" value={data.stats.discordEventsCreated} color="#4ade80" />
          <StatCard label="Parse Errors" value={data.stats.parseErrorCount} color={data.stats.parseErrorCount > 0 ? '#f87171' : '#6B8299'} />
        </div>
      )}

      {/* Integration / config status */}
      {data && <ConfigStatusPanel config={data.configStatus} futureMissingDiscord={data.stats.futureMissingDiscord} />}

      {loading ? (
        <div style={{ color: '#6B8299', fontSize: 13, padding: '40px 0' }}>Loading training events...</div>
      ) : !data || (data.liveNow.length === 0 && data.startingSoon.length === 0 && data.upcoming.length === 0 && data.recentPast.length === 0) ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(201,169,110,0.15)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 14, color: '#9BB0C4', marginBottom: 4 }}>No training events yet</div>
          <div style={{ fontSize: 12, color: '#6B8299' }}>
            Click <strong style={{ color: '#C9A96E' }}>Sync Now</strong> above to pull from Drive, or wait for the hourly cron.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {data.liveNow.length > 0 && <Section label="🔴 Live Now" color="#f87171" highlight events={data.liveNow} onUpdate={() => load()} onDelete={() => load()} />}
          {data.startingSoon.length > 0 && <Section label="Starting Soon (next 60 minutes)" color="#C9A96E" highlight events={data.startingSoon} onUpdate={() => load()} onDelete={() => load()} />}
          {data.upcoming.length > 0 && <Section label="Upcoming" color="#9BB0C4" events={data.upcoming} onUpdate={() => load()} onDelete={() => load()} />}
          {data.parseErrors.length > 0 && <Section label="Parse Errors" color="#f87171" events={data.parseErrors} onUpdate={() => load()} onDelete={() => load()} />}
          {data.recentPast.length > 0 && <Section label="Recent Past" color="#6B8299" events={data.recentPast} muted onUpdate={() => load()} onDelete={() => load()} />}
        </div>
      )}

      {showAddEvent && (
        <AddEventModal
          onClose={() => setShowAddEvent(false)}
          onCreated={() => { setShowAddEvent(false); load() }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#142D48',
      border: '1px solid rgba(201,169,110,0.08)',
      borderRadius: 6, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function ConfigStatusPanel({
  config,
  futureMissingDiscord,
}: {
  config: TrainingsPayload['configStatus']
  futureMissingDiscord: number
}) {
  const checks: { label: string; ok: boolean; help?: string }[] = [
    { label: 'GOOGLE_API_KEY', ok: config.googleApiKey, help: 'Required to list/download from Drive' },
    { label: 'GDRIVE_TRAINING_FOLDER_ID', ok: config.driveFolderId, help: 'Which Drive folder to scan' },
    { label: 'DISCORD_BOT_TOKEN', ok: config.discordBotToken, help: 'Required for scheduled events + T-15 reminders' },
    { label: 'DISCORD_GUILD_ID', ok: config.discordGuildId, help: 'Your AFF Discord server ID' },
    { label: 'CRON_SECRET', ok: config.cronSecret, help: 'Used by Vercel cron to authenticate' },
  ]
  const missing = checks.filter(c => !c.ok)
  const allOk = missing.length === 0

  // The most actionable warning: future events exist but they don't have Discord events
  // AND Discord is configured. Tells admin "click Sync Now to backfill".
  const shouldNudgeBackfill = futureMissingDiscord > 0 && config.discordBotToken && config.discordGuildId

  return (
    <div style={{
      marginBottom: 24,
      padding: '16px 20px',
      background: allOk ? 'rgba(74,222,128,0.04)' : 'rgba(245,158,11,0.05)',
      border: `1px solid ${allOk ? 'rgba(74,222,128,0.18)' : 'rgba(245,158,11,0.25)'}`,
      borderRadius: 8,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: allOk ? '#4ade80' : '#f59e0b',
        marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        Integration Status {allOk ? '· all set' : `· ${missing.length} missing`}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 8,
      }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              fontSize: 12,
              color: c.ok ? '#4ade80' : '#f59e0b',
              flexShrink: 0,
              marginTop: 1,
            }}>
              {c.ok ? '✓' : '✗'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: c.ok ? '#9BB0C4' : '#ffffff', fontFamily: 'monospace' }}>
                {c.label}
              </div>
              {c.help && (
                <div style={{ fontSize: 9, color: '#6B8299', marginTop: 1 }}>{c.help}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {shouldNudgeBackfill && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(155,109,255,0.06)',
          border: '1px solid rgba(155,109,255,0.25)',
          borderRadius: 4,
          fontSize: 11, color: '#9BB0C4', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#9B6DFF' }}>{futureMissingDiscord}</strong> future event{futureMissingDiscord === 1 ? '' : 's'} {futureMissingDiscord === 1 ? 'is' : 'are'} missing a Discord scheduled event. Click <strong style={{ color: '#C9A96E' }}>Sync Now</strong> to backfill — no re-parsing happens, just Discord event creation.
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 9, color: '#4B5563' }}>
        Channel for T-15 reminders: <span style={{ fontFamily: 'monospace', color: '#6B8299' }}>{config.discordChannelId}</span>
      </div>
    </div>
  )
}

function Section({ label, color, events, highlight, muted, onUpdate, onDelete }: {
  label: string
  color: string
  events: TrainingEvent[]
  highlight?: boolean
  muted?: boolean
  onUpdate?: (updated: TrainingEvent) => void
  onDelete?: (id: string) => void
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color, marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {label}
        <span style={{ fontSize: 9, color: '#6B8299', fontWeight: 500, letterSpacing: '0.05em' }}>({events.length})</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 12,
      }}>
        {events.map(ev => <TrainingCard key={ev.id} event={ev} highlight={highlight} muted={muted} onUpdate={onUpdate} onDelete={onDelete} />)}
      </div>
    </div>
  )
}

function TrainingCard({ event, highlight, muted, onUpdate, onDelete }: {
  event: TrainingEvent
  highlight?: boolean
  muted?: boolean
  onUpdate?: (updated: TrainingEvent) => void
  onDelete?: (id: string) => void
}) {
  const presenters = Array.isArray(event.presenters) ? event.presenters as Presenter[] : []
  const startsAt = new Date(event.startsAt)
  const day = startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })
  const isError = !!event.parseError

  const [posting, setPosting] = useState(false)
  const [postStatus, setPostStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [postError, setPostError] = useState('')
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const togglePublished = async () => {
    setToggling(true)
    try {
      const res = await fetch(`/api/admin/trainings/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !event.published }),
      })
      if (res.ok) {
        const d = await res.json() as { event: TrainingEvent }
        onUpdate?.(d.event)
      }
    } finally { setToggling(false) }
  }

  const deleteEvent = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/trainings/${event.id}`, { method: 'DELETE' })
      if (res.ok) onDelete?.(event.id)
    } finally { setDeleting(false) }
  }

  const postToDiscord = async () => {
    setPosting(true)
    setPostStatus('idle')
    setPostError('')
    try {
      const res = await fetch('/api/admin/trainings/preview-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id }),
      })
      const data = await res.json() as { posted?: boolean; error?: string }
      if (res.ok && data.posted) {
        setPostStatus('success')
        setTimeout(() => setPostStatus('idle'), 4000)
      } else {
        setPostStatus('error')
        setPostError(data.error ?? 'Failed to post')
      }
    } catch (err) {
      setPostStatus('error')
      setPostError(err instanceof Error ? err.message : String(err))
    }
    setPosting(false)
  }

  const imageUrl = event.flyerImageUrl ?? event.driveThumbnailUrl
  const [resyncing, setResyncing] = useState(false)

  const resyncImage = async () => {
    if (!event.driveFileId) return
    setResyncing(true)
    try {
      const res = await fetch(`/api/admin/trainings/${event.id}/resync-image`, { method: 'POST' })
      if (res.ok) onUpdate?.({ ...event, flyerImageUrl: (await res.json()).flyerImageUrl } as TrainingEvent)
    } finally { setResyncing(false) }
  }

  return (
    <div style={{
      position: 'relative',
      borderRadius: 8,
      overflow: 'hidden',
      border: `1px solid ${
        isError ? 'rgba(248,113,113,0.35)'
        : !event.published ? 'rgba(107,130,153,0.25)'
        : highlight ? 'rgba(201,169,110,0.55)'
        : 'rgba(201,169,110,0.12)'
      }`,
      opacity: muted ? 0.65 : 1,
      boxShadow: highlight ? '0 0 30px rgba(201,169,110,0.2)' : '0 2px 12px rgba(0,0,0,0.15)',
      background: '#0C1E30',
    }}>
      {/* Flyer image at the TOP — clearly visible, lightly darkened.
          Fades into solid dark background via a long gradient.
          All text lives BELOW the fade on a near-opaque surface. */}
      {imageUrl && (
        <div style={{ position: 'relative', height: 180 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top center',
            }}
          />
          {/* Gradient fade: image → solid dark background.
              The bottom 30% of the image zone is near-opaque so the
              transition into the text area is seamless. */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(12,30,48,0.08) 0%, rgba(12,30,48,0.15) 40%, rgba(12,30,48,0.6) 70%, rgba(12,30,48,0.95) 90%, #0C1E30 100%)',
          }} />
        </div>
      )}

      {/* Card content — on solid dark background, fully legible */}
      <div style={{
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginTop: imageUrl ? -20 : 0,
        position: 'relative',
        zIndex: 1,
      }}>
      {/* No-image warning + resync button */}
      {!imageUrl && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 10px', marginBottom: 2,
          background: 'rgba(245,158,11,0.06)',
          border: '1px dashed rgba(245,158,11,0.25)',
          borderRadius: 4,
          fontSize: 10, color: '#f59e0b',
        }}>
          <span>📷 No image — T-15 will post text-only</span>
          {event.driveFileId && (
            <button
              onClick={resyncImage}
              disabled={resyncing}
              style={{
                background: 'rgba(201,169,110,0.12)',
                border: '1px solid rgba(201,169,110,0.3)',
                borderRadius: 3,
                padding: '4px 8px', fontSize: 9, fontWeight: 700,
                color: '#C9A96E', cursor: resyncing ? 'wait' : 'pointer',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}
            >
              {resyncing ? '...' : '↻ Fix'}
            </button>
          )}
        </div>
      )}
      {/* Date strip + publish toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: event.published ? '#C9A96E' : '#6B8299' }}>
          {day} · {time}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {!event.published && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 3,
              background: 'rgba(107,130,153,0.12)', border: '1px solid rgba(107,130,153,0.35)', color: '#6B8299',
            }}>
              Unpublished
            </span>
          )}
          {event.discordEventId && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 3,
              background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80',
            }}>
              Discord ✓
            </span>
          )}
          {event.reminderSentAt && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 3,
              background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.35)', color: '#9B6DFF',
            }}>
              Notified
            </span>
          )}
          {/* Publish toggle */}
          <button
            onClick={togglePublished}
            disabled={toggling}
            title={event.published ? 'Unpublish — removes Discord event + skips T-15 reminder' : 'Publish — creates Discord event + enables T-15 reminder'}
            style={{
              background: event.published ? '#C9A96E' : 'rgba(107,130,153,0.2)',
              border: 'none', borderRadius: 10,
              width: 36, height: 18,
              position: 'relative',
              cursor: toggling ? 'wait' : 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 14, height: 14,
              borderRadius: '50%',
              background: '#ffffff',
              position: 'absolute',
              top: 2,
              left: event.published ? 20 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        {event.category && (
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9B6DFF', marginBottom: 3 }}>
            {event.category}
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', lineHeight: 1.3 }}>{event.title}</div>
        {event.subtitle && (
          <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 3 }}>{event.subtitle}</div>
        )}
      </div>

      {/* Presenters */}
      {presenters.length > 0 && (
        <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.5 }}>
          {presenters.map((p, i) => (
            <span key={i}>
              <strong style={{ color: '#ffffff' }}>{p.name}</strong>
              {p.role && <span style={{ color: '#6B8299' }}> · {p.role}</span>}
              {i < presenters.length - 1 && <br />}
            </span>
          ))}
        </div>
      )}

      {/* Stream + tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 11 }}>
        <span style={{ color: '#6B8299' }}>{event.streamType === 'GFI_LIVE' ? '📺' : '🎥'}</span>
        {event.streamId ? (
          <a
            href={`https://zoom.us/j/${event.streamId.replace(/[\s-]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#9B6DFF',
              textDecoration: 'none',
              fontFamily: 'monospace',
              fontWeight: 600,
              borderBottom: '1px dashed rgba(155,109,255,0.4)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {event.streamId}
          </a>
        ) : (
          <span style={{ color: '#4B5563' }}>—</span>
        )}
        {event.passcode && (
          <span style={{ color: '#6B8299' }}>
            · pw <span style={{ color: '#C9A96E', fontFamily: 'monospace', userSelect: 'all' }}>{event.passcode}</span>
          </span>
        )}
      </div>
      {(event.audienceRestriction || event.targetRegion || event.partnerBrand) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {event.audienceRestriction && (
            <Tag color="#f87171">🔒 {event.audienceRestriction}</Tag>
          )}
          {event.targetRegion && <Tag color="#9B6DFF">🌍 {event.targetRegion}</Tag>}
          {event.partnerBrand && <Tag color="#C9A96E">🤝 {event.partnerBrand}</Tag>}
        </div>
      )}

      {event.parseError && (
        <div style={{
          fontSize: 10, color: '#f87171',
          padding: '6px 8px',
          background: 'rgba(248,113,113,0.06)',
          borderRadius: 3,
          border: '1px solid rgba(248,113,113,0.2)',
        }}>
          ⚠ {event.parseError}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginTop: 'auto', paddingTop: 8,
        borderTop: '1px dashed rgba(201,169,110,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {event.driveFileName ?? 'Manual event'}
            {event.manuallyEdited && <span style={{ color: '#C9A96E' }}> · edited</span>}
            {!event.driveFileId && <span style={{ color: '#9B6DFF' }}> · custom</span>}
          </div>
          {/* Delete button */}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete this event"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#6B8299', fontSize: 12, padding: '2px 4px', flexShrink: 0,
                opacity: 0.5, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
            >
              🗑
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: '#f87171' }}>Delete?</span>
              <button
                onClick={deleteEvent}
                disabled={deleting}
                style={{ background: '#f87171', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 9, fontWeight: 700, cursor: deleting ? 'wait' : 'pointer' }}
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ background: 'transparent', color: '#6B8299', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '2px 6px', fontSize: 9, cursor: 'pointer' }}
              >
                No
              </button>
            </div>
          )}
        </div>
        <button
          onClick={postToDiscord}
          disabled={posting || !event.published}
          title={event.published ? 'Post this event to the Discord training-and-events channel' : 'Publish the event first to post to Discord'}
          style={{
            background: postStatus === 'success' ? 'rgba(74,222,128,0.14)' : postStatus === 'error' ? 'rgba(248,113,113,0.14)' : 'transparent',
            color: !event.published ? '#4B5563' : postStatus === 'success' ? '#4ade80' : postStatus === 'error' ? '#f87171' : '#9B6DFF',
            border: `1px solid ${postStatus === 'success' ? 'rgba(74,222,128,0.4)' : postStatus === 'error' ? 'rgba(248,113,113,0.4)' : !event.published ? 'rgba(255,255,255,0.08)' : 'rgba(155,109,255,0.35)'}`,
            borderRadius: 3,
            padding: '6px 10px',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: posting || !event.published ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            minHeight: 28,
          }}
        >
          {posting ? 'Posting...' : postStatus === 'success' ? '✓ Posted' : postStatus === 'error' ? '✗ Failed' : '📣 Post'}
        </button>
      </div>
      {postStatus === 'error' && postError && (
        <div style={{ fontSize: 9, color: '#f87171', marginTop: -4 }}>{postError}</div>
      )}
      </div>{/* close card content */}
    </div>
  )
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (isNaN(then)) return 'never'
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 3,
      background: `${color}14`,
      border: `1px solid ${color}40`,
      color,
    }}>
      {children}
    </span>
  )
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

function AddEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    title: '',
    startsAt: '',
    startsAtTime: '12:00',
    durationMinutes: '60',
    subtitle: '',
    category: '',
    streamType: 'GFI_LIVE' as 'GFI_LIVE' | 'ZOOM',
    streamRoomName: 'GFI Live - Impact TV',
    streamId: '',
    passcode: '',
    audienceRestriction: '',
    partnerBrand: '',
    presenterName: '',
    presenterRole: '',
  })
  const [image, setImage] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.startsAt) { setError('Title and date are required'); return }
    setSubmitting(true)
    setError('')

    const startsAtIso = new Date(`${form.startsAt}T${form.startsAtTime}:00`).toISOString()
    const presenters = form.presenterName
      ? [{ name: form.presenterName, role: form.presenterRole || 'Presenter' }]
      : []

    const fd = new FormData()
    fd.append('title', form.title)
    fd.append('startsAt', startsAtIso)
    fd.append('durationMinutes', form.durationMinutes)
    if (form.subtitle) fd.append('subtitle', form.subtitle)
    if (form.category) fd.append('category', form.category)
    fd.append('streamType', form.streamType)
    if (form.streamRoomName) fd.append('streamRoomName', form.streamRoomName)
    if (form.streamId) fd.append('streamId', form.streamId)
    if (form.passcode) fd.append('passcode', form.passcode)
    if (form.audienceRestriction) fd.append('audienceRestriction', form.audienceRestriction)
    if (form.partnerBrand) fd.append('partnerBrand', form.partnerBrand)
    if (presenters.length > 0) fd.append('presenters', JSON.stringify(presenters))
    if (image) fd.append('flyerImage', image)

    try {
      const res = await fetch('/api/admin/trainings/create', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to create event')
        setSubmitting(false)
        return
      }
      onCreated()
    } catch {
      setError('Network error')
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0A1628',
    border: '1px solid rgba(201,169,110,0.15)',
    borderRadius: 4, color: '#d1d9e2',
    padding: '10px 12px', fontSize: 13,
    fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: '#C9A96E',
    marginBottom: 5,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
        backdropFilter: 'blur(3px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#142D48',
        border: '1px solid rgba(201,169,110,0.2)',
        borderRadius: isMobile ? '16px 16px 0 0' : 8,
        width: isMobile ? '100%' : 'min(560px, 100vw)',
        maxHeight: isMobile ? '92vh' : '90vh',
        overflowY: 'auto',
        boxShadow: '0 -24px 80px rgba(0,0,0,0.55)',
      }}>
        <div style={{
          padding: isMobile ? '18px 20px 14px' : '22px 28px 16px',
          borderBottom: '1px solid rgba(201,169,110,0.1)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          position: 'sticky', top: 0, background: '#142D48', zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 4 }}>
              New Training
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff' }}>Create a custom event</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 6, width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#C9A96E', fontSize: 16, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: isMobile ? '18px 20px 20px' : '22px 28px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: isMobile ? undefined : '1 / -1' }}>
              <label style={labelStyle}>Title *</label>
              <input required value={form.title} onChange={set('title')} placeholder="e.g. AFF Team Training" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Date *</label>
              <input required type="date" value={form.startsAt} onChange={set('startsAt')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Time (ET) *</label>
              <input required type="time" value={form.startsAtTime} onChange={set('startsAtTime')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Duration (min)</label>
              <input type="number" value={form.durationMinutes} onChange={set('durationMinutes')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Subtitle</label>
              <input value={form.subtitle} onChange={set('subtitle')} placeholder="Optional tagline" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <input value={form.category} onChange={set('category')} placeholder="e.g. Technology Tuesday" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Stream type</label>
              <select value={form.streamType} onChange={set('streamType')} style={{ ...inputStyle, appearance: 'auto' }}>
                <option value="GFI_LIVE">GFI Live - Impact TV</option>
                <option value="ZOOM">Zoom</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Stream / Meeting ID</label>
              <input value={form.streamId} onChange={set('streamId')} placeholder="e.g. 839 5426 5128" style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={labelStyle}>Passcode</label>
              <input value={form.passcode} onChange={set('passcode')} placeholder="e.g. 776748" style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={labelStyle}>Presenter name</label>
              <input value={form.presenterName} onChange={set('presenterName')} placeholder="e.g. Vick Minhas" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Presenter role</label>
              <input value={form.presenterRole} onChange={set('presenterRole')} placeholder="e.g. CEO" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Audience restriction</label>
              <input value={form.audienceRestriction} onChange={set('audienceRestriction')} placeholder="e.g. CFTs & Above Only" style={inputStyle} />
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label style={labelStyle}>Flyer image (optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={e => setImage(e.target.files?.[0] ?? null)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#0A1628',
                border: '1px dashed rgba(201,169,110,0.3)',
                borderRadius: 4, color: '#9BB0C4',
                padding: '14px 12px', fontSize: 12,
              }}
            />
            {image && (
              <div style={{ fontSize: 10, color: '#4ade80', marginTop: 4 }}>
                {image.name} ({(image.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'flex', gap: 10,
            flexDirection: isMobile ? 'column-reverse' : 'row',
            justifyContent: 'flex-end',
            paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <button type="button" onClick={onClose} disabled={submitting} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: '#9BB0C4', borderRadius: 4,
              padding: '12px 18px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: submitting ? 'wait' : 'pointer', minHeight: 44,
            }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={{
              background: submitting ? 'rgba(201,169,110,0.4)' : '#C9A96E',
              color: '#142D48', border: 'none', borderRadius: 4,
              padding: '12px 22px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: submitting ? 'wait' : 'pointer', minHeight: 44, flex: 1,
            }}>
              {submitting ? 'Creating...' : 'Create & Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
