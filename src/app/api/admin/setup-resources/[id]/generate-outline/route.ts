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

// Try to extract plain-text content from a public resource URL.
// Supports Google Docs and Google Slides via the /export?format=txt
// public endpoint (no auth needed if the doc is shared with anyone-
// with-the-link). Generic URLs are fetched and stripped of HTML.
//
// Returns null when the URL is recognizable as something we can't
// read (Canva, anything JS-rendered, anything auth-walled). The
// caller surfaces a clear error so the admin can either change the
// hosting OR fall back to pasting the content.
async function extractFromUrl(rawUrl: string): Promise<{ text: string; source: string } | { error: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { error: 'Resource URL is not valid' }
  }

  const host = url.hostname.toLowerCase()

  // Canva: design pages are JS-rendered, no public text export. Tell
  // the admin clearly rather than fetching a useless HTML shell.
  if (host.endsWith('canva.com')) {
    return {
      error: "Canva doesn't expose deck text to outside tools. Either re-host the script as a Google Doc/Slides (anyone-with-the-link) and update the URL, or paste the deck content manually as a fallback.",
    }
  }

  // Google Docs: /document/d/{id}/...  → /document/d/{id}/export?format=txt
  // Google Slides: /presentation/d/{id}/... → /presentation/d/{id}/export?format=txt
  if (host === 'docs.google.com') {
    const docMatch = url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/)
    const slideMatch = url.pathname.match(/^\/presentation\/d\/([a-zA-Z0-9_-]+)/)
    const sheetMatch = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (docMatch) {
      return fetchExport(`https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`, 'Google Docs')
    }
    if (slideMatch) {
      return fetchExport(`https://docs.google.com/presentation/d/${slideMatch[1]}/export?format=txt`, 'Google Slides')
    }
    if (sheetMatch) {
      return fetchExport(`https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv`, 'Google Sheets')
    }
  }

  // Generic web pages: fetch, strip HTML, hope for the best.
  return fetchAndStripHtml(url.toString())
}

async function fetchExport(exportUrl: string, source: string): Promise<{ text: string; source: string } | { error: string }> {
  try {
    const res = await fetch(exportUrl, { redirect: 'follow' })
    if (!res.ok) {
      // 401/403 means the doc isn't publicly shared.
      if (res.status === 401 || res.status === 403) {
        return { error: `${source} doc isn't shared publicly. Open the doc, click Share, set 'Anyone with the link can view', then try again.` }
      }
      return { error: `${source} export failed (${res.status}). Make sure the doc is shared publicly.` }
    }
    const text = (await res.text()).trim()
    if (text.length < 50) {
      return { error: `${source} doc looks empty. Make sure it has script content before generating.` }
    }
    return { text, source }
  } catch (err) {
    return { error: `Failed to fetch ${source}: ${err instanceof Error ? err.message : 'unknown error'}` }
  }
}

async function fetchAndStripHtml(url: string): Promise<{ text: string; source: string } | { error: string }> {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 AFF-Coaching-Bot' } })
    if (!res.ok) {
      return { error: `Couldn't read URL (${res.status}). The resource might be auth-walled or JS-rendered.` }
    }
    const html = await res.text()
    // Crude HTML strip: kill scripts/styles, strip tags, collapse whitespace.
    // Good enough for static pages, blog posts, etc. Anything dynamic
    // ends up as gibberish, which the AI will flag back to the admin.
    const text = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    if (text.length < 100) {
      return { error: "Page has almost no text content. Likely JS-rendered or auth-walled. Re-host as Google Docs/Slides or paste manually." }
    }
    return { text, source: 'web page' }
  } catch (err) {
    return { error: `Failed to fetch URL: ${err instanceof Error ? err.message : 'unknown error'}` }
  }
}

// Cap fetched content sent to Claude. Keeps token cost predictable
// and stops a 100-page Google Doc from blowing past max-tokens. The
// outline generator only needs the first ~50k chars (roughly 12k
// tokens) to do a credible job.
const MAX_RAW_CHARS = 50_000

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
  // Resolution order:
  //  1. rawScriptContent in the request body (manual fallback for
  //     Canva / auth-walled URLs)
  //  2. Auto-fetched from the resource URL
  //  3. Previously-stored rawScriptContent (re-generate from cache)
  let raw = body.rawScriptContent?.trim() ?? ''
  let extractedSource: string | null = null
  if (!raw && resource.url) {
    const extracted = await extractFromUrl(resource.url)
    if ('error' in extracted) {
      return NextResponse.json({ error: extracted.error, autoFetchFailed: true }, { status: 422 })
    }
    raw = extracted.text
    extractedSource = extracted.source
  }
  if (!raw) raw = (resource.rawScriptContent ?? '').trim()
  if (raw.length > MAX_RAW_CHARS) raw = raw.slice(0, MAX_RAW_CHARS)
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
    extractedSource,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  })
}
