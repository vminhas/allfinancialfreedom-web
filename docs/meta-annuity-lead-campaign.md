# Meta Annuity Lead Campaign

End-to-end reference for the All Financial Freedom (AFF) retirement-income
lead system: what was built, how leads flow, every environment variable,
and the exact Meta setup steps to take it live.

> Status: code complete and merged to `main`. Going live requires the Meta
> dashboard setup + env vars + a redeploy + two human sign-offs (see
> [§10 Launch checklist](#10-launch-checklist) and
> [§11 Open items & human gates](#11-open-items--human-gates)).

---

## Table of contents

1. [Goal & strategy](#1-goal--strategy)
2. [Architecture overview](#2-architecture-overview)
3. [The two capture funnels](#3-the-two-capture-funnels)
4. [What was built (components)](#4-what-was-built-components)
5. [Data model](#5-data-model)
6. [Lead scoring](#6-lead-scoring)
7. [Compliance & TCPA](#7-compliance--tcpa)
8. [Environment variables](#8-environment-variables)
9. [Meta setup runbook](#9-meta-setup-runbook)
10. [Launch checklist](#10-launch-checklist)
11. [Open items & human gates](#11-open-items--human-gates)
12. [Operations (how staff work leads)](#12-operations-how-staff-work-leads)
13. [Testing & smoke test](#13-testing--smoke-test)
14. [File & route reference](#14-file--route-reference)
15. [Change history (PRs)](#15-change-history-prs)

---

## 1. Goal & strategy

Generate qualified annuity / retirement-income leads via Meta (Facebook +
Instagram) under the AFF brand; licensed agents do their own follow-up.
**Quality over volume.** Optimize for cost per booked appointment, not
cheapest lead.

Flow: cold audience → education-first ad → lead capture (Meta Instant Form
**or** the AFF landing page) → instant auto-text + email + agent call →
booked appointment.

- **Brand:** All Financial Freedom (AFF). Navy + gold.
- **Site:** https://allfinancialfreedom.com
- **Contact:** contact@allfinancialfreedom.com · 917-603-5893
- **CRM / messaging:** GoHighLevel (GHL / LeadConnector), already integrated.

---

## 2. Architecture overview

```
                 ┌─────────────────────────────────────────────┐
   Meta ad ───┐  │                 AFF lead pipeline            │
              │  │                                             │
  ┌───────────▼──┴──┐    ┌──────────────────┐                   │
  │ Meta Instant    │    │ POST /api/leads/ │   shared fan-out  │
  │ Form            │    │ annuity (landing)│  (lib/lead-       │
  │  → webhook      │    │                  │   pipeline)       │
  │ /api/leads/     │    │                  │                   │
  │ meta-webhook    │    │                  │                   │
  └───────┬─────────┘    └────────┬─────────┘                   │
          │  both write the lead  │                             │
          ▼                       ▼                             │
   ┌──────────────────────────────────────┐                    │
   │  Postgres: annuity_leads (TCPA record)│                    │
   └──────────────┬───────────────────────┘                    │
                  │ best-effort fan-out                         │
       ┌──────────┼───────────────┬───────────────┐            │
       ▼          ▼               ▼               ▼            │
   GHL contact  Instant SMS    Confirmation    Discord         │
   + tags       (speed-to-     email           staff alert     │
                lead)                                           │
                  │                                             │
                  ▼ (landing only) Meta Pixel + CAPI "Lead"     │
   Staff work leads in Vault → CRM → Ad Leads ◄─────────────────┘
```

Both capture paths converge on the **same** Postgres table and the **same**
fan-out, so there is one source of truth, consistent scoring, and a single
Vault view. The lead's `source` column records which path it came from.

---

## 3. The two capture funnels

| | Landing page | Meta Instant Form |
|---|---|---|
| Where | `/retirement-income` on allfinancialfreedom.com | In-platform (built in Ads Manager) |
| Entry endpoint | `POST /api/leads/annuity` | `POST /api/leads/meta-webhook` |
| Tracking | Meta Pixel + Conversions API (`Lead`) | Meta already records the conversion |
| Abuse controls | Rate limit + honeypot + sanitization | Signed webhook (Meta-only) |
| Typical cost/quality | Higher cost per lead, higher intent | Cheaper, higher volume, lower friction |
| `source` value | `landing_page` | `meta_instant_form` |

Run both and compare `source` in the Vault to see which produces better
cost per booked call.

> If using GHL's **native** Facebook lead integration, turn it OFF. The
> webhook already routes Instant Form leads to GHL; running both
> double-texts the lead.

---

## 4. What was built (components)

- **Landing page** — `/retirement-income`, navy/gold, education-first, the
  4 single-select qualifiers + a multi-select account-types question +
  name/email/phone + a verbatim TCPA consent checkbox. Thank-you page with
  click-to-call. SEO: indexable, canonical, OpenGraph, JSON-LD (Service +
  FAQ), in the sitemap.
- **Lead capture API** (`/api/leads/annuity`) — validates input, stores the
  lead as the **TCPA system of record** (consent text, timestamp, IP, user
  agent, page URL, UTM/fbclid), then fans out.
- **Shared lead pipeline** (`lib/lead-pipeline`) — GHL contact upsert + tags
  + instant SMS + confirmation email; Discord staff alert. Used by both
  capture routes.
- **Meta Pixel** (`components/MetaPixel`) — site-wide, env-gated; fires
  `Lead` with an `eventID` shared with the server CAPI event (de-dupe).
- **Meta Conversions API** (`lib/meta-capi`) — server-side `Lead` event,
  SHA-256 hashed PII, env-gated, token sent in the POST body (not the URL).
- **Meta Instant Form webhook** (`/api/leads/meta-webhook`,
  `lib/meta-leadgen`) — signature-verified, fetches the lead from the Graph
  API, maps answers by value, stores + fans out idempotently.
- **Abuse hardening** (`lib/lead-abuse-guard`) — per-IP + per-recipient rate
  limits, a hidden honeypot field, input sanitization (HTML-escape for
  email, single-line for SMS), and length caps.
- **Vault view** (`/vault/leads`, "CRM → Ad Leads") — staff list with
  score + source badges, click-to-call, status + notes, and the full
  consent + attribution record. Admin + Licensing Coordinator access.
- **Lead scoring** (`lib/annuity-leads`) — A / STANDARD / NURTURE.

---

## 5. Data model

`AnnuityLead` (table `annuity_leads`) + enums `LeadStatus`, `LeadScore`.
Defined in `prisma/schema.prisma`.

| Field | Type | Notes |
|---|---|---|
| `id`, `createdAt` | id / timestamp | |
| `firstName`, `lastName`, `email`, `phone` | string | contact |
| `ageBand`, `savingsBand`, `incomeTiming`, `priority` | string | single-select qualifiers (stored as the label) |
| `accountTypes` | string[] | multi-select retirement account types |
| `score` | `LeadScore` | `A` / `STANDARD` / `NURTURE` |
| `status` | `LeadStatus` | `NEW` / `CONTACTED` / `BOOKED` / `NURTURE` / `WON` / `DEAD` |
| `source` | string | `landing_page` / `meta_instant_form` |
| `consentText`, `consentedAt` | string / timestamp | verbatim TCPA record |
| `ipAddress`, `userAgent`, `pageUrl` | string? | landing-page leads only |
| `utmSource/Medium/Campaign/Content/Term`, `fbclid`, `referrer` | string? | ad attribution |
| `ghlContactId`, `metaEventId` | string? | integration bookkeeping (`metaEventId` doubles as the Instant Form `leadgen_id` for idempotency) |
| `notes`, `lastContacted` | string? / timestamp? | staff follow-up |

Migrations: `20260628000000_annuity_leads`, `20260628120000_lead_account_types`,
`20260628140000_lead_source`. They apply on the production deploy via
`prisma migrate deploy`.

### Form questions (in order)

1. **Age** — Under 50 / 50-59 / 60-69 / 70+
2. **Retirement savings** — Under $50k / $50k-$100k / $100k-$250k / $250k-$500k / $500k+
3. **Retirement account types** (multi) — 401(k), 403(b) & TSP / Traditional or Roth IRA / Pension / Savings, CDs, brokerage & cash / Other
4. **Income starts** — Right away / 1-3 yrs / 4-10 yrs / Just exploring
5. **Priority** — Income I can't outlive / Protect from market loss / Growth / Leave to family

> The Meta Instant Form should use these exact answer labels so the webhook
> maps them automatically. Unmatched answers are preserved in the lead note.

---

## 6. Lead scoring

`scoreLead()` in `lib/annuity-leads.ts`, from savings + timing:

- **A (call first)** — $100k+ saved AND income needed **Right away** or **1-3 yrs**
- **NURTURE** — **Under $50k** saved OR **Just exploring** (drip, not a same-day call)
- **STANDARD** — everyone else

Score drives the GHL tag (`lead-score-a/standard/nurture`) and the Discord
alert heat label. Account types are captured for context but do not affect
the score.

---

## 7. Compliance & TCPA

- **TCPA:** the consent checkbox text (`CONSENT_TEXT` in `lib/annuity-leads`)
  is shown verbatim above the submit button and stored on every lead with a
  timestamp, IP, user agent, and page URL. Honors STOP (GHL auto-appends the
  opt-out line on the first SMS).
- **Insurance ad rules (NAIC Model 570 + state law):** copy is truthful and
  avoids "guaranteed / never lose money / risk-free / best"; uses the word
  "annuity"; discloses that this is an insurance solicitation and that a
  licensed insurance agent will contact you.
- **House style:** no em-dashes in any user-visible text (emails, page copy,
  SMS, labels). Ranges use plain hyphens.
- **Human gates before spend:** counsel sign-off on the consent text;
  carrier/IMO ad pre-approval. See [§11](#11-open-items--human-gates).

---

## 8. Environment variables

Set on the **Vercel project** (Production + Preview unless noted).

| Variable | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | Pixel + CAPI | Public. Current value: `1004721509141402` |
| `META_CAPI_ACCESS_TOKEN` | Conversions API | Secret. Events Manager → Conversions API |
| `META_CAPI_TEST_EVENT_CODE` | Testing only | Optional, remove before real traffic |
| `META_GRAPH_VERSION` | Pixel/CAPI/webhook | Optional, defaults to `v21.0` |
| `META_WEBHOOK_VERIFY_TOKEN` | Instant Form webhook | Must match the Meta webhook config. Current value: `affmetaads2026` |
| `META_APP_SECRET` | Instant Form webhook | Meta App → Settings → Basic. Verifies payload signature |
| `META_PAGE_ACCESS_TOKEN` | Instant Form webhook | Long-lived Page token to read leads via Graph API |
| `DISCORD_LEADS_CHANNEL_ID` | Discord alert | Optional; falls back to `DISCORD_ADMIN_CHANNEL_ID` |
| `GHL_API_KEY` / `GHL_LOCATION_ID` | GHL SMS/email | Already configured (also read from `/vault/settings`) |

Local dev: the public Pixel ID and CAPI token live in `.env.local`.

---

## 9. Meta setup runbook

Do these in order. Verification is **not** a blocker for annuity ads (see
the note in step 1).

### Step 1 — Business Manager (no verification needed)
URL: https://business.facebook.com/settings
- The Security Center says the business does not need verification. Annuities
  are insurance, not a special ad category (credit/employment/housing/
  politics), so you should not be prompted for one. Skip it unless Meta
  forces it later.

### Step 2 — Finish the Facebook Page
URL: https://business.facebook.com/latest/settings/pages
- Pick the logo (leaning B Sunrise), export profile + cover photos, set the
  handle `@AllFinancialFreedom`, and add the CTA button.

### Step 3 — Events Manager: dataset + CAPI token
URL: https://business.facebook.com/events_manager2/list/dataset
- Dataset already created: **All Financial Freedom**, ID `1004721509141402`.
- Open the dataset → **Settings** tab → scroll to **Conversions API** →
  **Generate access token** → this is `META_CAPI_ACCESS_TOKEN`.

### Step 4 — Domain verification
URL: https://business.facebook.com/settings/owned-domains
- Add `allfinancialfreedom.com`.
- Use the meta-tag method (hand the `<meta name="facebook-domain-verification">`
  value to the dev to add) or a DNS TXT record in Vercel.

### Step 5 — Aggregated Event Measurement
URL: https://business.facebook.com/events_manager2/list/dataset (Aggregated
Event Measurement tab)
- Prioritize the **Lead** event for the domain.

### Step 6 — Create a Meta App (Instant Form webhook funnel only)
URL: https://developers.facebook.com/apps/
- **You do not have an app yet, so create one.** This app is required ONLY
  for the Instant Form webhook. The landing page + Pixel + CAPI do NOT need
  it, so if you launch landing-page-first you can skip steps 6-7 for now.
- Click **Create App** → if asked for a use case pick **Other** → app type
  **Business** → name it e.g. `AFF Lead Ads` → link your Business portfolio.

### Step 7 — App Secret, Page token, and the leadgen webhook
- **App Secret** → `META_APP_SECRET`
  URL: https://developers.facebook.com/apps/ → your app → **App settings →
  Basic** → click **Show** next to **App Secret**.
- **Page access token** → `META_PAGE_ACCESS_TOKEN`
  URL (Graph API Explorer): https://developers.facebook.com/tools/explorer/
  - Select your app → **Get token → Get Page Access Token** → choose the AFF
    Page → grant `leads_retrieval`, `pages_show_list`,
    `pages_read_engagement`, `pages_manage_metadata`.
  - Make it long-lived: paste it into the Access Token Debugger and click
    **Extend Access Token**.
    URL: https://developers.facebook.com/tools/debug/accesstoken/
- **Webhook** → your app → **Webhooks** (add the Webhooks product if not
  present)
  URL: https://developers.facebook.com/apps/ → your app → **Webhooks**
  - Subscribe to the **Page** object.
  - Callback URL: `https://allfinancialfreedom.com/api/leads/meta-webhook`
  - Verify token: `affmetaads2026` (this is `META_WEBHOOK_VERIFY_TOKEN`)
  - After it verifies, subscribe to the **`leadgen`** field, then **subscribe
    the AFF Page**.
- Note: live leadgen delivery can require Advanced Access to
  `leads_retrieval`. While the app is in Development mode it works for users
  who have a role on both the app and the Page (i.e. you), which is enough
  for testing and a small launch. Request Advanced Access / App Review
  before scaling beyond app-role users.

### Step 8 — Vercel env vars
URL: Vercel → your project → Settings → Environment Variables
- Add everything from [§8](#8-environment-variables) that you now have
  (including `META_WEBHOOK_VERIFY_TOKEN=affmetaads2026`).

### Step 9 — Redeploy
- Triggers `prisma migrate deploy` (creates/updates the `annuity_leads`
  table) and loads the new env vars.

### Step 10 — Build the campaign
URL: https://adsmanager.facebook.com
- Leads campaign + Higher-Intent **Instant Form** (use the exact answer
  labels from [§5](#5-form-questions-in-order) so they auto-map) + the 3 ad
  creatives. Each creative must include "a licensed insurance agent will
  contact you."
- Decide: send retarget/non-booker traffic to `/retirement-income`.

### Step 11 — Test, then turn off duplicate routing
- Run the smoke test ([§13](#13-testing--smoke-test)). Meta's Lead Ads
  Testing Tool: https://developers.facebook.com/tools/lead-ads-testing
- Turn OFF any GHL native Facebook lead integration so leads aren't
  texted twice.

---

## 10. Launch checklist

- [ ] Page finished (logo, handle, photos, CTA)
- [ ] Events Manager dataset (done) + CAPI token generated
- [ ] Domain verified
- [ ] Lead event prioritized (AEM)
- [ ] App Secret + Page token + `leadgen` webhook configured & Page subscribed
- [ ] All env vars set in Vercel
- [ ] Redeployed (migrations applied)
- [ ] Discord staff "leads" channel created + `DISCORD_LEADS_CHANNEL_ID` set
- [ ] Leads campaign + Instant Form + 3 creatives built
- [ ] Smoke test passed on both paths
- [ ] GHL native FB integration turned OFF
- [ ] ⚖️ Counsel signed off on consent text
- [ ] 🏢 Carrier/IMO approved the ads

---

## 11. Open items & human gates

- **Counsel sign-off** on the TCPA consent text (working copy is in
  `lib/annuity-leads.ts`).
- **Carrier/IMO ad pre-approval** for the creatives.
- **Logo pick** for the Page.
- These are not code; nothing ships to paid traffic until they're done.

---

## 12. Operations (how staff work leads)

- **Vault → CRM → Ad Leads** (`/vault/leads`): every lead, filterable by
  score and status, searchable by name/email/phone.
- **A-leads** ($100k+ and near-term) are flagged "call first" - call these
  immediately; speed-to-lead wins.
- Each lead shows: contact (click-to-call), score, source (Landing vs Meta
  form), the 5 qualifier answers, the full TCPA consent record, ad
  attribution, and the GHL contact id.
- Update **status** (NEW → CONTACTED → BOOKED → WON, or NURTURE / DEAD) and
  add **notes** inline; setting status past NEW stamps "last contacted."
- **Discord:** every lead posts to the staff leads channel with a heat label.
- Access is limited to **admin + Licensing Coordinator**.

---

## 13. Testing & smoke test

**Landing page (live):** submit `/retirement-income` with a real name/email/
phone, then confirm:
1. Redirect to the thank-you page (click-to-call)
2. Instant SMS arrives (single STOP line)
3. Confirmation email arrives (from operations@allfinancialfreedom.com)
4. Lead appears in Vault → CRM → Ad Leads (with the consent record)
5. Discord alert fires
6. Events Manager → Test Events shows the `Lead` event (browser + server)

If the lead lands in the Vault, the migration ran (the table exists).

**Instant Form:** use Meta's Lead Ads Testing Tool to submit a test lead;
confirm it appears in the Vault tagged "Meta form" and triggers the SMS/
email/Discord. Then delete the test lead.

---

## 14. File & route reference

**Routes**
- Public: `/retirement-income`, `/retirement-income/thank-you`
- API (public): `POST /api/leads/annuity`, `GET|POST /api/leads/meta-webhook`
- Vault: `/vault/leads`; `GET /api/vault/leads`; `PATCH /api/vault/leads/[id]`

**Key files**
- `src/app/(site)/retirement-income/page.tsx` · `.../thank-you/page.tsx`
- `src/components/AnnuityLeadForm.tsx` · `src/components/MetaPixel.tsx`
- `src/app/api/leads/annuity/route.ts` · `src/app/api/leads/meta-webhook/route.ts`
- `src/lib/annuity-leads.ts` (options, consent text, scoring)
- `src/lib/lead-pipeline.ts` (GHL + Discord fan-out)
- `src/lib/lead-abuse-guard.ts` (rate limit, sanitize, honeypot)
- `src/lib/meta-capi.ts` (Conversions API) · `src/lib/meta-leadgen.ts` (webhook)
- `src/lib/ghl.ts` (existing GHL client)
- `src/app/vault/leads/page.tsx` · `src/app/api/vault/leads/*`
- `src/components/vault/VaultSidebar.tsx` (nav) · `src/lib/permissions.ts` (LC access)
- `prisma/schema.prisma` + the three `*_annuity_leads` / `*_lead_*` migrations
- `src/app/sitemap.ts` (includes `/retirement-income`)

---

## 15. Change history (PRs)

| PR | What |
|---|---|
| #211 | Feature: landing page, lead capture, GHL/Discord/CAPI, Vault, Pixel |
| #212 | Security: send Meta CAPI token in POST body, not the URL |
| #213 | Security: harden the public endpoint (rate limit, honeypot, sanitize) |
| #214 | Add the multi-select retirement account-types question |
| #215 | Drop the redundant STOP line from the speed-to-lead SMS |
| #216 | SEO for the retirement-income page (indexable) |
| #217 | Meta Instant Form leads into the unified pipeline (webhook) |
