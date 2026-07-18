import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { getSetting, setSetting } from '@/lib/settings'

// Manual "development tracks": admin-curated parallel designations (CFT track,
// MD track, custom) layered on top of the automatic funnel blocker. Stored in
// the settings key-value store so there's no schema migration.
const KEY = 'progress_tracks'
const DEFAULT_DEFS = [
  { key: 'cft', label: 'CFT track' },
  { key: 'md', label: 'Marketing Director track' },
]

interface TracksData {
  defs: { key: string; label: string }[]
  assignments: Record<string, string[]> // agentCode -> track keys
}

async function load(): Promise<TracksData> {
  const raw = await getSetting(KEY)
  if (!raw) return { defs: [...DEFAULT_DEFS], assignments: {} }
  try {
    const d = JSON.parse(raw) as Partial<TracksData>
    return {
      defs: Array.isArray(d.defs) && d.defs.length ? d.defs : [...DEFAULT_DEFS],
      assignments: (d.assignments && typeof d.assignments === 'object') ? d.assignments : {},
    }
  } catch {
    return { defs: [...DEFAULT_DEFS], assignments: {} }
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export async function GET() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied
  return NextResponse.json(await load())
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin')
  if (denied) return denied

  const body = await req.json() as { action: string; code?: string; trackKey?: string; key?: string; label?: string }
  const data = await load()

  switch (body.action) {
    case 'assign': {
      if (!body.code || !body.trackKey) return NextResponse.json({ error: 'code + trackKey required' }, { status: 400 })
      const set = new Set(data.assignments[body.code] ?? [])
      set.add(body.trackKey)
      data.assignments[body.code] = [...set]
      break
    }
    case 'unassign': {
      if (!body.code || !body.trackKey) return NextResponse.json({ error: 'code + trackKey required' }, { status: 400 })
      const next = (data.assignments[body.code] ?? []).filter(k => k !== body.trackKey)
      if (next.length) data.assignments[body.code] = next
      else delete data.assignments[body.code]
      break
    }
    case 'addTrack': {
      const label = (body.label ?? '').trim()
      if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 })
      let key = slug(label) || `track-${data.defs.length + 1}`
      let n = 2
      while (data.defs.some(d => d.key === key)) { key = `${slug(label)}-${n}`; n++ }
      data.defs.push({ key, label })
      break
    }
    case 'renameTrack': {
      const d = data.defs.find(x => x.key === body.key)
      if (d && (body.label ?? '').trim()) d.label = body.label!.trim()
      break
    }
    case 'removeTrack': {
      data.defs = data.defs.filter(d => d.key !== body.key)
      for (const code of Object.keys(data.assignments)) {
        data.assignments[code] = data.assignments[code].filter(k => k !== body.key)
        if (!data.assignments[code].length) delete data.assignments[code]
      }
      break
    }
    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  await setSetting(KEY, JSON.stringify(data))
  return NextResponse.json(data)
}
