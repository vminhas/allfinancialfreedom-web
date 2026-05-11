// Contest flyer parser: feed an image to Claude vision and either
// extract a contest config or classify as "not a contest" so the
// caller can move on. Mirrors the parseTrainingFlyer pattern in
// src/lib/training-parser.ts.
//
// The system prompt bakes in valid phaseItem keys + milestone keys
// so the model picks from a known menu instead of inventing slugs.
// Anything ambiguous gets mapped to MANUAL so an admin can still
// tick it per-agent.

import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from './settings'
import { db } from './db'

const MODEL_ID = 'claude-sonnet-4-6'

export type ParsedContestKind = 'contest' | 'not_contest'

export interface ParsedContestRequirement {
  label: string
  type: 'PHASE_ITEM' | 'MILESTONE' | 'RECRUITS' | 'POLICIES' | 'MANUAL' | 'CUSTOM_TEXT'
  phaseItemKey?: string | null
  milestoneKey?: string | null
  count?: number | null
}

export interface ParsedContest {
  title: string
  description?: string | null
  rewardLabel?: string | null
  rewardAmount?: number | null
  anchor: 'ICA_DATE' | 'ONBOARDING' | 'PHASE_START' | 'FIXED'
  durationDays?: number | null
  fixedStartAt?: string | null
  fixedEndAt?: string | null
  eligibleFromAt?: string | null
  eligibleToAt?: string | null
  requirements: ParsedContestRequirement[]
}

export interface ParseContestResult {
  kind: ParsedContestKind
  reason?: string
  contest?: ParsedContest
}

