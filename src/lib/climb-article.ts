// AI-generated personalized profile article for ARTICLE-type Climb
// milestones. The marquee reward of the system: at the 100K threshold
// (configurable), AFF generates a 300-400 word article celebrating the
// agent's specific journey — tenure, FTAs completed, top recruits,
// milestones already hit. Stored in agent_articles for permanent
// reference; rendered on the Climb tab and shared in Discord.

import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'
import { getSetting } from './settings'
import { lifetimePointsForAgent } from './climb-points'
import type { ClimbMilestone } from '@/generated/prisma/client'

const MODEL_ID = 'claude-sonnet-4-6'

const DEFAULT_PROMPT_TEMPLATE = `You are a writer for All Financial Freedom (AFF), a financial services company training licensed insurance agents. An agent has just hit a major milestone on the AFF "Climb" — a lifetime points achievement system.

Write a 300-400 word personalized profile article celebrating their journey. The article will be shown to the agent on their portal, posted to the AFF Discord, and they'll keep it as a memento.

Tone: warm, specific, motivating. Lead with the moment they crossed this threshold. Reference real details from the agent context below — their tenure, FTAs they completed, milestones they've already hit, the people on their team. Avoid corporate-speak. Avoid generic motivational fluff. Tell a SPECIFIC story.

Structure: short title (under 8 words). 3-4 short paragraphs. End with a forward-looking line about what's next on the Climb.`

interface ArticleContext {
  firstName: string
  lastName: string
  agentCode: string
  phase: number
  tenureMonths: number
  totalPoints: number
  milestoneTitle: string
  milestoneTagline: string | null
  pointThreshold: number
  ftasCompleted: number
  recruitsCount: number
  badges: string[]
  priorClimbAchievements: Array<{ title: string; pointThreshold: number; achievedAt: Date }>
}

async function gatherContext(agentProfileId: string, milestone: ClimbMilestone): Promise<ArticleContext | null> {
  const profile = await db.agentProfile.findUnique({
    where: { id: agentProfileId },
    select: {
      firstName: true,
      lastName: true,
      agentCode: true,
      phase: true,
      icaDate: true,
      badges: true,
      _count: { select: { ftas: { where: { status: 'COMPLETED' } } } },
    },
  })
  if (!profile) return null

  // Recruits = agents whose recruiterId equals this agent's agentCode.
  const recruits = await db.agentProfile.count({
    where: { recruiterId: profile.agentCode, isTest: false, status: 'ACTIVE' },
  })

  const totalPoints = await lifetimePointsForAgent(agentProfileId)

  const priorAchievements = await db.climbAchievement.findMany({
    where: { agentProfileId },
    include: { milestone: { select: { title: true, pointThreshold: true } } },
    orderBy: { achievedAt: 'asc' },
  })

  const tenureMonths = profile.icaDate
    ? Math.max(0, Math.round((Date.now() - profile.icaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 0

  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    agentCode: profile.agentCode,
    phase: profile.phase,
    tenureMonths,
    totalPoints,
    milestoneTitle: milestone.title,
    milestoneTagline: milestone.tagline,
    pointThreshold: milestone.pointThreshold,
    ftasCompleted: profile._count.ftas,
    recruitsCount: recruits,
    badges: profile.badges,
    priorClimbAchievements: priorAchievements.map(a => ({
      title: a.milestone.title,
      pointThreshold: a.milestone.pointThreshold,
      achievedAt: a.achievedAt,
    })),
  }
}

function renderUserMessage(ctx: ArticleContext): string {
  const priorList = ctx.priorClimbAchievements.length > 0
    ? ctx.priorClimbAchievements.map(p => `- ${p.title} (${p.pointThreshold.toLocaleString()} points), achieved ${p.achievedAt.toISOString().split('T')[0]}`).join('\n')
    : '(this is their first major Climb milestone)'

  return `## Agent context

Name: ${ctx.firstName} ${ctx.lastName} (${ctx.agentCode})
Current phase: Phase ${ctx.phase}
Tenure at AFF: ${ctx.tenureMonths} months
Lifetime points (now): ${ctx.totalPoints.toLocaleString()}
Field training appointments completed: ${ctx.ftasCompleted}
Active recruits in their downline: ${ctx.recruitsCount}
Badges earned: ${ctx.badges.length > 0 ? ctx.badges.join(', ') : 'none yet'}

## Milestone they just hit

Title: ${ctx.milestoneTitle}
Threshold: ${ctx.pointThreshold.toLocaleString()} lifetime points
Flavor text: ${ctx.milestoneTagline ?? '(none)'}

## Prior Climb milestones already achieved

${priorList}

## Task

Write the personalized profile article now. Return JUST the article — title on the first line, blank line, then the body. No preamble, no closing remarks.`
}

export async function generateClimbArticle(
  agentProfileId: string,
  milestone: ClimbMilestone,
  _pointsAtAchievement: number,
): Promise<{ id: string; title: string; body: string } | null> {
  // Don't regenerate if an article already exists for this (agent, milestone).
  // Re-running the recompute is supposed to be idempotent.
  const existing = await db.agentArticle.findFirst({
    where: { agentProfileId, milestoneId: milestone.id },
    select: { id: true, title: true, body: true },
  })
  if (existing) return existing

  const apiKey = await getSetting('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('[climb-article] ANTHROPIC_API_KEY not configured; skipping article generation')
    return null
  }

  const ctx = await gatherContext(agentProfileId, milestone)
  if (!ctx) return null

  // Use admin-configured prompt template if present, else default.
  const payload = (milestone.rewardPayload ?? {}) as { promptTemplate?: string }
  const systemPrompt = payload.promptTemplate?.trim() || DEFAULT_PROMPT_TEMPLATE

  const userMessage = renderUserMessage(ctx)

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      // System prompt cached so re-running the same milestone for
      // multiple agents in sequence (e.g. backfill) hits the cache.
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null

    const raw = textBlock.text.trim()
    // Convention: title on first line, then body. Be defensive.
    const lines = raw.split('\n')
    let title = lines[0].replace(/^#+\s*/, '').trim()
    let body = lines.slice(1).join('\n').trim()
    if (!title || title.length > 120) {
      title = `${ctx.firstName}'s ${ctx.milestoneTitle}`
      body = raw
    }

    const saved = await db.agentArticle.create({
      data: {
        agentProfileId,
        milestoneId: milestone.id,
        title,
        body,
        promptUsed: systemPrompt,
        modelId: MODEL_ID,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
      select: { id: true, title: true, body: true },
    })
    return saved
  } catch (err) {
    console.error('[climb-article] generation failed:', err)
    return null
  }
}
