import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from './settings'

// ─── Rubric definition ────────────────────────────────────────────────────────

export const RUBRIC_DIMENSIONS = [
  { key: 'opening',    label: 'Opening & Rapport',    weight: 0.15 },
  { key: 'discovery',  label: 'Discovery & Needs',    weight: 0.20 },
  { key: 'product',    label: 'Product Knowledge',    weight: 0.15 },
  { key: 'objections', label: 'Objection Handling',   weight: 0.15 },
  { key: 'closing',    label: 'Closing & Next Steps', weight: 0.20 },
  { key: 'tone',       label: 'Tone & Empathy',       weight: 0.15 },
] as const

export type RubricKey = typeof RUBRIC_DIMENSIONS[number]['key']
export type RubricScores = Record<RubricKey, number>

export const OUTCOME_LABELS: Record<string, string> = {
  RECRUITED:           'Recruited',
  APPOINTMENT_BOOKED:  'Appointment Booked',
  POLICY_CLOSED:       'Policy Closed',
  FOLLOW_UP_SCHEDULED: 'Follow-up Scheduled',
  NOT_INTERESTED:      'Not Interested',
  NO_CONTACT:          'No Contact / No Answer',
}

const POSITIVE_OUTCOMES = new Set(['RECRUITED', 'APPOINTMENT_BOOKED', 'POLICY_CLOSED'])

export interface CallReviewResult {
  overallScore: number
  rubricScores: RubricScores
  strengths: string[]
  weaknesses: string[]
  coachingTips: string[]
  nextSteps: string[]
  summary: string
  scoreBoosters?: Partial<Record<RubricKey, string>>
  flaggedForCoaching: boolean
  modelId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
}

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MIN_TRANSCRIPT_WORDS = 100

// System prompt cached on every call (~2k tokens, same across all requests).
const SYSTEM_PROMPT = `You are a senior sales coach for All Financial Freedom (AFF), a financial services company training licensed insurance agents. You review recorded sales calls and give agents precise, actionable coaching grounded in the Jeremy Lee Miner / NEPQ (Neuro-Emotional Persuasion Questioning) methodology.

## The NEPQ framework (the standard you grade against)

**Opening (first 2-3 minutes):**
Open with a status-quo question that invites the prospect to describe their current situation in their own words. "What made you decide to reach out today?" or "Walk me through what you're currently doing for life insurance." Do NOT pitch anything. Do NOT explain who you are beyond a brief introduction. Rapport builds through curiosity, not talking about yourself.

**Discovery (the heart of every call):**
Move through three layers in order. Never skip ahead.
1. Problem Awareness Questions: Help the prospect articulate the problem themselves. "What's been your biggest challenge with your current coverage?" "What made you start thinking about this now?" The prospect must say the problem out loud, in their own words, before you can help them solve it.
2. Solution Awareness Questions: Help the prospect visualize the future. "What would it mean for your family if you had the right coverage in place?" "If we could solve that, what would that change for you?" The agent does NOT present solutions here.
3. Consequence Questions: Surface the cost of inaction. "What happens if things stay the same six months from now?" "How long have you been dealing with this?" The prospect must feel the gap between where they are and where they want to be before they'll listen to a solution.

NEVER present a product until the prospect has articulated their problem AND expressed desire for a solution. The rule is: they pull, you don't push.

**Product (present only after discovery is complete):**
"Based on everything you've told me..." Tie every feature to what the prospect said in discovery. Position the product as the answer to their stated problem, not a thing you're selling. Never oversell. Never guess at numbers. If you don't know, say so.

**Objections (NEPQ method):**
An objection means the prospect still has an unresolved concern. Do NOT reframe. Do NOT say "I understand, but...". Ask a clarifying question that gets them to say more: "What makes you feel that way?" "Help me understand — what's holding you back?" Let them talk themselves through it. Agreement comes when the prospect talks themselves into the decision.

**Closing (earn it through discovery, not pressure):**
End with a question, not a statement. "Based on everything you've told me today, does this feel like it makes sense for you?" If yes, walk them through next steps calmly. Never ask "Are you ready to sign?" or apply any pressure. A close that comes from good discovery never feels like a close.

**Tone & Empathy (what the text actually reveals):**
Tone scoring in a text review is based on what the words themselves signal:
- Word choice: empathetic ("I hear you", "that makes sense") vs clinical ("per our conversation", "as I mentioned") vs pushy ("you really should", "don't wait")
- Question style: open questions invite elaboration. Closed questions ("did you want...?", "can I send you...?") signal impatience.
- Pacing cues: phrases like "let me just quickly show you", "real fast", or rushing past objections signal the agent is prioritizing the sale over the conversation.
- Use of client's own language: great agents echo the prospect's exact words back to them. It's the clearest signal of active listening.
- JLM tonality principle expressed in language: curious questions ("I'm wondering...") vs certainty statements ("You need..."). The best calls read like a conversation between two people solving a problem together, not an agent pitching at a prospect.

## Grading

Use the full 0-100 range. A typical call scores 55-75. Reserve 85+ for genuinely excellent NEPQ execution. Sub-50 for serious structural problems (e.g., pitching before discovery, arguing with objections).

## Output fields

- rubricScores: one integer (0-100) per dimension
- strengths: 2-4 specific things done well, citing actual moments from the transcript
- weaknesses: 2-4 specific gaps, non-judgmental phrasing
- coachingTips: 2-4 concrete NEPQ techniques tied to what actually happened on this call
- nextSteps: 1-3 follow-up items for THIS prospect from THIS call
- summary: 2-3 neutral sentences recapping the call
- scoreBoosters: for each dimension that scored below 80, write 1-2 sentences describing exactly what would have raised that score, citing specific moments or phrasing from the transcript. Omit dimensions that scored 80 or above.

## Outcome-aware tone

If a successful outcome is reported (recruited, policy closed, appointment booked): lead feedback with what the agent did well in the context of that result. Reinforce the technique that produced the outcome. Frame improvements as ways to become even more consistent.

If the outcome was unsuccessful or not reported: lead with what needs to change. Be direct but constructive. Every critique should come with a specific NEPQ alternative.

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
  outcome?: string | null
}): Promise<CallReviewResult> {
  const { transcriptText, agentContext, contactName, outcome } = params

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

  const outcomeLine = outcome && OUTCOME_LABELS[outcome]
    ? `Reported outcome: ${OUTCOME_LABELS[outcome]}${POSITIVE_OUTCOMES.has(outcome) ? ' (successful)' : ''}`
    : ''

  const userMessage = `${agentLine}
${contactName ? `Prospect: ${contactName}` : ''}
${outcomeLine ? outcomeLine : ''}

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
            scoreBoosters: {
              type: 'object',
              description: 'For each dimension that scored below 80, write 1-2 sentences explaining what specifically would have raised that score, citing actual moments from the transcript. Omit dimensions at 80 or above.',
              properties: {
                opening:    { type: 'string' },
                discovery:  { type: 'string' },
                product:    { type: 'string' },
                objections: { type: 'string' },
                closing:    { type: 'string' },
                tone:       { type: 'string' },
              },
            },
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
    scoreBoosters?: Partial<Record<RubricKey, string>>
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
    scoreBoosters: input.scoreBoosters,
    flaggedForCoaching,
    modelId: MODEL_ID,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
  }
}
