# Success Diagnostic: mycadre Implementation Guide

A precise porting guide for building the Success Diagnostic into **mycadre**
(the multi-tenant whitelabel SaaS). The working reference implementation lives
in this repo (AFF) and is the source of truth for wording, formulas, and access
rules. This doc tells a mycadre session exactly what to port, what to change for
multi-tenancy, and where the AFF files are.

AFF is the read-only reference for the mycadre rebuild; do not import from it,
re-implement in mycadre's stack and conventions.

---

## 1. What the feature is

A behavioral assessment. The taker answers **120 items across 10 modules**.
Scoring produces an **800-point overall score**, a **class band**, four
**probability indicators**, the **#1 limiting factor**, and an
**honesty/consistency check**. Three audiences see three different projections
of the same result (this tiering is the core requirement).

Three-stage flow:
1. **Take it.** A public shareable link for prospects (credited to the sharing
   member) and an in-app take-flow for existing members.
2. **Results.** Shown immediately after submit and (optionally) emailed.
3. **Coaching + ops.** Upline sees a coaching view of their downline's results;
   tenant admins see everything with filtering, grouping, and export.

---

## 2. Reference files in AFF (port these)

| Concern | AFF file | Notes |
|---|---|---|
| Question bank (verbatim 120 items) | `src/lib/diagnostic/questions.ts` | Copy the `QUESTIONS`, `MODULES`, and type defs verbatim. |
| Scoring engine | `src/lib/diagnostic/scoring.ts` | Copy the formulas exactly (see section 5). |
| Access-tier serializers | `src/lib/diagnostic/access.ts` | The subject/coaching/vault projections. |
| Server service (persist, load, team query) | `src/lib/diagnostic/service.ts` | Rewrite for mycadre's ORM + tenancy. |
| Prisma model + enums | `prisma/schema.prisma` (`DiagnosticResult`) | Add `tenantId` (see section 4). |
| Migration | `prisma/migrations/20260711000000_success_diagnostic/` | Reference SQL. |
| Submit API | `src/app/api/diagnostic/submit/route.ts` | |
| Public result API | `src/app/api/diagnostic/result/[id]/route.ts` | Capability-token read. |
| Member APIs | `src/app/api/agents/diagnostic/route.ts`, `.../[id]/route.ts` | Own + team coaching. |
| Admin APIs | `src/app/api/vault/diagnostic/route.ts`, `.../[id]/route.ts` | Full tier. |
| Public UI | `src/app/diagnostic/page.tsx`, `src/app/diagnostic/results/[id]/page.tsx` | |
| Member UI | `src/app/agents/diagnostic/page.tsx` | Own result + team coaching list. |
| Admin UI | `src/app/vault/diagnostic/page.tsx`, `.../[id]/page.tsx` | List + filter + group + CSV + detail. |
| Visual reference | `aff-success-diagnostic-mockup.html` (repo root) | Score gauge, module bars, probability meters. |

---

## 3. Multi-tenancy: what changes for mycadre

AFF is single-org. mycadre is multi-tenant whitelabel, so:

1. **Tenant scoping.** Every `DiagnosticResult` gets a `tenantId`. Every query,
   the share link, the recruiter lookup, and the team traversal must be scoped
   to the tenant. The public take-link is per tenant (e.g.
   `/{tenant}/diagnostic?ref=<memberCode>`), and results only resolve within
   their tenant.
2. **Whitelabel module names.** The 10 module display names (including the
   "Building Capacity" rename) should be tenant-overridable copy, not
   hardcoded. Ship the AFF names as defaults; let a tenant rename them. The
   internal module **keys** (`self_awareness`, `building`, etc.) never change,
   only the display strings.
3. **Tenant-customizable question bank (optional, phase 2).** AFF hardcodes the
   120 items as a versioned constant. For mycadre, consider storing the bank
   per tenant (a `DiagnosticQuestion` table keyed by `tenantId` + `version`) so
   tenants can edit items. Keep `version` on each result so old results still
   score against the bank they were taken with. If you defer this, ship the
   shared constant bank exactly as AFF does.
4. **Org hierarchy.** AFF's upline/downline is stringly-typed
   (`recruiterId` = the recruiter's member code; `cft` = a free-text trainer
   name). **mycadre should use a real self-relation FK** on the member/profile
   model (`recruiterId -> Member.id`) and a proper trainer assignment, then the
   authorization walk (section 6) becomes a clean recursive query instead of
   string matching. This is the single biggest improvement to make while
   porting.
5. **Roles.** Map AFF's `admin` / `licensing_coordinator` / `agent` to
   mycadre's tenant roles. "Vault" = tenant admin/staff area; "agent portal" =
   member area.

---

## 4. Data model

