# Article Publishing SOP — All Financial Freedom

## How Articles Get Published

Articles in `content/drafts/` are automatically published to `content/blog/` by a GitHub Actions workflow that runs **Tuesday and Friday at 9am ET**. It picks the oldest draft, updates the date to today, and moves it live — triggering a Vercel redeploy.

To queue an article for publishing, place the finished `.mdx` file in `content/drafts/`. Order of publish = alphabetical by filename, so prefix with a number if order matters (e.g. `01-article-title.mdx`).

---

## Required Frontmatter (copy this for every new article)

```yaml
---
title: "Your Article Title Here"
date: "YYYY-MM-DD"
category: "Wealth Building"
author: "All Financial Freedom"
excerpt: "One sentence that captures the article's value. Shown on the blog index and in Google previews. Keep under 160 characters."
coverImage: "/blog/your-image-filename.jpg"
tags: ["tag1", "tag2", "tag3"]
canonical: "https://allfinancialfreedom.com/blog/your-slug-here"
schema:
  type: "Article"
  speakable: true
---
```

### Field rules

| Field | Rule |
|-------|------|
| `title` | Sentence case. Use a number or strong hook. Max 70 characters for SEO. |
| `date` | Set to today or leave as placeholder — the auto-publisher updates it on publish. |
| `category` | Must match exactly one of: `Wealth Building`, `Insurance Planning`, `Budgeting & Planning`, `Retirement Planning`, `Asset Protection`, `Legacy Planning` |
| `author` | Always `"All Financial Freedom"` — never an individual name |
| `excerpt` | Under 160 characters. This shows on Google. Write it like a headline, not a summary. |
| `coverImage` | **Required.** See Cover Image SOP below. |
| `tags` | 3–6 tags, lowercase, descriptive. Used for SEO. |
| `canonical` | Full URL. Slug = filename without `.mdx`. |

---

## Cover Image SOP

Every article must have a cover image. No exceptions — articles without one show a plain navy placeholder on the blog index.

### Step 1 — Find an image

Use **Unsplash** (free, commercial license, no attribution required):
- Go to [unsplash.com](https://unsplash.com)
- Search for a concept matching the article (not literal — "wealth transfer" → search "family legacy" or "generational")
- Pick a horizontal/landscape photo that works cropped to roughly 1200×630

### Step 2 — Download optimized

Use this URL format to get a pre-compressed version directly from Unsplash:
```
https://images.unsplash.com/photo-PHOTO_ID?w=1200&q=75&fm=jpg&fit=crop
```

Find the photo ID in the Unsplash URL, e.g.:
`https://unsplash.com/photos/abc123def` → photo ID is `abc123def`

Full download URL: `https://images.unsplash.com/photo-abc123def?w=1200&q=75&fm=jpg&fit=crop`

Target file size: **under 200KB**. Reduce `q=` value (try 60) if over.

### Step 3 — Save locally

Save to: `public/blog/your-descriptive-name.jpg`

Name it after the article topic, not the Unsplash ID:
- ✅ `retirement-planning.jpg`
- ❌ `photo-1554224155-6726b3ff858f.jpg`

### Step 4 — Add to frontmatter

```yaml
coverImage: "/blog/your-descriptive-name.jpg"
```

---

## Article Format & Style

### Tone
- Direct, confident, educational — never condescending
- Write for someone who is smart but not a financial expert
- No jargon without explanation
- No fluff — every paragraph earns its place

### Structure
Every article should follow:
1. **Hook** — open with a stat, question, or counterintuitive statement (no H1 needed — the title is the H1)
2. **Problem** — establish what's at stake or what most people get wrong
3. **Body** — 3–6 H2 sections, each covering one key point
4. **Conclusion** — what to do next (the CTA block handles the booking prompt)

### Markdown supported
- `## H2` — gets a gold rule above it automatically
- `### H3` — subheadings
- `**bold**`, `*italic*`
- `- bullet lists` (renders with gold ◆ icon)
- `1. numbered lists`
- `> blockquote` — gold left border, italic
- Tables with `|` syntax
- `---` horizontal rule

### Length
- Minimum 600 words for SEO value
- Sweet spot: 900–1,400 words
- Long-form (1,500+) only if the topic genuinely warrants it

---

## Categories & Topic Ideas

| Category | Article ideas |
|----------|--------------|
| Wealth Building | Index funds vs whole life, how compound interest actually works, the $68T transfer follow-ups |
| Insurance Planning | Term vs whole vs IUL, how to choose coverage amounts, what happens if you're uninsured |
| Budgeting & Planning | Zero-based budgeting, the 50/30/20 rule debunked, emergency fund myths |
| Retirement Planning | When to start a Roth IRA, Social Security timing strategy, the 4% rule |
| Asset Protection | Why LLCs matter, umbrella insurance, protecting your estate |
| Legacy Planning | How to set up a trust, the difference between a will and a trust, talking to your kids about money |

---

## Checklist Before Moving to drafts/

- [ ] Frontmatter complete (all fields filled, no empty strings)
- [ ] Cover image downloaded to `public/blog/` and referenced in `coverImage`
- [ ] Excerpt is under 160 characters and compelling
- [ ] Category matches the exact list above
- [ ] At least one H2 section
- [ ] No individual names as author (always "All Financial Freedom")
- [ ] Canonical URL matches the filename slug
