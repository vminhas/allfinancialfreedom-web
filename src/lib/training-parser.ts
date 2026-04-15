import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from './settings'

const MODEL_ID = 'claude-sonnet-4-5-20250929'

const SYSTEM_PROMPT = `You are an extraction system for GFI / All Financial Freedom training event flyers.

Each image is a single training event flyer from GFI (Global Financial Impact). Layouts are consistent:
- Title (large) — sometimes with a smaller subtitle below
- Optional category banner (e.g. "Technology Tuesday", "Wednesday Workshop", "Inspirational Marketing")
- 1, 2, or 3 presenter portraits with name + role beneath each
- Date in the format "DAY | MONTH DAY, YEAR" (e.g. "MONDAY | APRIL 13, 2026")
- Time across multiple time zones (HST | PST | MST | CST | EST/ET) — always extract the EST/EDT time as the canonical
- Stream platform: usually "GFI Live - Impact TV" with a numeric stream ID and passcode, OR a regular Zoom meeting with Meeting ID + passcode
- Sometimes a partner brand logo (Tevah, Allianz, Corebridge, F&G, Quantum, American Equity, Ethos, etc.)
- Sometimes an audience restriction (e.g. "CFTs & Above Only", "For MD's & Above & Operations Staff Only")
- Sometimes country/region targeting (e.g. "for Canada", "Puerto Rico Launch")

Extract via the submit_event tool. If a field isn't visible, set it to null. For times, return ISO 8601 with the ET offset (use -04:00 for EDT or -05:00 for EST based on the date).

If the image clearly contains MULTIPLE events on one poster (a weekly schedule), return events as an array. Most flyers will return a single-element array.`

export interface ParsedTrainingPresenter {
  name: string
  role: string
}

export interface ParsedTrainingEvent {
  title: string
  subtitle: string | null
  category: string | null
  startsAtET: string                 // ISO 8601 with -04:00 / -05:00 offset
  durationMinutes: number
  presenters: ParsedTrainingPresenter[]
  streamType: 'GFI_LIVE' | 'ZOOM'
  streamRoomName: string | null
  streamId: string | null
  passcode: string | null
  audienceRestriction: string | null
  partnerBrand: string | null
  targetRegion: string | null
}

export interface ParseTrainingResult {
  events: ParsedTrainingEvent[]
  modelId: string
  inputTokens: number
  outputTokens: number
  rawJson: unknown
}

/**
 * Run Claude vision against a single training flyer image and return
 * the structured event data. Reads ANTHROPIC_API_KEY from the encrypted
 * settings table (or env override).
 */
export async function parseTrainingFlyer(params: {
  imageBytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  fileName: string
}): Promise<ParseTrainingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || (await getSetting('ANTHROPIC_API_KEY'))
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: 'submit_event',
        description: 'Submit the structured event data extracted from the flyer.',
        input_schema: {
          type: 'object',
          required: ['events'],
          properties: {
            events: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'startsAtET', 'presenters', 'streamType'],
                properties: {
                  title:               { type: 'string', description: 'Main event title (uppercase OK)' },
                  subtitle:            { type: ['string', 'null'], description: 'Smaller secondary line under the main title, if any' },
                  category:            { type: ['string', 'null'], description: 'Category banner like "Technology Tuesday"' },
                  startsAtET:          { type: 'string', description: 'ISO 8601 datetime with -04:00 or -05:00 offset (parsed from the EST/EDT line)' },
                  durationMinutes:     { type: 'integer', description: 'Default 60 if not visible' },
                  presenters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['name', 'role'],
                      properties: {
                        name: { type: 'string' },
                        role: { type: 'string', description: 'Title + company if visible (e.g. "CTO of GFI")' },
                      },
                    },
                  },
                  streamType:          { type: 'string', enum: ['GFI_LIVE', 'ZOOM'] },
                  streamRoomName:      { type: ['string', 'null'], description: 'e.g. "GFI Live - Impact TV"' },
                  streamId:            { type: ['string', 'null'], description: 'Stream/meeting ID with original spacing/dashes preserved' },
                  passcode:            { type: ['string', 'null'] },
                  audienceRestriction: { type: ['string', 'null'] },
                  partnerBrand:        { type: ['string', 'null'] },
                  targetRegion:        { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_event' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: params.mimeType, data: params.imageBytes.toString('base64') } },
          { type: 'text', text: `Extract structured event data from this flyer (filename: ${params.fileName}).` },
        ],
      },
    ],
  })

  const toolUse = message.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block')
  }

  const input = toolUse.input as { events: ParsedTrainingEvent[] }

  return {
    events: input.events,
    modelId: MODEL_ID,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    rawJson: input,
  }
}