Port the `DiagnosticResult` model. Add `tenantId` and index it. mycadre schema
(adapt to your ORM):

```prisma
enum DiagnosticClass { ENTRY EMERGING DEVELOPING ADVANCED ELITE }
enum DiagnosticRisk  { NEEDS_IMPROVEMENT MODERATE ON_TRACK STRONG }
enum DiagnosticStatus { IN_PROGRESS COMPLETED }

model DiagnosticResult {
  id          String   @id @default(cuid())
  tenantId    String                       // NEW for mycadre; scope everything by it
  createdAt   DateTime @default(now())
  submittedAt DateTime?
  status      DiagnosticStatus @default(COMPLETED)
  version     Int      @default(1)

  // taker identity
  firstName String
  lastName  String
  email     String
  phone     String?
  company   String?
  state     String?

  // links (use real FKs in mycadre)
  subjectMemberId String?    // the taker if they are an existing member
  recruiterCode   String?    // credited referrer (member code / id)
  recruiterName   String?    // free-text "who referred you"
  source          String @default("public_link") // public_link | member_app

  // computed
  overallScore     Int             // 0..800
  overallClass     DiagnosticClass
  risk             DiagnosticRisk
  limitingModule   String
  recommendedFocus String
  moduleScores          Json       // [{ key, name, pct, class }]
  probabilities         Json       // { licensing, retention, network, leadership }
  consistencyIndex      Int
  consistencyPenaltyPct Int
  consistencyLabel      String
  answers               Json       // raw { questionKey: number } (admin-only)

  // attribution
  ipAddress String?
  userAgent String?
  pageUrl   String?

  @@index([tenantId, createdAt])
  @@index([tenantId, subjectMemberId])
  @@index([tenantId, recruiterCode])
  @@index([tenantId, overallClass])
}
```

---

## 5. Scoring (copy the formulas exactly)

All transparent and tunable; no external service. See `scoring.ts`.

**Answer encoding** the client sends (`answers` = `{ [questionKey]: number }`):
- `scale` -> integer 1..7
- `frequency` -> integer 0..4 (index into the 5 buckets: 0, 1-2, 3-4, 5-6, 7+)
- `choice` -> integer option index (0-based)

**Item score (0..100), higher = stronger:**
- scale: `norm = ((raw - 1) / 6) * 100`; if the item is `reverse`, `100 - norm`.
- frequency: `(raw / 4) * 100`.
- choice: `option.weight * 100` (weights are 0..1, authored in the bank).

**Module score** = mean of its answered item scores.

**Overall** = mean of the 10 module scores, then apply the consistency penalty,
then project to 800:
`overallScore = round((rawOverallMean * (1 - penalty)) / 100 * 800)`.

**Class bands** (same thresholds for a module % and the overall %):
`>=85 ELITE, >=75 ADVANCED, >=65 DEVELOPING, >=55 EMERGING, else ENTRY`.

**Risk** (from overall %, admin-only): `>=80 STRONG, >=68 ON_TRACK, >=55 MODERATE, else NEEDS_IMPROVEMENT`.

**Consistency / honesty check.** Within each module, compare the mean of the
positively-worded scale items (P) vs the reverse-worded ones (R), both oriented
so high = strong. The mean of `|P - R|` across modules is the inconsistency
index (0..100). Penalty: 0 below index 20, ramping linearly to a **15% cap** at
index 60. Labels: `<20 Highly consistent, <35 Consistent, <50 Some inconsistency, else Low consistency`. A perfectly consistent responder rates a statement and its opposite oppositely (gap 0); someone agreeing with both pulls them apart.

**Probability indicators** (0..100), weighted blends of module scores:
- licensing = 0.40*discipline + 0.35*identity + 0.25*self_awareness
- retention = 0.40*resilience + 0.35*mission + 0.25*pressure
- network   = 0.40*building + 0.35*network + 0.25*conversion
- leadership= 0.40*leadership + 0.35*conversion + 0.25*self_awareness

**Limiting factor** = lowest-scoring module; **recommended focus** = that
module's coaching tip (authored in `MODULES`).

### Matching Siebold's exact numbers (calibration)

Our scoring reproduces the **shape** of Siebold's report (same modules, class
banding, limiting factor, probabilities, consistency). It does **not**
reproduce his exact numbers, because his formula lives in an external tool and
we only observed one input/output sample. To close the gap, run a calibration
pass: submit the source assessment several times with **known, designed answer
vectors** (all 1s, all 7s, all 4s, all first-choice, each module isolated
high/low) from separate temp inboxes, capture each emailed report, and fit our
constants (item normalization, module weights, the 800 projection, class
thresholds, the penalty curve, and the four probability weights) to the
observed outputs. The single-use link means one submission per email address.
Treat this as an optional tuning step; the defaults above already rank people
correctly.

