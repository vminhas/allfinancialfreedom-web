import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHASE_ITEMS, PHASE_GROUPS } from '@/lib/agent-constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [dbItems, dbGroups] = await Promise.all([
    db.phaseItemDefinition.findMany({
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
    }),
    db.phaseGroupDefinition.findMany({
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
    }),
  ])

  // Group definitions in the DB may carry banner videos (Melinee's
  // welcome series, future per-step content). When DB groups exist
  // we surface them by phase so the agent dashboard can render the
  // video at the top of each step. Otherwise fall back to the
  // bundled constants which don't have videos.
  const groupsByPhase: Record<number, Array<{
    key: string
    label: string
    icon: string | null
    description: string | null
    showTrainer: boolean
    videos: Array<{ url: string; title: string | null; orientation?: 'landscape' | 'portrait' }>
  }>> = {}
  for (const g of dbGroups) {
    if (!groupsByPhase[g.phase]) groupsByPhase[g.phase] = []
    const rawVideos = Array.isArray(g.videos) ? (g.videos as Array<{ url?: string; title?: string | null; orientation?: string }>) : []
    groupsByPhase[g.phase].push({
      key: g.groupKey,
      label: g.label,
      icon: g.icon ?? null,
      description: g.description ?? null,
      showTrainer: g.showTrainer ?? false,
      videos: rawVideos
        .filter(v => v && typeof v.url === 'string' && v.url.length > 0)
        .map(v => ({
          url: v.url!,
          title: v.title ?? null,
          orientation: v.orientation === 'portrait' ? 'portrait' as const : 'landscape' as const,
        })),
    })
  }

  if (dbItems.length > 0) {
    const itemsByPhase: Record<number, typeof dbItems> = {}
    for (const item of dbItems) {
      if (!itemsByPhase[item.phase]) itemsByPhase[item.phase] = []
      itemsByPhase[item.phase].push(item)
    }
    return NextResponse.json({
      items: itemsByPhase,
      groups: dbGroups.length > 0 ? groupsByPhase : PHASE_GROUPS,
      source: 'database',
    })
  }

  return NextResponse.json({
    items: PHASE_ITEMS,
    groups: dbGroups.length > 0 ? groupsByPhase : PHASE_GROUPS,
    source: 'constants',
  })
}
