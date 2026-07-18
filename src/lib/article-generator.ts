// Weekly AFF blog article generator.
//
// Three Opus 4.8 calls, each smaller and verifiable than one mega-prompt:
//
//   1. RESEARCH:  Opus + web_search → top 5 newsworthy items in our
//                 services (life insurance, IUL, annuities, retirement,
//                 LTC, estate planning, kids life insurance).
//   2. PICK:      Opus reads the 5 candidates + the full corpus of
//                 existing articles, ranks by freshness / non-overlap /
//                 AFF relevance, picks the winner, and lists 2-3
//                 existing AFF articles worth backlinking.
//   3. WRITE:     Opus writes the full MDX (frontmatter + body) using
//                 the AFF style brief, with internal backlinks to the
//                 chosen related slugs.
//
// The cron route stores the result as a GeneratedArticle row in DRAFT.

import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from '@/lib/settings'
import { loadArticleCorpus, type CorpusEntry } from '@/lib/article-corpus'
import { db } from '@/lib/db'

// Opus 4.8 is the most capable Claude model as of this build. Locked
// here so a single edit upgrades all three calls.
const MODEL_ID = 'claude-opus-4-8'

// Permissible cover images. All known-working Unsplash IDs we have
// already validated on the live blog, so the auto-generator never
// picks a broken-image URL.
const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=1200&q=85&fit=crop', // savings / finance
  'https://images.unsplash.com/photo-1565514158740-064f34bd6cfd?w=1200&q=85&fit=crop', // family
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=85&fit=crop', // money / generational
  'https://images.unsplash.com/photo-1579621970795-87facc2f976d?w=1200&q=85&fit=crop', // gold coins
  'https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1200&q=85&fit=crop', // bank columns
  'https://images.unsplash.com/photo-1518458028785-8fbcd101ebb9?w=1200&q=85&fit=crop', // strategy
  'https://images.unsplash.com/photo-1434626881859-194d67b2b86f?w=1200&q=85&fit=crop', // retirement
  'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1200&q=80', // business
  // Additional known-good IDs already rendering on the live blog, to widen the
  // pool so random picks collide far less often.
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=85&fit=crop', // office / planning
  'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=85&fit=crop', // documents / desk
  'https://images.unsplash.com/photo-1611095973763-414019e72400?w=1200&q=85&fit=crop', // charts / market
  'https://images.unsplash.com/photo-1638272181967-7d3772a91265?w=1200&q=85&fit=crop', // 401k / investing
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1200&q=85&fit=crop', // athlete / performance
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&q=85&fit=crop', // education / college
  'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&q=85&fit=crop', // health / care
  'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&q=85&fit=crop', // senior / living benefits
]

// AFF house style brief. Encoded once here so the writer prompt is a
// single editable string. Mirrors CLAUDE.md.
const AFF_STYLE_BRIEF = `
You are writing for All Financial Freedom (AFF), a licensed financial services agency
helping families with life insurance, IUL, annuities, retirement planning, mortgage
protection, and legacy planning. The CEO is Karmvir "Vick" Minhas. Brand abbreviation: AFF.

Voice: confident, contrarian-to-naive-headlines, data-backed, motivational, helpful.
Audience: affluent working professionals, business owners, and families.

HARD RULES:
- NO em-dashes anywhere in the body. Use commas, colons, periods, parentheses, or " · " instead.
- Use sentence case for headlines. ONE italic accent word per H1 / H2 max.
- Bold key statistics inline. Cite every numeric claim from a source URL provided.
- No guaranteed-return language ("you'll make $X", "guaranteed to double", "crushing it").
- No first-person earnings stories. No "I" claims about specific income.
- No "absolutely", "happy to help", "feel free to", "circle back", LinkedIn corporate filler.
- Author byline ALWAYS "All Financial Freedom". No individual byline.
- Include the standard strategy-call CTA at the end (provided in the prompt).
- Include a Sources section at the end with markdown links to every URL used.
- Target length: 1,200 to 1,800 words of body (not counting frontmatter / sources).

STRUCTURE:
- Hook with the current event / statistic in the first paragraph.
- 4 to 6 H2 sections with H3 substeps where helpful.
- Honest caveats section near the end ("the part where I tell you the trade-offs honestly").
- 3-step "what to do this week" actionable closer.
- Closing pitch + CTA + Sources.

SEO:
- Title under 70 characters. Excerpt 200 to 320 characters (becomes the meta description).
- Include 2 to 3 internal links to other AFF articles using the relative URLs
  /blog/<slug> — slugs will be provided in the prompt.
- One link to the strategy-call booking widget (URL provided).
`.trim()

const STRATEGY_CALL_URL = 'https://links.allfinancialfreedom.com/widget/booking/ZOedxdwvtOnTS6Sg5n7Z'