---

## 6. Access tiers (the core requirement)

Three projections of one row. Never leak a sensitive field by forgetting it in
one endpoint: centralize the projection (see `access.ts`) and have every
endpoint call it.

| Field | Subject (own) | Coaching (upline) | Admin (vault) |
|---|:--:|:--:|:--:|
| Overall score + class | yes | yes | yes |
| 10-module breakdown | yes | yes | yes |
| #1 limiting factor + recommended focus | yes | yes | yes |
| Probability indicators (licensing/retention/network/leadership) | yes | **no** | yes |
| Risk level (wash-out read) | **no** | **no** | yes |
| Consistency index + penalty (honesty check) | label only | **no** | yes |
| Raw answers | **no** | **no** | yes |
| Full contact PII + attribution | own | name only | yes |

- **Subject** = the person who took it (positive framing; no risk label, no
  consistency mechanics, no raw answers).
- **Coaching** = a member's upline recruiter OR trainer. Built for day-to-day
  coaching: score, class, modules, limiting factor, focus, completion date.
  Deliberately excludes risk, probabilities, consistency, answers, PII beyond
  the name.
- **Admin/vault** = tenant staff. Everything.

**Upline authorization.** A member may see the coaching view of anyone in their
**downline** (walk the recruiter chain) OR anyone they train. In AFF this is
`authorizeTeamMemberAccess` in `src/lib/trainer-trainees.ts` (string-chain walk,
cycle-guarded, plus a normalized trainer-name match). In mycadre, with real FKs,
this is a recursive CTE / ancestor check plus a trainer-assignment lookup, all
tenant-scoped. "The entire upline sees the results" is the intended behavior.

---

## 7. API contracts

- `POST /diagnostic/submit` -> body `{ firstName, lastName, email, phone?, company?, state?, recruiterCode?, recruiterName?, answers, pageUrl }` -> `{ ok, id }` or `{ error, missing? }`. Score server-side; never trust a client score. If a member is signed in, link `subjectMemberId` and set `source=member_app`. Validate `recruiterCode` resolves to a real member in the tenant.
- `GET /diagnostic/result/:id` -> `{ result: SubjectView }`. The id is an unguessable capability token (the emailed/own results link).
- `GET /member/diagnostic` -> `{ mine: SubjectView | null, team: CoachingListItem[] }`. `team` = downline + trainees who completed it, coaching tier, weakest-score-first.
- `GET /member/diagnostic/:id` -> `{ tier, result }` (subject if own, coaching if authorized upline, else 403).
- `GET /admin/diagnostic` -> `{ items: VaultListItem[], count }` (full tier; page filters/groups/exports client-side).
- `GET /admin/diagnostic/:id` -> `{ result: VaultView }` (everything).

View shapes are defined in `access.ts` (SubjectView, CoachingView, CoachingListItem, VaultView, VaultListItem).

---

## 8. UI surfaces

1. **Public assessment** (`/diagnostic`): welcome screen, lead capture (name,
   email, company optional, "who referred you" optional), then one question per
   screen grouped by module, progress bar, Back/Next, save-as-you-go. Reads
   `?ref=<memberCode>` for attribution. Match the mockup's premium light/navy/
   gold look; support light and dark.
2. **Results** (`/diagnostic/results/:id`): score gauge (x/800), overall class
   pill, 10-module bars colored by class, #1 limiting factor callout, four
   probability meters, recommended focus, consistency badge (label only). No
   risk field.
3. **Member app** (`/member/diagnostic`): the member's own result card + a
   "your team" coaching list with filters (class, weakest module, search),
   weakest-first sort, and a drill-in showing the coaching view only. A
   "share your link" action copies the tenant take-link with the member's ref.
4. **Admin** (`/admin/diagnostic`): metric cards, full filtering (class, risk,
   weakest module, recruiter, state, search, min score), **group by** (class /
   risk / weakest module / recruiter / state), CSV export of the filtered set,
   and a per-result detail page with the full report including the risk pill,
   probability meters, and the internal consistency/integrity panel.

House rule carried from AFF: **no em-dashes** in user-visible text.

---

## 9. Suggested build sequence

1. Schema + migration (`DiagnosticResult` with `tenantId`).
2. Port `questions.ts` (bank), `scoring.ts` (formulas), `access.ts` (tiers).
3. Service layer: persist, load, tenant-scoped team traversal (recursive over
   your real member FK).
4. Submit + public-result APIs; then the public take-flow + results UI. Verify
   end to end with a real submission.
5. Member APIs + member UI (own + team coaching).
6. Admin APIs + admin UI (list, filter, group, CSV, detail).
7. Optional: emailed results, tenant-editable module names, tenant-editable
   question bank, Siebold calibration pass.