export async function parseContestFlyer(params: {
  imageBytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
}): Promise<ParseContestResult> {
  const apiKey = await getSetting('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('Anthropic API key not configured')

  // Pull the live PhaseItemDefinition keys + milestone keys so the
  // model has a concrete menu to pick from instead of inventing.
  const [phaseDefs, milestoneRows] = await Promise.all([
    db.phaseItemDefinition.findMany({ select: { itemKey: true, label: true, phase: true } }),
    db.recognitionMilestone.findMany({
      select: { milestone: true },
      distinct: ['milestone'],
    }),
  ])
  const phaseItemMenu = phaseDefs
    .map(p => `  - ${p.itemKey}  (Phase ${p.phase}: ${p.label})`)
    .join('\n')
  const milestoneMenu = milestoneRows.length > 0
    ? milestoneRows.map(m => `  - ${m.milestone}`).join('\n')
    : '  (none yet)'

  const systemPrompt = `You read AFF (All Financial Freedom) marketing/announcement flyers and decide whether they describe a TIME-BOXED BONUS CONTEST. If yes, you extract a structured contest config the AFF portal uses to render per-agent countdowns.

A "contest" flyer has all of these signals:
- A reward (money, swag, recognition) tied to specific actions
- A deadline OR a fixed window (e.g. "60 days from ICA", "Jan 1 - Jun 30")
- A list of REQUIREMENTS or steps the agent has to complete

Anything else — meeting flyers, training-class announcements, resource graphics, recruiting posts, sales-pitch decks, motivational quotes — is NOT a contest. Return kind="not_contest" with a one-line reason.

When kind="contest", map requirements onto these types:

PHASE_ITEM   → known phase-item completion. phaseItemKey must be one of:
${phaseItemMenu}

MILESTONE    → recognition milestone awarded. milestoneKey must be one of:
${milestoneMenu}

RECRUITS     → numeric count of recruits in the window. Use 'count'.
POLICIES     → numeric count of new business in the window. Use 'count'.
MANUAL       → admin checks per-agent (use this when the requirement
               doesn't map cleanly to any of the above, e.g. "Get GFI
               Code", "Submit your form", "Email your trainer").
CUSTOM_TEXT  → display only (rare; only when there's truly nothing
               to track and nothing to manually verify).

Anchor selection — read CAREFULLY:

A flyer can mention TWO different date concepts, and you must NOT
confuse them:

  (a) Per-agent duration. "60 days from when you signed your ICA"
      or "you have 60 days from onboarding to complete." This means
      every agent's clock runs from their OWN anchor date. Use the
      anchor that matches:
        ICA_DATE     → "60 days from ICA"
        ONBOARDING   → "60 days from joining" / "60 days from portal access"
        PHASE_START  → "60 days from entering this phase"
      And set durationDays to the number from the flyer.

  (b) Cohort eligibility window. "Starts Jan 1, 2026, ends Jun 30,
      2026" or "for agents who join Q1." This bounds which agents
      QUALIFY for the contest at all — not when their individual
      clock runs out. Set eligibleFromAt + eligibleToAt to capture
      it. The per-agent anchor + duration still drives the
      countdown.

  (c) Truly fixed window. The contest has the same deadline for
      everyone, no per-agent variation ("Q1 Sprint, everyone must
      finish by Mar 31"). Only then use FIXED with fixedStartAt +
      fixedEndAt.

If you see BOTH (a) and (b) on the same flyer — which is common
("Starts Jan 1, ends Jun 30; you have 60 days from ICA") — use the
(a) anchor with durationDays AND set eligibleFromAt/eligibleToAt
from (b). Do NOT use FIXED in that case. FIXED is only for case (c).

Duration: when anchor is non-FIXED, set durationDays. When FIXED,
set fixedStartAt + fixedEndAt instead.

Eligibility cutoffs (eligibleFromAt / eligibleToAt) are OPTIONAL —
only set them if the flyer explicitly says "starts X, ends Y" or
similar cohort scoping. Default to null otherwise.

Reward extraction:
- rewardLabel: the dollar/text label as shown ("$500", "AFF jacket")
- rewardAmount: integer dollars only when monetary. Null otherwise.

Requirements:
- Preserve the original wording in 'label'.
- Order matches the flyer.

Title: short headline. Skip "URGENT URGENT" decorations.

Output via the submit_flyer tool.`

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1500,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: [
      {
        name: 'submit_flyer',
        description: 'Submit the parsed contest flyer (or report it is not a contest).',
        input_schema: {
          type: 'object',
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['contest', 'not_contest'] },
            reason: { type: 'string', description: 'When not_contest, a one-line reason.' },
            contest: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                rewardLabel: { type: 'string' },
                rewardAmount: { type: ['integer', 'null'] },
                anchor: { type: 'string', enum: ['ICA_DATE', 'ONBOARDING', 'PHASE_START', 'FIXED'] },
                durationDays: { type: ['integer', 'null'] },
                fixedStartAt: { type: ['string', 'null'], description: 'ISO date YYYY-MM-DD' },
                fixedEndAt: { type: ['string', 'null'], description: 'ISO date YYYY-MM-DD' },
                eligibleFromAt: { type: ['string', 'null'] },
                eligibleToAt: { type: ['string', 'null'] },
                requirements: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['label', 'type'],
                    properties: {
                      label: { type: 'string' },
                      type: { type: 'string', enum: ['PHASE_ITEM', 'MILESTONE', 'RECRUITS', 'POLICIES', 'MANUAL', 'CUSTOM_TEXT'] },
                      phaseItemKey: { type: ['string', 'null'] },
                      milestoneKey: { type: ['string', 'null'] },
                      count: { type: ['integer', 'null'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_flyer' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: params.mimeType, data: params.imageBytes.toString('base64') },
          },
          {
            type: 'text',
            text: 'Decide whether this flyer describes an AFF time-boxed bonus contest. If so, extract the config. Otherwise mark it not_contest with a one-line reason.',
          },
        ],
      },
    ],
  })

  const tool = message.content.find(b => b.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    return { kind: 'not_contest', reason: 'AI did not return tool output' }
  }
  const input = tool.input as ParseContestResult
  if (input.kind === 'contest' && input.contest) {
    return { kind: 'contest', contest: input.contest }
  }
  return { kind: 'not_contest', reason: input.reason ?? 'classified as not a contest' }
}