const AFF_CATEGORIES = [
  'Wealth Building', 'Insurance Planning', 'Retirement', 'Retirement Planning',
  'Legacy Planning', 'Kids Head Start Plans', 'Budgeting & Planning',
  'Asset Protection', 'Business Owner Strategies', 'Family Banking',
  'Mortgage Protection',
]

export interface ResearchCandidate {
  hook: string
  dataPoints: string[]
  sourceUrls: string[]
  serviceTie: string
}

export interface PickResult {
  chosen: ResearchCandidate
  rationale: string
  relatedSlugs: string[]
}

export interface DraftResult {
  slug: string
  title: string
  category: string
  excerpt: string
  coverImage: string
  tags: string[]
  mdxBody: string
  sourceUrls: string[]
  relatedSlugs: string[]
}

function clientFor(apiKey: string): Anthropic {
  return new Anthropic({ apiKey })
}

function textFrom(message: Anthropic.Messages.Message): string {
  return message.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

function extractJson<T>(s: string): T {
  // Models occasionally wrap JSON in a code fence or add prose. Be
  // permissive: strip fences, find the first { or [, parse from there.
  let body = s.trim()
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) body = fence[1].trim()
  const firstBrace = Math.min(
    ...['{', '['].map(c => {
      const i = body.indexOf(c)
      return i === -1 ? Number.POSITIVE_INFINITY : i
    }),
  )
  if (Number.isFinite(firstBrace)) body = body.slice(firstBrace)
  return JSON.parse(body) as T
}

// ---------- Step 1: research ----------

export async function researchTopics(apiKey: string): Promise<ResearchCandidate[]> {
  const client = clientFor(apiKey)
  const res = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 4096,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 6,
      } as unknown as Anthropic.Messages.Tool, // SDK type covers this server-side tool
    ],
    messages: [
      {
        role: 'user',
        content: `It is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. Find the TOP 5 most newsworthy items from THIS WEEK in any of these areas, biased toward stories that genuinely help families:
- life insurance industry (LIMRA news, ownership / coverage gap reports)
- indexed universal life (IUL)
- annuities (fixed, indexed, RILA, FIA)
- retirement planning (401k, Roth IRA, Social Security, Medicare, pensions)
- long-term care
- estate planning + generational wealth transfer
- life insurance for kids
- mortgage protection
- business owner financial strategies

For each, return a one-sentence HOOK, 3 specific DATA_POINTS (numbers, percentages, quotes — only what is in cited sources), 3 SOURCE_URLS, and a one-sentence SERVICE_TIE explaining how it ties to a service AFF offers.

Output ONLY valid JSON in this exact shape:
{"candidates":[{"hook":"...","dataPoints":["...","...","..."],"sourceUrls":["...","...","..."],"serviceTie":"..."}, ... 5 entries ...]}`,
      },
    ],
  })
  const parsed = extractJson<{ candidates: ResearchCandidate[] }>(textFrom(res))
  const candidates = (parsed.candidates ?? []).slice(0, 5)
  if (candidates.length === 0) throw new Error('Research returned no candidates')
  return candidates
}

// ---------- Step 2: dedupe + pick ----------

