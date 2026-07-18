import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import Anthropic from '@anthropic-ai/sdk'
import {
  computeProgress, summarizeForAI, fallbackPlays,
  type MatrixPayload, type Play,
} from '@/lib/progression-cohorts'

// The Anthropic call can take a few seconds; give the function headroom.
export const maxDuration = 60

// POST /api/admin/progress-matrix/analyze
// Reads the live roster, computes each agent's cohort + stuck-point, and asks
// Claude to rank the highest-impact interventions. Falls back to a deterministic
// ranking if the AI key is missing or the call fails, so the page always works.
export async function POST() {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const [agents, items, completions] = await Promise.all([
    db.agentProfile.findMany({
      where: { status: 'ACTIVE', isTest: false },
      select: {
        id: true, agentCode: true, firstName: true, lastName: true, phase: true,
        avatarUrl: true, state: true, phaseStartedAt: true, examDate: true,
        subscribedToTevahAt: true,
        agentUser: { select: { lastLoginAt: true, email: true } },
      },
      orderBy: [{ phase: 'desc' }, { agentCode: 'asc' }],
    }),
    db.phaseItemDefinition.findMany({
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      select: { phase: true, itemKey: true, label: true, groupKey: true, adminOnly: true },
    }),
    db.phaseItem.findMany({
      where: { completed: true },
      select: { agentProfileId: true, itemKey: true, completedAt: true },
    }),
  ])

  const completedAt: Record<string, string> = {}
  for (const c of completions) {
    completedAt[`${c.agentProfileId}:${c.itemKey}`] = c.completedAt?.toISOString() ?? ''
  }
  const payload: MatrixPayload = {
    agents: agents.map(a => ({
      id: a.id, agentCode: a.agentCode, firstName: a.firstName, lastName: a.lastName,
      phase: a.phase, avatarUrl: a.avatarUrl, state: a.state,
      phaseStartedAt: a.phaseStartedAt?.toISOString() ?? null,
      examDate: a.examDate?.toISOString() ?? null,
      subscribedToTevahAt: a.subscribedToTevahAt?.toISOString() ?? null,
      lastLoginAt: a.agentUser?.lastLoginAt?.toISOString() ?? null,
      email: a.agentUser?.email ?? null,
    })),
    items,
    completedAt,
  }
  const rows = computeProgress(payload)
  const summary = summarizeForAI(rows)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ source: 'fallback', note: 'AI key not configured', plays: fallbackPlays(rows) })
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const prompt = `You are an operations strategist for All Financial Freedom, an insurance agency that onboards agents through a 6-phase progression (Phase 1 licensing/onboarding, Phase 2 field training, Phase 3 CFT certification, Phase 4 Marketing Director, Phase 5 EMD, Phase 6 NVP).

Below is the current roster. Each agent has: agent code, first name, state, phase, phase title, days in phase, % of phase complete, at-risk status, current cohort, days since last login, days since last progress, and the exact checklist items they are stuck on ("stuckOn").

Identify the 4-6 HIGHEST-IMPACT plays to get the most agents on track and advancing. Prioritize by leverage:
- interventions that unblock MULTIPLE agents stuck on the same step at once,
- agents who are one step from advancing a phase (protect that momentum),
- agents whose momentum is being lost (quiet/stalled) but were progressing.

Be specific and concrete. Name the agents by code, name the exact blocker, name who should own it (Licensing Coordinator, CFT/Trainer, EMD/upline, or Admin), and give the precise action to take.

Return ONLY valid minified JSON, no markdown, no prose, in exactly this shape:
{"plays":[{"title":"short imperative title","owner":"who owns it","impact":"why this is highest impact, quantified with counts","action":"the specific concrete step","agentCodes":["AFF-1234"]}]}

Roster:
${JSON.stringify(summary)}`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    const parsed = parsePlays(text)
    if (parsed && parsed.length) {
      return NextResponse.json({ source: 'ai', plays: parsed })
    }
    return NextResponse.json({ source: 'fallback', note: 'AI returned no usable plays', plays: fallbackPlays(rows) })
  } catch {
    return NextResponse.json({ source: 'fallback', note: 'AI call failed', plays: fallbackPlays(rows) })
  }
}

function parsePlays(text: string): Play[] | null {
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const obj = JSON.parse(m[0]) as { plays?: unknown }
    if (!Array.isArray(obj.plays)) return null
    return obj.plays
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && 'title' in p && 'action' in p)
      .map(p => ({
        title: String(p.title ?? ''),
        owner: String(p.owner ?? ''),
        impact: String(p.impact ?? ''),
        action: String(p.action ?? ''),
        agentCodes: Array.isArray(p.agentCodes) ? p.agentCodes.map(String) : [],
      }))
  } catch {
    return null
  }
}
