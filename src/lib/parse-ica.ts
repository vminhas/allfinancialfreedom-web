// PDF → structured ICA extraction via Claude's PDF input. Used by the
// admin-activity Discord poller and by future web upload paths so both
// front doors land the same shape in IcaSubmission rows. Strict tool-use
// schema means Claude either returns a fully-typed payload or we trip the
// caller's catch — never silently mangle a recruit's data.

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5'
const MAX_PDF_BYTES = 24 * 1024 * 1024 // 24MB — well under Anthropic's PDF cap

export interface IcaExtraction {
  firstName: string | null
  middleName: string | null
  lastName: string | null
  email: string | null
  // ISO 8601 date (YYYY-MM-DD) so it round-trips into a Postgres DATE/TIMESTAMP
  // without locale guessing. The model emits this format; we don't parse the
  // MM/DD/YYYY string ourselves.
  dob: string | null
  gender: string | null
  maritalStatus: string | null
  spouseName: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  // F-code of the recruiter. Mapped to AgentProfile.recruiterId on approval.
  referenceCode: string | null
  classification: string | null // 'Dedicated' | 'Non-Dedicated'
  hasLicense: boolean | null
}

const EMPTY: IcaExtraction = {
  firstName: null, middleName: null, lastName: null, email: null, dob: null,
  gender: null, maritalStatus: null, spouseName: null, addressLine1: null,
  city: null, state: null, zip: null, country: null, referenceCode: null,
  classification: null, hasLicense: null,
}

const SYSTEM_PROMPT = `You extract structured fields from AFF / GFI Independent Contractor Agreement (ICA) PDFs.

The first page of an ICA always carries a "Basic Details" block with the
recruit's name, contact info, address, and a "Reference Code" that identifies
the recruiter (e.g. "F2030", "F6230"). It also has a "Background Questions"
block with license + training answers, and a classification choice
("Dedicated" or "Non-Dedicated").

Extract every field you can see. Use null for any field that isn't clearly
present — never guess. Submit via the extract_ica tool.`

const TOOL_SCHEMA: Anthropic.Tool = {
  name: 'extract_ica',
  description: 'Submit the structured ICA extraction.',
  input_schema: {
    type: 'object',
    required: ['extraction'],
    properties: {
      extraction: {
        type: 'object',
        required: [
          'firstName', 'middleName', 'lastName', 'email', 'dob',
          'gender', 'maritalStatus', 'spouseName', 'addressLine1',
          'city', 'state', 'zip', 'country', 'referenceCode',
          'classification', 'hasLicense',
        ],
        properties: {
          firstName:      { type: ['string', 'null'] },
          middleName:     { type: ['string', 'null'] },
          lastName:       { type: ['string', 'null'] },
          email:          { type: ['string', 'null'], description: 'Lowercased email. null if missing.' },
          dob:            { type: ['string', 'null'], description: 'ISO 8601 date YYYY-MM-DD. null if missing.' },
          gender:         { type: ['string', 'null'] },
          maritalStatus:  { type: ['string', 'null'], description: 'Single / Married / Divorced / Widowed / etc.' },
          spouseName:     { type: ['string', 'null'] },
          addressLine1:   { type: ['string', 'null'], description: 'Street address only, no city/state/zip.' },
          city:           { type: ['string', 'null'] },
          state:          { type: ['string', 'null'], description: 'US state name or abbreviation as printed.' },
          zip:            { type: ['string', 'null'] },
          country:        { type: ['string', 'null'] },
          referenceCode:  { type: ['string', 'null'], description: 'Recruiter F-code (e.g. F2030). null if missing.' },
          classification: { type: ['string', 'null'], description: 'Dedicated or Non-Dedicated.' },
          hasLicense:     { type: ['boolean', 'null'], description: 'Answer to the "current Life or Health Insurance License?" question.' },
        },
      },
    },
  },
}

export interface ParseIcaResult {
  extraction: IcaExtraction
  // Brief raw-text snippet of the first page for audit + UI preview.
  // We don't store the full PDF text in the DB (potentially long), just
  // enough that an admin can spot a parse miss without re-downloading.
  rawSnippet: string | null
  // Token usage so cron costs are visible in the IcaSubmission row.
  inputTokens: number
  outputTokens: number
}

export async function parseIcaPdf(pdfBytes: Buffer, opts?: { filename?: string }): Promise<ParseIcaResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }
  if (pdfBytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF too large (${pdfBytes.byteLength} bytes) — limit is ${MAX_PDF_BYTES}`)
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    // System prompt is stable across every ICA the cron processes, so
    // cache it. Subsequent parses in the same 5-minute window reuse the
    // system tokens at ~0.1x cost; first parse pays the ~1.25x write
    // premium but breaks even after one more ICA in the window.
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'extract_ica' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBytes.toString('base64'),
          },
          ...(opts?.filename ? { title: opts.filename } : {}),
        },
        { type: 'text', text: 'Extract the recruit fields from this ICA.' },
      ],
    }],
  })

  const toolBlock = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'extract_ica',
  )
  if (!toolBlock) {
    throw new Error(`extract_ica tool not invoked; stop_reason=${message.stop_reason}`)
  }

  const input = toolBlock.input as { extraction?: Partial<IcaExtraction> }
  const extraction: IcaExtraction = { ...EMPTY, ...(input.extraction ?? {}) }

  return {
    extraction,
    rawSnippet: null,
    inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
  }
}