export async function pickTopic(
  apiKey: string,
  candidates: ResearchCandidate[],
  corpus: CorpusEntry[],
): Promise<PickResult> {
  const client = clientFor(apiKey)
  const corpusJson = corpus.map(c => ({
    slug: c.slug,
    title: c.title,
    category: c.category,
    tags: c.tags,
    excerpt: c.excerpt,
  }))

  const res = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are picking the topic for THIS WEEK's AFF blog article.

CANDIDATES (from this week's news):
${JSON.stringify(candidates, null, 2)}

EXISTING AFF ARTICLES (already published on /blog):
${JSON.stringify(corpusJson, null, 2)}

Pick the SINGLE BEST candidate to write about this week. Rank by:
  (a) FRESHNESS / newsworthiness (real news, not evergreen)
  (b) NON-OVERLAP with existing articles. If the topic overlaps significantly with an existing AFF article (>40% topical overlap), prefer a different candidate — UNLESS the candidate is a fresh news update on the same topic, in which case treat the existing article as the sequel's anchor and backlink to it.
  (c) RELEVANCE to AFF services (life insurance, IUL, annuities, retirement, LTC).
  (d) HELPFULNESS — would a real family benefit from reading this?

Also pick 2-3 existing AFF articles (by slug) that the new article should backlink to as "related reading" so we link our content together for SEO.

Output ONLY valid JSON:
{"chosen": { ...the chosen candidate object verbatim... }, "rationale": "one or two sentences", "relatedSlugs": ["slug-1","slug-2","slug-3"]}`,
      },
    ],
  })
  const parsed = extractJson<PickResult>(textFrom(res))
  if (!parsed.chosen) throw new Error('Pick step returned no chosen candidate')
  parsed.relatedSlugs = (parsed.relatedSlugs ?? []).filter(s => corpus.some(c => c.slug === s)).slice(0, 3)
  return parsed
}

// ---------- Step 3: write ----------

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

export async function writeArticle(
  apiKey: string,
  pick: PickResult,
  corpus: CorpusEntry[],
  // Cover images used by recent articles, so we don't repeat one. Callers pass
  // the last dozen or so; we pick from what's left in the pool.
  excludeCovers: string[] = [],
): Promise<DraftResult> {
  const client = clientFor(apiKey)
  const todayIso = new Date().toISOString().slice(0, 10)
  const available = COVER_IMAGES.filter(c => !excludeCovers.includes(c))
  const pool = available.length ? available : COVER_IMAGES
  const cover = pool[Math.floor(Math.random() * pool.length)]

  const relatedRefs = pick.relatedSlugs.map(slug => {
    const found = corpus.find(c => c.slug === slug)
    return found ? `- /blog/${found.slug} · "${found.title}"` : ''
  }).filter(Boolean).join('\n')

  const res = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `${AFF_STYLE_BRIEF}

TODAY'S TOPIC:
${JSON.stringify(pick.chosen, null, 2)}

RELATED AFF ARTICLES TO BACKLINK NATURALLY (use 2-3 of these as inline links):
${relatedRefs}

STRATEGY CALL URL (include exactly once at the end inside the CTA paragraph):
${STRATEGY_CALL_URL}

CATEGORIES TO PICK FROM:
${AFF_CATEGORIES.join(', ')}

Write the complete article as a single MDX file with YAML frontmatter and Markdown body.

FRONTMATTER REQUIRED (exact field names, in this order):
title, date, category, author, excerpt, coverImage, readTime, tags, canonical, schema

VALUES:
- date: "${todayIso}"
- author: "All Financial Freedom"
- coverImage: "${cover}"
- canonical: "https://allfinancialfreedom.com/blog/<your-chosen-slug>"
- schema: { type: "Article", speakable: true }
- excerpt: 200 to 320 characters, no em-dashes
- readTime: a string like "9 min read"
- tags: 5 to 9 lowercase or natural-case keyword phrases

BODY:
- Hook → 4 to 6 H2 sections → honest caveats → 3-step "what to do this week" → closing CTA → Sources section.
- 2 to 3 inline links to the related articles using the /blog/<slug> URLs above.
- ONE link to the strategy call URL inside the closing CTA paragraph.
- NO em-dashes. Use commas, colons, periods, or " · " instead.
- Bold key stats inline using **markdown**.
- Sources section at the end with markdown links to every source URL referenced.

Output ONLY the MDX file content (frontmatter + body), nothing else, no code fences. Start with --- on line 1.`,
      },
    ],
  })

  let mdx = textFrom(res)
  // Defensive: strip any accidental code fence wrapping.
  const fence = mdx.match(/^```(?:mdx?|markdown)?\s*([\s\S]*?)```$/)
  if (fence) mdx = fence[1].trim()
  if (!mdx.startsWith('---')) throw new Error('Writer output missing frontmatter')

  // Parse the frontmatter for storage (we ALSO keep the full mdx).
  const matter = (await import('gray-matter')).default
  const { data } = matter(mdx)
  const title = String(data.title ?? '')
  if (!title) throw new Error('Writer output missing title')
  const slug = String(data.canonical ?? '').replace(/^.*\/blog\//, '').replace(/\/$/, '') || slugify(title)
  const category = String(data.category ?? 'Wealth Building')
  const excerpt = String(data.excerpt ?? '').slice(0, 1000)
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : []

  // Hard belt-and-suspenders: strip em-dashes from user-visible strings
  // (CLAUDE.md). Models slip occasionally.
  const stripEmDash = (s: string) => s.replace(/—/g, ',').replace(/–/g, '-')

  return {
    slug,
    title: stripEmDash(title),
    category,
    excerpt: stripEmDash(excerpt),
    coverImage: cover,
    tags,
    mdxBody: stripEmDash(mdx),
    sourceUrls: pick.chosen.sourceUrls,
    relatedSlugs: pick.relatedSlugs,
  }
}

// ---------- One-shot orchestrator ----------

export async function generateWeeklyDraft(): Promise<DraftResult> {
  const apiKey = await getSetting('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured in /vault/settings')

  const corpus = await loadArticleCorpus()
  const candidates = await researchTopics(apiKey)
  const pick = await pickTopic(apiKey, candidates, corpus)

  // Don't reuse a cover image a recent article already used.
  const recent = await db.generatedArticle.findMany({
    orderBy: { createdAt: 'desc' }, take: 15, select: { coverImage: true },
  }).catch(() => [] as { coverImage: string }[])
  const excludeCovers = recent.map(r => r.coverImage)

  return writeArticle(apiKey, pick, corpus, excludeCovers)
}
