import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'

// Generation can take 30+ seconds on long deck pastes; bump from the
// default 60s function ceiling.
export const maxDuration = 180

const MODEL_ID = 'claude-sonnet-4-6'

const CALL_TYPE_CONTEXT: Record<string, string> = {
  RECRUIT:
    'This is a recruiting call script. The agent is talking to a prospective AFF agent (a future hire) and trying to get them to commit to becoming licensed and joining the team.',
  CLIENT_APPOINTMENT:
    'This is a Field Training Appointment / client appointment script. The agent is meeting with a prospective client to assess their financial situation and present an insurance solution.',
  FOLLOW_UP:
    'This is a follow-up call script. The agent is reconnecting with a prior contact (recruit, client, or warm lead) to continue a conversation or re-engage interest.',
  OTHER:
    'This is a general AFF call script for ad-hoc situations.',
}

const OUTLINE_SYSTEM_PROMPT = `You are JLM (Jeremy Lee Miner) writing for All Financial Freedom (AFF). An admin has uploaded raw deck or script content for a call type. Your job: convert it into a tight, structured outline that an AI call coach will use as the standardized playbook to grade every transcript of this call type against.

Your output must:

1. Map the script to the NEPQ 5-stage structure: CONNECTION, ENGAGEMENT (Situation, Problem-Awareness, Solution-Awareness, Consequence, Qualifying), TRANSITION, PRESENTATION, COMMITMENT.
2. For each stage, list the specific beats this script wants the agent to hit: questions to ask, language to use, transitions, anti-patterns to avoid.
3. Quote exact phrases from the script when they're distinctive (the AI grader will look for them in transcripts).
4. Add JLM-style coaching notes: tonality cues, identity-frame moments, "forced" framing setups, disarming phrases the script implies.
5. Be ruthlessly concise. The outline goes into a cached system prompt block on every call analysis, so dense > verbose. Aim for 400-700 words.
6. Use markdown headings + bullets. No fluff, no preamble, no closing remarks.

Do not invent content the script doesn't support. If a stage is missing from the source, mark it "Not in script — fall back to general NEPQ" and move on.`

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') return null
  return (session.user as { id?: string }).id ?? null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const resource = await db.setupResource.findUnique({ where: { id } })
  if (!resource) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resource.callType) {
    return NextResponse.json({ error: 'Resource is not tagged with a CallType' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { rawScriptContent?: string }
  const raw = (body.rawScriptContent ?? resource.rawScriptContent ?? '').trim()
  if (raw.length < 100) {
    return NextResponse.json(
      { error: 'Need at least ~100 characters of script content to generate a useful outline' },
      { status: 400 }
    )
  }

  const apiKey = await getSetting('ANTHROPIC_API_KEY')
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })

  const client = new Anthropic({ apiKey })

  const userMessage = `Resource label: ${resource.label}
Call type: ${resource.callType}
${CALL_TYPE_CONTEXT[resource.callType] ?? ''}

Raw script / deck content the admin uploaded:

---
${raw}
---

Produce the structured outline now.`

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: OUTLINE_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

  const textBlock = message.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'AI did not return an outline' }, { status: 500 })
  }
  const outline = textBlock.text.trim()

  const updated = await db.setupResource.update({
    where: { id },
    data: {
      rawScriptContent: raw,
      aiScriptOutline: outline,
      outlineGeneratedAt: new Date(),
    },
  })
  return NextResponse.json({
    resource: updated,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  })
}
