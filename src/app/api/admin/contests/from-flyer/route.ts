import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { parseContestFlyer } from '@/lib/contest-parser'

// Flyer parsing + DB write can take 30s+ on a busy Anthropic queue.
export const maxDuration = 180

// POST /api/admin/contests/from-flyer
//
// Accepts a single image (multipart 'image' field). Either:
//   - classifies as not a contest → 200 { kind: 'not_contest', reason }
//   - extracts a contest config and creates a draft (active=false)
//     → 200 { kind: 'contest', contestId }
//
// Auth: admin session OR x-cron-secret header (Discord bot path,
// matches the existing /api/admin/trainings/parse-image pattern).
//
// Drafts land inactive on purpose. Admin reviews + flips active=true
// from /vault/contests so the bot can't accidentally surface a wrong
// config to agents.
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const isCronAuth = cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET

  if (!isCronAuth) {
    const session = await getServerSession(authOptions)
    const denied = requireRole(session, 'admin')
    if (denied) return denied
  }

  const form = await req.formData()
  const file = form.get('image') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  // Detect actual image type from magic bytes — Discord/mobile uploads
  // sometimes send the wrong Content-Type header.
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  const mimeType: 'image/jpeg' | 'image/png' = isPng ? 'image/png' : 'image/jpeg'

  let parsed
  try {
    parsed = await parseContestFlyer({ imageBytes: bytes, mimeType })
  } catch (err) {
    return NextResponse.json({
      error: `Failed to parse image: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }

  if (parsed.kind !== 'contest' || !parsed.contest) {
    return NextResponse.json({ kind: 'not_contest', reason: parsed.reason ?? null })
  }

  const c = parsed.contest

  // Validate / coerce. parseContestFlyer is structured-output via tool
  // use, so the model already obeyed the enum constraints. Belt-and-
  // braces guard for stray dates / counts.
  const validAnchors = new Set(['ICA_DATE', 'ONBOARDING', 'PHASE_START', 'FIXED'])
  if (!validAnchors.has(c.anchor)) {
    return NextResponse.json({ kind: 'not_contest', reason: `Invalid anchor: ${c.anchor}` })
  }

  const validReqTypes = new Set(['PHASE_ITEM', 'MILESTONE', 'RECRUITS', 'POLICIES', 'MANUAL', 'CUSTOM_TEXT'])
  const cleanReqs = (c.requirements ?? [])
    .filter(r => r.label?.trim() && validReqTypes.has(r.type))
    .map((r, i) => ({
      order: i,
      label: r.label.trim().slice(0, 200),
      type: r.type,
      phaseItemKey: r.phaseItemKey?.trim() || null,
      milestoneKey: r.milestoneKey?.trim() || null,
      count: r.count ?? null,
    }))

  const toDate = (v: string | null | undefined): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  const created = await db.contest.create({
    data: {
      title: c.title?.trim().slice(0, 200) || 'Untitled contest from flyer',
      description: c.description?.trim() || null,
      rewardAmount: typeof c.rewardAmount === 'number' ? c.rewardAmount : null,
      rewardLabel: c.rewardLabel?.trim() || null,
      anchor: c.anchor,
      durationDays: typeof c.durationDays === 'number' ? c.durationDays : null,
      fixedStartAt: toDate(c.fixedStartAt),
      fixedEndAt: toDate(c.fixedEndAt),
      eligibleFromAt: toDate(c.eligibleFromAt),
      eligibleToAt: toDate(c.eligibleToAt),
      // Always inactive on flyer-create. Admin reviews + activates
      // from /vault/contests so the AI can't accidentally surface a
      // wrong config.
      active: false,
      requirements: { create: cleanReqs },
    },
    include: { requirements: { orderBy: { order: 'asc' } } },
  })

  return NextResponse.json({
    kind: 'contest',
    contestId: created.id,
    contest: created,
  })
}
