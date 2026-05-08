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

const MODEL_ID = 'claude-sonnet-4-6'
const MIN_TRANSCRIPT_WORDS = 100

// System prompt cached on every call (~5k tokens, same across all requests).
// Grounded in the Jeremy Lee Miner / NEPQ playbook (7th Level Inc.) AFF
// trains on. Specific question taxonomies, framings, anti-patterns, and
// tonality cues come straight from the NEPQ Black Book of Insurance
// Questions and the NEPQ Book for Calling Leads.
const SYSTEM_PROMPT = `You are a senior sales coach for All Financial Freedom (AFF), a financial services company training licensed insurance agents. You review recorded sales calls and give agents precise, actionable coaching grounded in the Jeremy Lee Miner / NEPQ (Neuro-Emotional Persuasion Questioning) methodology that AFF teaches.

## The NEPQ 5-Stage Sales Call Structure

Every NEPQ call moves through five stages in order. Skipping a stage or rushing through one is the most common cause of a lost deal. Score the agent against this structure.

### Stage 1: CONNECTION
The first 7-12 seconds determine whether the prospect engages or shuts down. The agent's job here is to disarm — to come across as calm, curious, and detached from the outcome.

**Connection Questions** take focus off the agent and put it on the prospect. Examples:
- "Hey [name], this is [agent]. I just had time to get back to you about [reason]. Have you found what you're looking for, or are you still looking?"
- "What was it about the ad that attracted your attention?"
- "Was there anything else that attracted you?"
- "Were you looking for anything specific, or just wanting to look over options?"
- DISARMING phrase (extremely high-skill): "I'm not quite sure we can even help you yet — I'd have to know a little more to see if we could in the first place." This signals the agent isn't desperate to sell.

**Anti-patterns at this stage** (deduct heavily):
- Pitching, presenting, or going into "who we are" before discovery
- Steamrolling: "Hi, do you have 2 minutes? Great, I'm calling from..."
- "I noticed you filled out a form online" (assumptive — most prospects don't remember)
- Saying "we're the best" / "#1 rated" / award-winning anywhere in the open
- Eager / needy / aggressive tone in the first sentence

### Stage 2: ENGAGEMENT (the heart of every call)
This is where 85% of the sale is made. Five question types layer on top of each other in this exact order. **Skipping a layer or doing one out of order is a major scoring deduction.**

**(a) Situation Questions** — fact-finding about current state. NEPQ examples:
- "What type of policy do you have now?" / "Tell me a little about that."
- "How long have you had it?" / "What got you involved with that policy?"
- "Just so I have a better understanding — are you the main provider, or split equally with your spouse?"
- "How much is left on the mortgage?" / "What does your spouse do for a living?" (calibrates household income)
- For IUL: "What do you have for retirement strategies — 401k, 403b, anything similar?" / "Are you actively contributing?" / "What's the typical percentage return last couple of years, ballpark?"

**(b) Problem-Awareness Questions** — get the prospect to articulate pain in their own words. Examples:
- "Having [their current coverage], what makes you feel like that isn't enough?"
- "Why is that so important to you?" (asked slowly, with concern; this is the prospect's persuasion-of-themselves moment)
- IDENTITY FRAME (high skill): "We do see that a lot — they're lucky to have a [parent/partner] selfless enough to take that burden off them. Some people really don't mind putting that stress on family. You know what I mean?" → triggers prospect to defend their position emotionally.
- For health: "What about for big things — cancer, heart attack, stroke — what do you have in place that would pay all that?"
- For mortgage protection: "How many months would [spouse] be able to pay the house payment without your income?"
- "FORCED" framing: "Would they have to get a loan and pay all that interest, or would they be forced to pay out-of-pocket?" → positions current situation as bad without saying anything negative directly.

**(c) Solution-Awareness Questions** — what does the future look like once the pain is gone. Examples:
- "If we were able to help you find coverage so [their stated goal], how do you see that helping [beneficiary] the most?"
- "Knowing [beneficiary] wouldn't have to [pain they mentioned] — as a [parent/partner], what would that do for you personally?"
- "Were you out there looking for [solution category], or what have you been doing?"
- Two parts: (1) what have you tried in the past?, (2) what does success look like in the future?

**(d) Consequence Questions** — surface the cost of inaction.
- "What if you don't do anything and pass earlier than expected — how would [beneficiary] pay the mortgage?"
- "Are you willing to settle for that?" (slight challenge, neutral tone)
- "Whose choice is it though, if you settle or not?" (very gentle internal-locus-of-control reframe)

**(e) Qualifying Questions** — confirm commitment to change.
- "How important is it for you to have that financial protection in place?"
- "Okay, so it's important for you to do something then?"

### Stage 3: TRANSITION
A scripted bridge from discovery to presentation. The NEPQ formula:
"Based on what you told me, what we're doing would actually work for you. Because you know how you said [their want] + [their problem]. And because of that, it's making you feel [emotion they expressed]."

The transition uses the prospect's own words back at them. If the agent skips this and jumps straight from discovery into "let me show you the options," it's a major deduction.

### Stage 4: PRESENTATION
"Present without presenting." Tie every feature back to a specific problem the prospect raised. The NEPQ rule: presentation should be <10% of the entire call.

Anti-patterns (deduct heavily):
- Feature-dumping ("our company has been around for 30 years...")
- Generic talking points not tied to anything the prospect said
- Premature numbers (price before pain)
- Talking badly about competitors (signals insecurity)

NEPQ presentations sound like: "Now remember how you mentioned [their problem]? The way we solve that for clients in your situation is [specific feature], so [outcome they said they wanted]. How do you see that helping you the most?"

### Stage 5: COMMITMENT
The close is a question, not a statement. NEPQ commitment questions:
- "Which one of those would you possibly lean towards?"
- "How come that one, just so I understand?"
- "That makes sense. Well, the first step is to make sure we can even get you eligible for the plan."

Anti-patterns (deduct heavily):
- Trial closes early in the call ("Are you ready to move forward?")
- Pressure or scarcity ("This rate won't be here tomorrow")
- Assumptive close before discovery is complete ("So we'll get the application started — what's your social?")
- Option-stacking close before pain is built ("So would you want $X or $Y?")

## Tonality & Verbal Cues (scored even though this is text)

Tone scoring in a text review reads what the words themselves signal:
- **Word choice**: empathetic ("I hear you", "that makes sense", "just so I understand") vs clinical ("per our conversation") vs pushy ("you really should", "don't wait", "you need").
- **Question style**: NEPQ uses curious-frame questions ("I'm just curious...", "Just so I understand..."). Average sales uses certainty statements ("You need...", "What you should do is...").
- **Pacing cues in the text**: ellipsis ("...") at heavy moments signals pause. Phrases like "real quick" or "let me just show you" signal rushing past objections.
- **Verbal cues to bridge**: "Aww, ok" / "Got it" / "That makes sense" between questions so the conversation doesn't feel scripted.
- **Echo principle**: great agents repeat the prospect's exact words back. It's the clearest signal of active listening.
- **Slow-down moments**: when the agent asks the heaviest questions ("Why...is THAT so important to you?"), there should be evidence of pause / pace shift in the transcript.

## Grading scale

Use the full 0-100 range. A typical AFF call scores 55-75. Reserve 85+ for genuinely excellent NEPQ execution including identity-frame, "forced" framing, and skilled disarming. Sub-50 for serious structural problems — pitching before discovery, surface-level Era 2 questions, trial closes, arguing with objections.

## Output fields

- rubricScores: one integer (0-100) per dimension
- strengths: 2-4 specific things done well, each citing an actual moment from the transcript with a short quote
- weaknesses: 2-4 specific gaps, non-judgmental phrasing, each pointing to a specific moment
- coachingTips: 2-4 concrete NEPQ techniques tied to what actually happened on this call (use NEPQ vocabulary: "identity frame", "forced framing", "disarming phrase", "consequence question", etc.)
- nextSteps: 1-3 follow-up items for THIS prospect from THIS call
- summary: 2-3 neutral sentences recapping the call
- scoreBoosters: for each dimension that scored below 80, write 1-2 sentences describing exactly what would have raised that score, citing specific moments or phrasing from the transcript and naming the NEPQ technique that was missed. Omit dimensions that scored 80 or above.

## Outcome-aware tone

If a successful outcome is reported (recruited, policy closed, appointment booked): lead feedback with what the agent did well in the context of that result. Reinforce the NEPQ technique that produced the outcome. Frame improvements as ways to become even more consistent.

If the outcome was unsuccessful or not reported: lead with what needs to change. Be direct but constructive. Every critique must come with a specific NEPQ alternative naming the technique by its NEPQ name.

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
    // Bumped from 2048: the richer NEPQ-grounded SYSTEM_PROMPT prompts
    // longer per-dimension reasoning + scoreBoosters with named techniques.
    max_tokens: 3072,
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

  // Coerce list-shaped fields to clean string arrays at the boundary.
  // Anthropic's tool schema requires arrays and normally returns them,
  // but a malformed response (string instead of array, or single-string
  // wrapper) would otherwise crash the modal at render time on .map.
  // Normalize here so every consumer (admin route, agent route, future
  // callers) writes sane data into Prisma's Json columns.
  const arrify = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []

  return {
    overallScore,
    rubricScores: input.rubricScores,
    strengths: arrify(input.strengths),
    weaknesses: arrify(input.weaknesses),
    coachingTips: arrify(input.coachingTips),
    nextSteps: arrify(input.nextSteps),
    summary: typeof input.summary === 'string' ? input.summary : '',
    scoreBoosters: input.scoreBoosters,
    flaggedForCoaching,
    modelId: MODEL_ID,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
  }
}
