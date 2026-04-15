import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from './settings'

// ─── Rubric definition ────────────────────────────────────────────────────────
// Six dimensions, weighted average → overall score.
// Claude grades each on a 0-100 scale against the AFF sales methodology.

export const RUBRIC_DIMENSIONS = [
  { key: 'opening',    label: 'Opening & Rapport',  weight: 0.15 },
  { key: 'discovery',  label: 'Discovery & Needs',  weight: 0.20 },
  { key: 'product',    label: 'Product Knowledge',  weight: 0.15 },
  { key: 'objections', label: 'Objection Handling', weight: 0.15 },
  { key: 'closing',    label: 'Closing & Next Steps', weight: 0.20 },
  { key: 'tone',       label: 'Tone & Empathy',     weight: 0.15 },
] as const

export type RubricKey = typeof RUBRIC_DIMENSIONS[number]['key']
export type RubricScores = Record<RubricKey, number>

export interface CallReviewResult {
  overallScore: number
  rubricScores: RubricScores
  strengths: string[]
  weaknesses: string[]
  coachingTips: string[]
  nextSteps: string[]
  summary: string
  flaggedForCoaching: boolean
  modelId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
}

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MIN_TRANSCRIPT_WORDS = 100

// System prompt is marked for prompt caching — it's identical on every call and
// typically ~1.5k tokens, so caching drops cost ~85% on repeat requests.
const SYSTEM_PROMPT = `You are a senior sales coach for All Financial Freedom (AFF), a financial services company recruiting and training licensed insurance agents. You review recorded sales calls and give agents clear, actionable coaching based on the AFF methodology.

AFF sales methodology (the standard you're grading against):
- Calls should open with warm rapport, not a pitch. The first 2 minutes establish trust.
- Discovery is the heart of the call: open-ended questions about family, money goals, current financial picture, and pain points. Agents should understand the client's "why" before presenting anything.
- Product presentation must be accurate, confident, and tied to the client's stated needs. Never oversell. Never guess at numbers.
- Objections are opportunities. Great agents acknowledge, empathize, reframe — they never argue or get defensive.
- Every call ends with a clear next step: scheduled follow-up, homework assigned, or a confirmed decision. "I'll get back to you" is NOT a next step.
- Tone should be warm, patient, genuine. Not scripted, not pushy, not robotic.

You grade each call on six dimensions (0-100 each). Use the full range — a typical call scores 55-75. Reserve 85+ for genuinely excellent work and sub-50 for calls with serious issues.

Dimensions:
1. opening (weight 15%): Professional greeting, built trust early, avoided pitching too soon.
2. discovery (weight 20%): Asked open-ended questions, uncovered real goals and concerns, listened actively.
3. product (weight 15%): Accurate explanations, tied to client needs, confident without overselling.
4. objections (weight 15%): Handled concerns with empathy, did not get defensive, reframed constructively.
5. closing (weight 20%): Clear ask, scheduled next step, confirmed action items.
6. tone (weight 15%): Warm, patient, genuine, matched the client's energy.

You will also produce:
- strengths: 2-4 specific things the agent did well, each 1 sentence, citing actual moments if possible.
- weaknesses: 2-4 specific gaps, each 1 sentence, non-judgmental phrasing.
- coachingTips: 2-4 concrete actions the agent can try on their next call. Not generic advice — tied to what actually happened.
- nextSteps: 1-3 follow-up items the agent should take from THIS call with THIS prospect.
- summary: 2-3 sentences recapping what happened on the call, neutral tone.

Be direct but encouraging. Agents will read this feedback immediately after their call. The goal is improvement, not judgment.

Output via the submit_review tool only.`

export class TranscriptTooShortError extends Error {
  constructor(public wordCount: number) {
    super(`Transcript too short: ${wordCount} words (minimum ${MIN_TRANSCRIPT_WORDS})`)
    this.name = 'TranscriptTooShortError'
  }
}

export async function reviewTranscript(params: {
  transcriptText: string
  agentContext?: { firstName: string; lastName: string; phase: number; goal?: string | null }
  contactName?: string
}): Promise<CallReviewResult> {
  const { transcriptText, agentContext, contactName } = params

  const wordCount = transcriptText.trim().split(/\s+/).length
  if (wordCount < MIN_TRANSCRIPT_WORDS) {
    throw new TranscriptTooShortError(wordCount)
  }

  const apiKey = await getSetting('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const client = new Anthropic({ apiKey })

  const agentLine = agentContext
    ? `Agent: ${agentContext.firstName} ${agentContext.lastName} (Phase ${agentContext.phase}${agentContext.goal ? `, Goal: ${agentContext.goal}` : ''})`
    : 'Agent: (anonymous)'

  const userMessage = `${agentLine}
${contactName ? `Prospect: ${contactName}` : ''}

Review the following call transcript and produce a coaching review via the submit_review tool.

---
${transcriptText}
---`

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'submit_review',
        description: 'Submit the call review with rubric scores and coaching feedback.',
        input_schema: {
          type: 'object',
          required: ['rubricScores', 'strengths', 'weaknesses', 'coachingTips', 'nextSteps', 'summary'],
          properties: {
            rubricScores: {
              type: 'object',
              required: ['opening', 'discovery', 'product', 'objections', 'closing', 'tone'],
              properties: {
                opening:    { type: 'integer', minimum: 0, maximum: 100 },
                discovery:  { type: 'integer', minimum: 0, maximum: 100 },
                product:    { type: 'integer', minimum: 0, maximum: 100 },
                objections: { type: 'integer', minimum: 0, maximum: 100 },
                closing:    { type: 'integer', minimum: 0, maximum: 100 },
                tone:       { type: 'integer', minimum: 0, maximum: 100 },
              },
            },
            strengths:    { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
            weaknesses:   { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
            coachingTips: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
            nextSteps:    { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 3 },
            summary:      { type: 'string' },
          },
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_review' },
    messages: [{ role: 'user', content: userMessage }],
  })

  const toolUse = message.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block')
  }

  const input = toolUse.input as {
    rubricScores: RubricScores
    strengths: string[]
    weaknesses: string[]
    coachingTips: string[]
    nextSteps: string[]
    summary: string
  }

  // Weighted overall score
  const overallScore = Math.round(
    RUBRIC_DIMENSIONS.reduce((sum, d) => sum + input.rubricScores[d.key] * d.weight, 0)
  )

  // Flag if overall < 60 OR any single dimension < 50
  const anyDimBelow50 = RUBRIC_DIMENSIONS.some(d => input.rubricScores[d.key] < 50)
  const flaggedForCoaching = overallScore < 60 || anyDimBelow50

  const usage = message.usage as typeof message.usage & {
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }

  return {
    overallScore,
    rubricScores: input.rubricScores,
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    coachingTips: input.coachingTips,
    nextSteps: input.nextSteps,
    summary: input.summary,
    flaggedForCoaching,
    modelId: MODEL_ID,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
  }
}
