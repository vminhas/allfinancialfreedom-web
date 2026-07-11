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

---

## 10. Full source of every involved file

Complete, verbatim source of the AFF implementation so a mycadre session can
port precisely. Fences use four backticks so nested code is safe. Adapt imports,
ORM calls, routing, and role checks to mycadre's stack; add `tenantId` scoping
(see section 3) to every query.

### prisma/schema.prisma (DiagnosticResult model + enums)

````prisma
// --- Success Diagnostic -----------------------------------------------------
// A behavioral assessment result. The taker answers 120 items across 10
// modules; scoring (see src/lib/diagnostic/scoring.ts) produces the 800-point
// overall, class bands, the four probability indicators, and the honesty /
// consistency check. Access to a row is tiered by viewer (see
// src/lib/diagnostic/access.ts): the subject sees their own report, an upline
// recruiter or trainer sees a coaching view, and admin/LC in the vault see
// everything (risk, probabilities, the consistency check, raw answers).

// Overall + per-module class band.
enum DiagnosticClass {
  ENTRY
  EMERGING
  DEVELOPING
  ADVANCED
  ELITE
}

// The wash-out read derived from the overall score. Vault-only in the UI.
enum DiagnosticRisk {
  NEEDS_IMPROVEMENT
  MODERATE
  ON_TRACK
  STRONG
}

enum DiagnosticStatus {
  IN_PROGRESS
  COMPLETED
}

model DiagnosticResult {
  id          String           @id @default(cuid())
  createdAt   DateTime         @default(now()) @map("created_at")
  submittedAt DateTime?        @map("submitted_at")
  status      DiagnosticStatus @default(COMPLETED)
  version     Int              @default(1)

  // Taker identity
  firstName String  @map("first_name")
  lastName  String  @map("last_name")
  email     String
  phone     String?
  company   String?
  state     String?

  // If the taker is an existing AFF agent, their AgentProfile id (loose link,
  // no FK, matching the recruiterId string-linking convention). recruiterCode
  // is the agentCode credited with the referral; recruiterName is the free
  // text "who referred you" answer.
  subjectProfileId String? @map("subject_profile_id")
  recruiterCode    String? @map("recruiter_code")
  recruiterName    String? @map("recruiter_name")
  source           String  @default("public_link") // public_link | agent_portal

  // Computed scores
  overallScore     Int             @map("overall_score") // 0..800
  overallClass     DiagnosticClass @map("overall_class")
  risk             DiagnosticRisk
  limitingModule   String          @map("limiting_module")
  recommendedFocus String          @map("recommended_focus")

  // Detail (JSON): moduleScores = [{key,name,pct,class}], probabilities =
  // {licensing,retention,network,leadership}, answers = raw {questionKey:value}
  moduleScores          Json @map("module_scores")
  probabilities         Json
  consistencyIndex      Int    @map("consistency_index")
  consistencyPenaltyPct Int    @map("consistency_penalty_pct")
  consistencyLabel      String @map("consistency_label")
  answers               Json

  // Attribution (best-effort)
  ipAddress String? @map("ip_address")
  userAgent String? @map("user_agent")
  pageUrl   String? @map("page_url")

  @@index([subjectProfileId])
  @@index([recruiterCode])
  @@index([overallClass, createdAt])
  @@index([createdAt])
  @@map("diagnostic_results")
}
````

### prisma/migrations/20260711000000_success_diagnostic/migration.sql

````sql
-- CreateEnum
CREATE TYPE "DiagnosticClass" AS ENUM ('ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE');

-- CreateEnum
CREATE TYPE "DiagnosticRisk" AS ENUM ('NEEDS_IMPROVEMENT', 'MODERATE', 'ON_TRACK', 'STRONG');

-- CreateEnum
CREATE TYPE "DiagnosticStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "diagnostic_results" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "status" "DiagnosticStatus" NOT NULL DEFAULT 'COMPLETED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "state" TEXT,
    "subject_profile_id" TEXT,
    "recruiter_code" TEXT,
    "recruiter_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'public_link',
    "overall_score" INTEGER NOT NULL,
    "overall_class" "DiagnosticClass" NOT NULL,
    "risk" "DiagnosticRisk" NOT NULL,
    "limiting_module" TEXT NOT NULL,
    "recommended_focus" TEXT NOT NULL,
    "module_scores" JSONB NOT NULL,
    "probabilities" JSONB NOT NULL,
    "consistency_index" INTEGER NOT NULL,
    "consistency_penalty_pct" INTEGER NOT NULL,
    "consistency_label" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "page_url" TEXT,

    CONSTRAINT "diagnostic_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_results_subject_profile_id_idx" ON "diagnostic_results"("subject_profile_id");

-- CreateIndex
CREATE INDEX "diagnostic_results_recruiter_code_idx" ON "diagnostic_results"("recruiter_code");

-- CreateIndex
CREATE INDEX "diagnostic_results_overall_class_created_at_idx" ON "diagnostic_results"("overall_class", "created_at");

-- CreateIndex
CREATE INDEX "diagnostic_results_created_at_idx" ON "diagnostic_results"("created_at");
````

### src/lib/diagnostic/questions.ts

````ts
// The AFF Success Diagnostic question bank.
//
// This is AFF's own behavioral assessment, structured as 10 modules of 12
// items each (120 scored items). Each module blends three item types so the
// score reflects behavior, not just self-image:
//   - scale:     7-point agreement (1 Strongly Disagree .. 7 Strongly Agree).
//                Some items are `reverse` scored (agreeing is the weak answer)
//                and double as the honesty / consistency check.
//   - choice:    "which describes you best" with a weight per option (0..1).
//   - frequency: "in the last 7 days, how many times did you ___" mapped to a
//                fixed 5-bucket scale (0 .. 7+ times) so recent action counts.
//
// The question wording, module names, weights, and reverse flags live here as
// the single source of truth so the taker UI, the scoring, and the stored
// record can never drift. House rule: no em-dashes in user-visible text.
//
// NOTE ON NAMING: the recruiting module is deliberately surfaced to users as
// "Building Capacity" (positive, growth framing), not "Recruiting". The key
// stays `building` everywhere.

export const DIAGNOSTIC_VERSION = 1

export type ModuleKey =
  | 'self_awareness'
  | 'resilience'
  | 'discipline'
  | 'identity'
  | 'building'
  | 'conversion'
  | 'network'
  | 'pressure'
  | 'mission'
  | 'leadership'

export interface ModuleMeta {
  key: ModuleKey
  order: number
  name: string        // user-facing module name
  blurb: string       // one-line description shown on the results page
  coachingTip: string // what a trainer should work on when this is the gap
}

// Order is the order questions are presented and modules are listed.
export const MODULES: ModuleMeta[] = [
  { key: 'self_awareness', order: 1, name: 'Self-Awareness & Integrity',
    blurb: 'How clearly you see your own behavior and own your mistakes.',
    coachingTip: 'Build a short daily self-review habit and normalize admitting misses out loud.' },
  { key: 'resilience', order: 2, name: 'Mental Toughness & Resilience',
    blurb: 'How well you keep taking action after rejection or a setback.',
    coachingTip: 'Reframe rejection as data and set an activity floor that holds regardless of results.' },
  { key: 'discipline', order: 3, name: 'Licensing Commitment & Discipline',
    blurb: 'Whether you follow through on the work when it is inconvenient.',
    coachingTip: 'Move to a daily plan and finish one hard task before noon, no urgency required.' },
  { key: 'identity', order: 4, name: 'Entrepreneurial Identity',
    blurb: 'How much you own your outcomes instead of waiting for structure.',
    coachingTip: 'Give ownership of one metric fully to them and remove the safety net gradually.' },
  { key: 'building', order: 5, name: 'Building Capacity',
    blurb: 'How naturally you start new conversations and open opportunities.',
    coachingTip: 'Set a daily new-conversation rep and script the first line so hesitation drops.' },
  { key: 'conversion', order: 6, name: 'Conversion Capacity',
    blurb: 'How comfortably you guide a conversation toward a decision.',
    coachingTip: 'Practice asking the direct question and staying in the pause after it.' },
  { key: 'network', order: 7, name: 'Warm Market & Referral Reach',
    blurb: 'How intentionally you expand your circle and reconnect.',
    coachingTip: 'Reconnect with two dormant contacts a day and ask for one introduction.' },
  { key: 'pressure', order: 8, name: 'Criticism & Pressure Resilience',
    blurb: 'How much outside opinion moves you off your plan.',
    coachingTip: 'Separate opinion from fact in writing and pre-decide the action before feedback lands.' },
  { key: 'mission', order: 9, name: 'Mission Alignment & Conviction',
    blurb: 'How connected your daily work is to a long-term purpose.',
    coachingTip: 'Tie the weekly plan back to their stated why and track progress on slow-burn goals.' },
  { key: 'leadership', order: 10, name: 'Leadership & Coaching',
    blurb: 'How readily you help, guide, and develop other people.',
    coachingTip: 'Give them one person to develop and a simple weekly check-in to run.' },
]

export const MODULE_BY_KEY: Record<ModuleKey, ModuleMeta> =
  Object.fromEntries(MODULES.map(m => [m.key, m])) as Record<ModuleKey, ModuleMeta>

export type QuestionType = 'scale' | 'choice' | 'frequency'

export interface ChoiceOption { label: string; weight: number } // weight 0..1

interface BaseQuestion { key: string; module: ModuleKey; type: QuestionType; text: string }
export interface ScaleQuestion extends BaseQuestion { type: 'scale'; reverse: boolean }
export interface ChoiceQuestion extends BaseQuestion { type: 'choice'; options: ChoiceOption[] }
export interface FrequencyQuestion extends BaseQuestion { type: 'frequency' }
export type Question = ScaleQuestion | ChoiceQuestion | FrequencyQuestion

// The 5 frequency buckets, shown for every `frequency` question. Index 0..4
// normalizes to 0, 25, 50, 75, 100.
export const FREQUENCY_OPTIONS = ['0 times', '1-2 times', '3-4 times', '5-6 times', '7+ times'] as const
export const SCALE_LABELS = { left: 'Strongly disagree', center: 'Neutral', right: 'Strongly agree' } as const
export const SCALE_STEPS = 7

// ---- builders (keep the bank terse + consistent) --------------------------
let _seq = 0
const s = (module: ModuleKey, text: string, reverse = false): ScaleQuestion =>
  ({ key: `${module}_${++_seq}`, module, type: 'scale', text, reverse })
const c = (module: ModuleKey, text: string, options: [string, number][]): ChoiceQuestion =>
  ({ key: `${module}_${++_seq}`, module, type: 'choice', text, options: options.map(([label, weight]) => ({ label, weight })) })
const f = (module: ModuleKey, text: string): FrequencyQuestion =>
  ({ key: `${module}_${++_seq}`, module, type: 'frequency', text })

// ---- the bank: 10 modules x 12 items --------------------------------------
// Question wording is the source diagnostic's verbatim item text (functional
// assessment items). Module names are AFF's own framing (e.g. "Building
// Capacity" for the recruiting module). Reverse flags and choice weights are
// AFF's scoring metadata.
export const QUESTIONS: Question[] = [
  // 1. Self-Awareness & Integrity
  s('self_awareness', 'I fully understand why I react the way I do in different situations.'),
  s('self_awareness', 'I reflect on my actions without making excuses.'),
  s('self_awareness', 'I tend to justify my behavior rather than examine it.', true),
  c('self_awareness', 'Which statement describes you best?', [['I recognize when I’m avoiding accountability', 1], ['I only reflect when prompted', 0.2]]),
  s('self_awareness', 'I am often unaware of my own biases.', true),
  s('self_awareness', 'I can identify when I’m rationalizing a poor decision.'),
  f('self_awareness', 'In the last 7 days, how many times did you reflect on your behavior after a situation?'),
  s('self_awareness', 'I admit when I am wrong without hesitation.'),
  c('self_awareness', 'Which statement describes you best?', [['I actively seek feedback', 1], ['I rely on my own judgment', 0.35]]),
  s('self_awareness', 'I downplay my mistakes to protect my image.', true),
  f('self_awareness', 'In the last 7 days, how many times did you admit you were wrong or take responsibility?'),
  s('self_awareness', 'I avoid thinking deeply about my own behavior.', true),

  // 2. Mental Toughness & Resilience
  s('resilience', 'I continue taking action even after rejection or disappointment.'),
  s('resilience', 'Rejection affects my confidence more than it should.', true),
  f('resilience', 'In the last 7 days, how many times did you take action after experiencing discomfort or rejection?'),
  c('resilience', 'Which statement describes you best?', [['I act despite discouragement', 1], ['I wait until I feel emotionally ready', 0.25]]),
  s('resilience', 'My effort drops after repeated setbacks.', true),
  s('resilience', 'I view rejection as feedback instead of failure.'),
  c('resilience', 'Which statement describes you best?', [['Increase activity', 1], ['Maintain effort', 0.6], ['Pull back', 0.1]]),
  s('resilience', 'I avoid situations where rejection is likely.', true),
  s('resilience', 'I remain emotionally stable under pressure.'),
  c('resilience', 'Which statement describes you best?', [['I stay consistent regardless of results', 1], ['Results strongly affect my effort', 0.3]]),
  f('resilience', 'In the last 7 days, how many times did you recover quickly and continue after a setback?'),
  s('resilience', 'Repeated failure makes me question continuing.', true),

  // 3. Licensing Commitment & Discipline
  s('discipline', 'I follow through even when tasks are inconvenient.'),
  s('discipline', 'I delay important responsibilities without pressure.', true),
  f('discipline', 'In the last 7 days, how many days did you complete a task you didn’t feel like doing?'),
  c('discipline', 'Which statement describes you best?', [['I finish tasks early', 1], ['I usually wait until deadlines approach', 0.3]]),
  s('discipline', 'I rely on urgency to become productive.', true),
  s('discipline', 'I stay focused until tasks are complete.'),
  c('discipline', 'Which statement describes you best?', [['Daily structured plan', 1], ['Flexible structure', 0.55], ['Work in bursts', 0.2]]),
  s('discipline', 'I get distracted during detailed work.', true),
  s('discipline', 'I prioritize long-term results over short-term comfort.'),
  c('discipline', 'Which statement describes you best?', [['I act regardless of mood', 1], ['My mood strongly affects productivity', 0.3]]),
  f('discipline', 'In the last 7 days, how many days did you follow through on a planned task without delay?'),
  s('discipline', 'I leave tasks unfinished when difficult.', true),

  // 4. Entrepreneurial Identity
  s('identity', 'I see myself as responsible for my own outcomes.'),
  s('identity', 'I still think like an employee.', true),
  f('identity', 'In the last 7 days, how many times did you make a decision independently without needing approval?'),
  c('identity', 'Which statement describes you best?', [['I take ownership of outcomes', 1], ['I believe external factors mostly determine outcomes', 0.25]]),
  s('identity', 'I feel uncomfortable operating without structure or supervision.', true),
  s('identity', 'I accept responsibility for both success and failure.'),
  c('identity', 'Which statement describes you best?', [['Act quickly', 1], ['Gather more information', 0.55], ['Wait for certainty', 0.15]]),
  s('identity', 'I hesitate when outcomes are uncertain.', true),
  s('identity', 'I think long-term, instead of only short term.'),
  c('identity', 'Which statement describes you best?', [['I create structure for myself', 1], ['I perform best with external structure', 0.35]]),
  f('identity', 'In the last 7 days, how many times did you take full responsibility for an outcome?'),
  s('identity', 'I avoid responsibility when I feel uncertain.', true),

  // 5. Building Capacity
  s('building', 'I naturally start conversations with new people.'),
  s('building', 'I hesitate to talk to people because I worry about their reactions.', true),
  f('building', 'In the last 7 days, how many new conversations did you initiate with someone you didn’t normally talk to?'),
  c('building', 'Which statement describes you best?', [['I reach out even when uncertain', 1], ['I wait until I feel confident', 0.25]]),
  s('building', 'I avoid conversations where someone might disagree with me.', true),
  s('building', 'I feel comfortable sharing ideas or opportunities with others.'),
  c('building', 'Which statement describes you best?', [['Start the conversation', 1], ['Wait for engagement', 0.4], ['Avoid interaction', 0.1]]),
  s('building', 'I find it difficult to bring up important topics with people I know.', true),
  s('building', 'I recover quickly if someone reacts negatively to me.'),
  c('building', 'Which statement describes you best?', [['I create opportunities', 1], ['I wait for timing', 0.3]]),
  f('building', 'In the last 7 days, how many times did you reconnect or continue a conversation after an initial interaction?'),
  s('building', 'If someone seems uninterested, I usually stop trying too quickly.', true),

  // 6. Conversion Capacity
  s('conversion', 'I feel comfortable guiding conversations toward a decision.'),
  s('conversion', 'I avoid asking direct questions because I don’t want to make people uncomfortable.', true),
  f('conversion', 'In the last 7 days, how many times did you encourage someone to make a decision or take action?'),
  c('conversion', 'Which statement describes you best?', [['I naturally guide conversations', 1], ['I usually let others lead', 0.3]]),
  s('conversion', 'I become uncomfortable when someone disagrees with me.', true),
  s('conversion', 'I can explain ideas clearly and simply.'),
  c('conversion', 'Which statement describes you best?', [['Help them think through the decision', 1], ['Wait for them to decide', 0.4], ['Avoid involvement', 0.1]]),
  s('conversion', 'I lose confidence when someone questions my opinion.', true),
  s('conversion', 'I adjust my communication style depending on who I’m talking to.'),
  c('conversion', 'Which statement describes you best?', [['I’m comfortable influencing people', 1], ['I avoid influencing people', 0.2]]),
  f('conversion', 'In the last 7 days, how many times did you continue a conversation after someone seemed uncertain?'),
  s('conversion', 'If someone hesitates, I usually back away too quickly.', true),

  // 7. Warm Market & Referral Reach
  s('network', 'I actively look for ways to meet new people.'),
  s('network', 'I usually stay within the same social circle.', true),
  f('network', 'In the last 7 days, how many times did you introduce yourself to someone new?'),
  c('network', 'Which statement describes you best?', [['I intentionally expand my network', 1], ['I rely on existing relationships', 0.35]]),
  s('network', 'I avoid situations where I have to interact with unfamiliar people.', true),
  s('network', 'I enjoy building new relationships and connections.'),
  c('network', 'Which statement describes you best?', [['Start conversations easily', 1], ['Wait for engagement', 0.4], ['Keep interactions minimal', 0.1]]),
  s('network', 'I rarely take initiative in social situations.', true),
  s('network', 'I feel comfortable reconnecting with people I haven’t spoken to in a while.'),
  c('network', 'Which statement describes you best?', [['I intentionally create opportunities through people', 1], ['I wait for opportunities naturally', 0.3]]),
  f('network', 'In the last 7 days, how many times did you reconnect with someone or strengthen a relationship?'),
  s('network', 'I avoid reaching out because I worry about bothering people.', true),

  // 8. Criticism & Pressure Resilience
  s('pressure', 'Negative opinions from others rarely stop me from taking action.'),
  s('pressure', 'Criticism affects my confidence more than it should.', true),
  f('pressure', 'In the last 7 days, how many times did you continue taking action despite fear of criticism or judgment?'),
  c('pressure', 'Which statement describes you best?', [['I stay focused even when others disagree', 1], ['Other people’s opinions strongly affect me', 0.25]]),
  s('pressure', 'I avoid situations where I might be criticized.', true),
  s('pressure', 'I can separate opinions from reality.'),
  c('pressure', 'Which statement describes you best?', [['Stay calm and confident', 1], ['Question myself temporarily', 0.45], ['Withdraw', 0.1]]),
  s('pressure', 'I often second-guess myself after hearing negative opinions.', true),
  s('pressure', 'I stay focused on goals even when others don’t understand them.'),
  c('pressure', 'Which statement describes you best?', [['I form conclusions independently', 1], ['I rely heavily on outside opinions', 0.3]]),
  f('pressure', 'In the last 7 days, how many times did you handle an uncomfortable conversation calmly?'),
  s('pressure', 'I avoid action because I worry about how I’ll be perceived.', true),

  // 9. Mission Alignment & Conviction
  s('mission', 'I feel strongly connected to my long-term goals and purpose.'),
  s('mission', 'I mainly focus on short-term rewards rather than long-term meaning.', true),
  f('mission', 'In the last 7 days, how many times did you take action connected to an important personal goal?'),
  c('mission', 'Which statement describes you best?', [['Purpose strongly drives me', 1], ['Immediate results drive me more', 0.35]]),
  s('mission', 'If progress is slow, my motivation drops quickly.', true),
  s('mission', 'I believe my work and actions should positively impact others.'),
  c('mission', 'Which statement describes you best?', [['Purpose and growth', 1], ['Purpose and rewards equally', 0.6], ['Rewards and recognition', 0.25]]),
  s('mission', 'I sometimes question whether my goals are meaningful.', true),
  s('mission', 'I stay committed even when results are delayed.'),
  c('mission', 'Which statement describes you best?', [['I stay committed regardless of short-term results', 1], ['My commitment depends on progress', 0.35]]),
  f('mission', 'In the last 7 days, how many times did you continue working toward something important despite slow progress?'),
  s('mission', 'If something becomes difficult, I usually look for an easier alternative.', true),

  // 10. Leadership & Coaching
  s('leadership', 'I naturally help and guide other people.'),
  s('leadership', 'I usually focus more on myself than helping others improve.', true),
  f('leadership', 'In the last 7 days, how many times did you help, encourage, or guide another person?'),
  c('leadership', 'Which statement describes you best?', [['I naturally step into leadership roles', 1], ['I prefer others to lead', 0.3]]),
  s('leadership', 'I avoid giving feedback because I don’t want conflict.', true),
  s('leadership', 'People often come to me for advice or guidance.'),
  c('leadership', 'Which statement describes you best?', [['Help them work through it', 1], ['Offer limited support', 0.45], ['Stay out of it', 0.1]]),
  s('leadership', 'I hesitate to speak up or take leadership in group situations.', true),
  s('leadership', 'I enjoy helping people improve and grow.'),
  c('leadership', 'Which statement describes you best?', [['I like developing people', 1], ['I prefer focusing only on my own goals', 0.3]]),
  f('leadership', 'In the last 7 days, how many times did you recognize, encourage, or support another person?'),
  s('leadership', 'I prefer to avoid responsibility for guiding or leading others.', true),
]

export const QUESTIONS_BY_MODULE: Record<ModuleKey, Question[]> =
  MODULES.reduce((acc, m) => {
    acc[m.key] = QUESTIONS.filter(q => q.module === m.key)
    return acc
  }, {} as Record<ModuleKey, Question[]>)

export const QUESTION_BY_KEY: Record<string, Question> =
  Object.fromEntries(QUESTIONS.map(q => [q.key, q]))

export const TOTAL_QUESTIONS = QUESTIONS.length
````

### src/lib/diagnostic/scoring.ts

````ts
// AFF Success Diagnostic scoring.
//
// Fully transparent and tunable (unlike the source tool, whose formula lived
// in an external service). Given the raw answers, this produces the module
// scores, the 800-point overall, class bands, the honesty/consistency check,
// the four probability indicators, and the limiting factor. Every number here
// is derived in code we control.
//
// Answer encoding (see questions.ts):
//   scale     -> integer 1..7
//   frequency -> integer 0..4 (bucket index into FREQUENCY_OPTIONS)
//   choice    -> integer option index (0-based) into the question's options

import {
  QUESTIONS, MODULES, MODULE_BY_KEY, QUESTION_BY_KEY, TOTAL_QUESTIONS,
  type ModuleKey, type Question,
} from './questions'

export type Answers = Record<string, number>

// Class bands + risk tiers. These string values are also the Prisma enum
// values, so keep them in sync with the DiagnosticClass / DiagnosticRisk
// enums in schema.prisma.
export const DIAGNOSTIC_CLASSES = ['ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE'] as const
export type DiagnosticClass = (typeof DIAGNOSTIC_CLASSES)[number]

export const DIAGNOSTIC_RISKS = ['NEEDS_IMPROVEMENT', 'MODERATE', 'ON_TRACK', 'STRONG'] as const
export type DiagnosticRisk = (typeof DIAGNOSTIC_RISKS)[number]

export const CLASS_LABEL: Record<DiagnosticClass, string> = {
  ENTRY: 'Entry', EMERGING: 'Emerging', DEVELOPING: 'Developing', ADVANCED: 'Advanced', ELITE: 'Elite',
}
export const RISK_LABEL: Record<DiagnosticRisk, string> = {
  NEEDS_IMPROVEMENT: 'Needs improvement', MODERATE: 'Moderate', ON_TRACK: 'On track', STRONG: 'Strong',
}

export const MAX_OVERALL = 800

// Percentage -> class band. Same thresholds for a module % and the overall %.
export function classForPct(pct: number): DiagnosticClass {
  if (pct >= 85) return 'ELITE'
  if (pct >= 75) return 'ADVANCED'
  if (pct >= 65) return 'DEVELOPING'
  if (pct >= 55) return 'EMERGING'
  return 'ENTRY'
}

// Overall % -> risk tier (the wash-out read; vault-only in the UI).
export function riskForPct(pct: number): DiagnosticRisk {
  if (pct >= 80) return 'STRONG'
  if (pct >= 68) return 'ON_TRACK'
  if (pct >= 55) return 'MODERATE'
  return 'NEEDS_IMPROVEMENT'
}

export interface ModuleScore { key: ModuleKey; name: string; pct: number; class: DiagnosticClass }
export interface Probabilities { licensing: number; retention: number; network: number; leadership: number }
export interface ConsistencyResult { index: number; penaltyPct: number; label: string }

export interface ScoredResult {
  overallScore: number          // 0..800, after the consistency penalty
  overallPct: number            // 0..100 (matches overallScore)
  overallClass: DiagnosticClass
  risk: DiagnosticRisk
  modules: ModuleScore[]
  limitingModule: ModuleKey
  recommendedFocus: string
  probabilities: Probabilities
  consistency: ConsistencyResult
  answeredCount: number
  totalCount: number
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const round1 = (n: number) => Math.round(n * 10) / 10

// Normalize a single answered item to 0..100, oriented so higher is stronger.
// Returns null when the item is unanswered or the value is out of range.
function itemScore(q: Question, raw: number | undefined): number | null {
  if (raw == null || Number.isNaN(raw)) return null
  if (q.type === 'scale') {
    if (raw < 1 || raw > 7) return null
    const norm = ((raw - 1) / 6) * 100
    return q.reverse ? 100 - norm : norm
  }
  if (q.type === 'frequency') {
    if (raw < 0 || raw > 4) return null
    return (raw / 4) * 100
  }
  // choice
  const opt = q.options[raw]
  return opt ? clamp(opt.weight * 100) : null
}

function moduleMean(module: ModuleKey, answers: Answers): { pct: number; answered: number; total: number } {
  const qs = QUESTIONS.filter(q => q.module === module)
  const scores: number[] = []
  for (const q of qs) {
    const s = itemScore(q, answers[q.key])
    if (s != null) scores.push(s)
  }
  const pct = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  return { pct, answered: scores.length, total: qs.length }
}

// Honesty / consistency check. Within each module we compare how the person
// scored positively-worded items vs reverse-worded items (both oriented so
// high = strong). An honest responder scores them similarly; someone who
// agrees with a statement AND its opposite pulls them apart. The mean gap is
// the inconsistency index (0..100). A gap only becomes a score penalty above a
// floor, and the penalty is capped so a genuinely mixed profile is not gutted.
function consistency(answers: Answers): ConsistencyResult {
  const gaps: number[] = []
  for (const m of MODULES) {
    const pos: number[] = []
    const rev: number[] = []
    for (const q of QUESTIONS) {
      if (q.module !== m.key || q.type !== 'scale') continue
      const s = itemScore(q, answers[q.key])
      if (s == null) continue
      ;(q.reverse ? rev : pos).push(s)
    }
    if (!pos.length || !rev.length) continue
    const pAvg = pos.reduce((a, b) => a + b, 0) / pos.length
    const rAvg = rev.reduce((a, b) => a + b, 0) / rev.length
    gaps.push(Math.abs(pAvg - rAvg))
  }
  const index = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0

  // Penalty: nothing under 20, ramping to a hard cap of 15% by index 60.
  const FLOOR = 20, CEIL = 60, MAX_PENALTY = 0.15
  let penaltyPct = 0
  if (index > FLOOR) penaltyPct = Math.min(MAX_PENALTY, ((index - FLOOR) / (CEIL - FLOOR)) * MAX_PENALTY)

  let label: string
  if (index < 20) label = 'Highly consistent'
  else if (index < 35) label = 'Consistent'
  else if (index < 50) label = 'Some inconsistency'
  else label = 'Low consistency'

  return { index, penaltyPct: Math.round(penaltyPct * 100), label }
}

// Weighted blends for the four forward-looking indicators. Weights sum to 1.
const PROB_WEIGHTS: Record<keyof Probabilities, Partial<Record<ModuleKey, number>>> = {
  licensing:  { discipline: 0.4, identity: 0.35, self_awareness: 0.25 },
  retention:  { resilience: 0.4, mission: 0.35, pressure: 0.25 },
  network:    { building: 0.4, network: 0.35, conversion: 0.25 },
  leadership: { leadership: 0.4, conversion: 0.35, self_awareness: 0.25 },
}

export function scoreDiagnostic(answers: Answers): ScoredResult {
  const modulePcts = new Map<ModuleKey, number>()
  let answeredCount = 0
  const modules: ModuleScore[] = MODULES.map(m => {
    const { pct, answered } = moduleMean(m.key, answers)
    answeredCount += answered
    modulePcts.set(m.key, pct)
    return { key: m.key, name: m.name, pct: round1(pct), class: classForPct(pct) }
  })

  const rawOverall = modules.reduce((a, m) => a + (modulePcts.get(m.key) ?? 0), 0) / modules.length
  const cons = consistency(answers)
  const adjustedPct = clamp(rawOverall * (1 - cons.penaltyPct / 100))
  const overallScore = Math.round((adjustedPct / 100) * MAX_OVERALL)
  const overallPct = round1(adjustedPct)

  const probabilities = Object.fromEntries(
    (Object.keys(PROB_WEIGHTS) as (keyof Probabilities)[]).map(k => {
      const w = PROB_WEIGHTS[k]
      let v = 0
      for (const [mod, weight] of Object.entries(w)) v += (modulePcts.get(mod as ModuleKey) ?? 0) * (weight as number)
      return [k, round1(clamp(v))]
    }),
  ) as unknown as Probabilities

  // Limiting factor = lowest module (ties break by module order).
  const limiting = [...modules].sort((a, b) => a.pct - b.pct || a.key.localeCompare(b.key))[0]
  const limitingModule = limiting.key
  const recommendedFocus = MODULE_BY_KEY[limitingModule].coachingTip

  return {
    overallScore,
    overallPct,
    overallClass: classForPct(adjustedPct),
    risk: riskForPct(adjustedPct),
    modules,
    limitingModule,
    recommendedFocus,
    probabilities,
    consistency: cons,
    answeredCount,
    totalCount: TOTAL_QUESTIONS,
  }
}

// Validate a submitted answers map: every question answered with an in-range
// value. Returns the list of missing/invalid question keys (empty = valid).
export function validateAnswers(answers: Answers): string[] {
  const bad: string[] = []
  for (const q of QUESTIONS) {
    if (itemScore(q, answers[q.key]) == null) bad.push(q.key)
  }
  // ignore unknown keys; only our questions matter
  void QUESTION_BY_KEY
  return bad
}
````

### src/lib/diagnostic/access.ts

````ts
// Access tiers for a diagnostic result.
//
// Three audiences see three different projections of the same row. This is
// the single place that decides what each audience is allowed to see, so a
// sensitive field can never leak by being forgotten in one endpoint.
//
//   subject   the person who took it (their own report). Positive framing:
//             score, class, modules, limiting factor, focus, probabilities.
//             NOT shown: the internal risk/wash-out label, the raw
//             consistency index + penalty mechanics, raw answers.
//
//   coaching  an upline recruiter or trainer viewing a downline member. Built
//             for day-to-day coaching: score, class, the 10-module breakdown,
//             the #1 limiting factor, the recommended focus, and completion
//             date. NOT shown (vault-only): risk level, the four probability
//             indicators, the honesty/consistency check, raw answers, and full
//             contact PII beyond the name.
//
//   vault     admin / licensing coordinator. Everything, including risk, the
//             probability indicators, the consistency/integrity check, raw
//             answers, attribution, and full PII.
//
// The API layer decides which tier a viewer gets (see resolveTier notes in the
// route); this module only performs the projection.

import { MODULE_BY_KEY, type ModuleKey } from './questions'
import type { DiagnosticClass, DiagnosticRisk, ModuleScore, Probabilities } from './scoring'
import { CLASS_LABEL } from './scoring'

export type Tier = 'subject' | 'coaching' | 'vault'

// The persisted shape this module projects from (mirrors the Prisma row; kept
// as a plain interface so callers can pass a lean `select`).
export interface StoredDiagnostic {
  id: string
  createdAt: Date
  submittedAt: Date | null
  status: string
  version: number
  firstName: string
  lastName: string
  email: string
  phone: string | null
  company: string | null
  state: string | null
  subjectProfileId: string | null
  recruiterCode: string | null
  recruiterName: string | null
  source: string
  overallScore: number
  overallClass: DiagnosticClass
  risk: DiagnosticRisk
  limitingModule: string
  recommendedFocus: string
  moduleScores: ModuleScore[]
  probabilities: Probabilities
  consistencyIndex: number
  consistencyPenaltyPct: number
  consistencyLabel: string
  answers?: Record<string, number> | null
}

function limitingName(key: string): string {
  return MODULE_BY_KEY[key as ModuleKey]?.name ?? key
}

// ---- subject (own report) -------------------------------------------------
export interface SubjectView {
  id: string
  name: string
  completedAt: Date | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
  probabilities: Probabilities
  consistencyLabel: string
}

export function toSubjectView(r: StoredDiagnostic): SubjectView {
  return {
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    completedAt: r.submittedAt,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    modules: r.moduleScores,
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
    recommendedFocus: r.recommendedFocus,
    probabilities: r.probabilities,
    consistencyLabel: r.consistencyLabel,
  }
}

// ---- coaching (upline / trainer) ------------------------------------------
export interface CoachingView {
  id: string
  name: string
  state: string | null
  completedAt: Date | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
}

export function toCoachingView(r: StoredDiagnostic): CoachingView {
  return {
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    state: r.state,
    completedAt: r.submittedAt,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    modules: r.moduleScores,
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
    recommendedFocus: r.recommendedFocus,
  }
}

// A compact row for the agent portal team list (coaching tier).
export interface CoachingListItem {
  id: string
  name: string
  completedAt: Date | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  limitingModule: string
  limitingModuleName: string
}

export function toCoachingListItem(r: StoredDiagnostic): CoachingListItem {
  return {
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    completedAt: r.submittedAt,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
  }
}

// ---- vault (admin / LC) ---------------------------------------------------
export interface VaultView extends CoachingView {
  createdAt: Date
  status: string
  version: number
  email: string
  phone: string | null
  company: string | null
  source: string
  recruiterCode: string | null
  recruiterName: string | null
  risk: DiagnosticRisk
  probabilities: Probabilities
  consistencyIndex: number
  consistencyPenaltyPct: number
  consistencyLabel: string
}

export function toVaultView(r: StoredDiagnostic): VaultView {
  return {
    ...toCoachingView(r),
    createdAt: r.createdAt,
    status: r.status,
    version: r.version,
    email: r.email,
    phone: r.phone,
    company: r.company,
    source: r.source,
    recruiterCode: r.recruiterCode,
    recruiterName: r.recruiterName,
    risk: r.risk,
    probabilities: r.probabilities,
    consistencyIndex: r.consistencyIndex,
    consistencyPenaltyPct: r.consistencyPenaltyPct,
    consistencyLabel: r.consistencyLabel,
  }
}

// A compact row for the vault list (full tier), including the sensitive
// fields the vault is allowed to sort / group / filter on.
export interface VaultListItem {
  id: string
  createdAt: Date
  completedAt: Date | null
  status: string
  name: string
  email: string
  state: string | null
  source: string
  recruiterCode: string | null
  recruiterName: string | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  risk: DiagnosticRisk
  limitingModule: string
  limitingModuleName: string
  licensingProbability: number
}

export function toVaultListItem(r: StoredDiagnostic): VaultListItem {
  return {
    id: r.id,
    createdAt: r.createdAt,
    completedAt: r.submittedAt,
    status: r.status,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    state: r.state,
    source: r.source,
    recruiterCode: r.recruiterCode,
    recruiterName: r.recruiterName,
    overallScore: r.overallScore,
    overallClass: r.overallClass,
    overallClassLabel: CLASS_LABEL[r.overallClass],
    risk: r.risk,
    limitingModule: r.limitingModule,
    limitingModuleName: limitingName(r.limitingModule),
    licensingProbability: r.probabilities?.licensing ?? 0,
  }
}

export function projectForTier(r: StoredDiagnostic, tier: Tier): SubjectView | CoachingView | VaultView {
  if (tier === 'vault') return toVaultView(r)
  if (tier === 'coaching') return toCoachingView(r)
  return toSubjectView(r)
}
````

### src/lib/diagnostic/service.ts

````ts
// Server-side helpers for the Success Diagnostic: persistence, loading a row
// into the typed StoredDiagnostic shape the access serializers expect, and
// resolving which downline results an agent is allowed to coach on.

import { db } from '@/lib/db'
import { normalizeName } from '@/lib/trainer-trainees'
import type { StoredDiagnostic } from './access'
import type { ScoredResult, DiagnosticClass, DiagnosticRisk, ModuleScore, Probabilities } from './scoring'
import { DIAGNOSTIC_VERSION } from './questions'
import type { Answers } from './scoring'

export interface SubmitInput {
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  company?: string | null
  state?: string | null
  subjectProfileId?: string | null
  recruiterCode?: string | null
  recruiterName?: string | null
  source: string
  answers: Answers
  ipAddress?: string | null
  userAgent?: string | null
  pageUrl?: string | null
}

// Persist a freshly scored result. Returns the new row id.
export async function persistScored(input: SubmitInput, scored: ScoredResult): Promise<string> {
  const row = await db.diagnosticResult.create({
    data: {
      status: 'COMPLETED',
      submittedAt: new Date(),
      version: DIAGNOSTIC_VERSION,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      company: input.company ?? null,
      state: input.state ?? null,
      subjectProfileId: input.subjectProfileId ?? null,
      recruiterCode: input.recruiterCode ?? null,
      recruiterName: input.recruiterName ?? null,
      source: input.source,
      overallScore: scored.overallScore,
      overallClass: scored.overallClass,
      risk: scored.risk,
      limitingModule: scored.limitingModule,
      recommendedFocus: scored.recommendedFocus,
      moduleScores: scored.modules as unknown as object,
      probabilities: scored.probabilities as unknown as object,
      consistencyIndex: scored.consistency.index,
      consistencyPenaltyPct: scored.consistency.penaltyPct,
      consistencyLabel: scored.consistency.label,
      answers: input.answers as unknown as object,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      pageUrl: input.pageUrl ?? null,
    },
    select: { id: true },
  })
  return row.id
}

// Cast a Prisma row into the StoredDiagnostic shape (JSON columns are typed
// loosely by Prisma; we know their shape because we wrote them).
type RawRow = {
  id: string; createdAt: Date; submittedAt: Date | null; status: string; version: number
  firstName: string; lastName: string; email: string; phone: string | null
  company: string | null; state: string | null; subjectProfileId: string | null
  recruiterCode: string | null; recruiterName: string | null; source: string
  overallScore: number; overallClass: DiagnosticClass; risk: DiagnosticRisk
  limitingModule: string; recommendedFocus: string
  moduleScores: unknown; probabilities: unknown
  consistencyIndex: number; consistencyPenaltyPct: number; consistencyLabel: string
  answers?: unknown
}

export function toStored(row: RawRow): StoredDiagnostic {
  return {
    ...row,
    moduleScores: (row.moduleScores as ModuleScore[]) ?? [],
    probabilities: (row.probabilities as Probabilities) ?? { licensing: 0, retention: 0, network: 0, leadership: 0 },
    answers: (row.answers as Record<string, number> | undefined) ?? null,
  }
}

export async function loadStored(id: string): Promise<StoredDiagnostic | null> {
  const row = await db.diagnosticResult.findUnique({ where: { id } })
  return row ? toStored(row as RawRow) : null
}

// The set of AgentProfile ids whose diagnostic results a given agent may coach
// on: their full downline (walking recruiterId, which stores the recruiter's
// agentCode) plus anyone whose cft trainer name matches the caller. Excludes
// the caller themselves (their own result is fetched separately). Mirrors the
// traversal in /api/agents/team.
export async function collectTeamProfileIds(callerProfileId: string): Promise<Set<string>> {
  const caller = await db.agentProfile.findUnique({
    where: { id: callerProfileId },
    select: { agentCode: true, firstName: true, lastName: true, preferredName: true },
  })
  if (!caller) return new Set()

  const all = await db.agentProfile.findMany({
    where: { isTest: false },
    select: { id: true, agentCode: true, recruiterId: true, cft: true },
  })

  const byCode = new Map<string, (typeof all)[number]>()
  const childrenOf = new Map<string, (typeof all)[number][]>()
  for (const p of all) {
    byCode.set(p.agentCode.toUpperCase(), p)
    const rid = p.recruiterId?.toUpperCase()
    if (rid) {
      const arr = childrenOf.get(rid) ?? []
      arr.push(p)
      childrenOf.set(rid, arr)
    }
  }

  const teamIds = new Set<string>()
  // BFS the downline from the caller's agentCode.
  const queue = [caller.agentCode.toUpperCase()]
  const visited = new Set<string>(queue)
  while (queue.length) {
    const code = queue.shift()!
    for (const child of childrenOf.get(code) ?? []) {
      if (visited.has(child.agentCode.toUpperCase())) continue
      visited.add(child.agentCode.toUpperCase())
      teamIds.add(child.id)
      queue.push(child.agentCode.toUpperCase())
    }
  }

  // Trainer path: anyone whose cft normalizes to one of the caller's names.
  const accepted = new Set<string>()
  const legal = normalizeName(`${caller.firstName} ${caller.lastName}`)
  if (legal) accepted.add(legal)
  if (caller.preferredName?.trim()) {
    const pref = normalizeName(`${caller.preferredName.trim()} ${caller.lastName}`)
    if (pref) accepted.add(pref)
  }
  if (accepted.size) {
    for (const p of all) {
      if (p.cft && accepted.has(normalizeName(p.cft))) teamIds.add(p.id)
    }
  }

  teamIds.delete(callerProfileId)
  return teamIds
}
````

### src/app/api/diagnostic/submit/route.ts

````ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validateEmail } from '@/lib/contact-validation'
import { sanitizeName, capStr } from '@/lib/lead-abuse-guard'
import { scoreDiagnostic, validateAnswers, type Answers } from '@/lib/diagnostic/scoring'
import { persistScored } from '@/lib/diagnostic/service'

// Public + agent submission of a completed Success Diagnostic. Scores the
// answers server-side (never trust a client-computed score), persists the
// row, and returns the new id so the caller can view the results page. If an
// agent is signed in, the result is linked to their profile and sourced as
// agent_portal; otherwise it is a public link submission credited to the
// recruiter code carried on the share link.

interface Body {
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  phone?: unknown
  company?: unknown
  state?: unknown
  recruiterCode?: unknown   // agentCode carried on the share link
  recruiterName?: unknown   // free-text "who referred you"
  answers?: unknown
  pageUrl?: unknown
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const firstNameRaw = str(body.firstName)
  const lastNameRaw = str(body.lastName)
  const firstName = firstNameRaw ? sanitizeName(firstNameRaw) : null
  const lastName = lastNameRaw ? sanitizeName(lastNameRaw) : null
  const email = str(body.email) ? capStr(body.email as string, 200) : null
  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: 'Please enter your name and email.' }, { status: 400 })
  }
  const emailErr = validateEmail(email)
  if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 })

  // Answers: a map of questionKey -> numeric answer. Reject anything not a
  // plain object; validate every item against the question bank.
  const rawAnswers = body.answers
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    return NextResponse.json({ error: 'Missing answers.' }, { status: 400 })
  }
  const answers: Answers = {}
  for (const [k, v] of Object.entries(rawAnswers as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) answers[k] = v
  }
  const missing = validateAnswers(answers)
  if (missing.length) {
    return NextResponse.json({ error: `Please answer every question (${missing.length} remaining).`, missing }, { status: 400 })
  }

  // Identity: if an agent is signed in, link the result to their profile.
  let subjectProfileId: string | null = null
  let source = 'public_link'
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (role === 'agent' && session?.user?.email) {
    const u = await db.agentUser.findFirst({
      where: { email: { equals: session.user.email, mode: 'insensitive' } },
      include: { profile: { select: { id: true } } },
    })
    if (u?.profile?.id) {
      subjectProfileId = u.profile.id
      source = 'agent_portal'
    }
  }

  // Recruiter attribution: normalize + verify the share-link code resolves to
  // a real agent; keep it only when it does so credit is trustworthy.
  let recruiterCode: string | null = null
  const rawCode = str(body.recruiterCode)
  if (rawCode) {
    const found = await db.agentProfile.findUnique({
      where: { agentCode: rawCode.toUpperCase() },
      select: { agentCode: true },
    })
    recruiterCode = found?.agentCode ?? null
  }
  const recruiterName = str(body.recruiterName) ? sanitizeName(body.recruiterName as string) : null

  const scored = scoreDiagnostic(answers)
  const id = await persistScored(
    {
      firstName, lastName, email,
      phone: str(body.phone) ? capStr(body.phone as string, 30) : null,
      company: str(body.company) ? capStr(body.company as string, 200) : null,
      state: str(body.state) ? capStr(body.state as string, 60) : null,
      subjectProfileId,
      recruiterCode,
      recruiterName,
      source,
      answers,
      ipAddress: clientIp(req),
      userAgent: req.headers.get('user-agent') ? capStr(req.headers.get('user-agent')!, 500) : null,
      pageUrl: str(body.pageUrl) ? capStr(body.pageUrl as string, 600) : null,
    },
    scored,
  )

  return NextResponse.json({ ok: true, id })
}
````

### src/app/api/diagnostic/result/[id]/route.ts

````ts
import { NextResponse } from 'next/server'
import { loadStored } from '@/lib/diagnostic/service'
import { toSubjectView } from '@/lib/diagnostic/access'

// The taker's own results page. The row id is an unguessable cuid that acts
// as a capability token (same model as the source tool's emailed results
// link), so anyone with the link sees the SUBJECT view. The subject view
// deliberately omits the sensitive fields (risk label, consistency mechanics,
// raw answers); those are only ever exposed in the vault.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const stored = await loadStored(id)
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ result: toSubjectView(stored) })
}
````

### src/app/api/agents/diagnostic/route.ts

````ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { collectTeamProfileIds, toStored } from '@/lib/diagnostic/service'
import { toSubjectView, toCoachingListItem } from '@/lib/diagnostic/access'

// The agent portal Diagnostic tab. Returns the agent's own result (subject
// view) plus a coaching list for everyone in their downline / trainees who has
// completed the diagnostic. The list is the COACHING tier only: score, class,
// and top gap. Sensitive fields (risk, probabilities, consistency, answers)
// never leave the vault.

export async function GET(req: NextRequest) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error
  const myProfileId = id.profileId

  // Own most recent completed result.
  const mineRow = await db.diagnosticResult.findFirst({
    where: { subjectProfileId: myProfileId, status: 'COMPLETED' },
    orderBy: { submittedAt: 'desc' },
  })
  const mine = mineRow ? toSubjectView(toStored(mineRow as never)) : null

  // Team results (coaching view). One row per team member (their latest).
  const teamIds = await collectTeamProfileIds(myProfileId)
  let team: ReturnType<typeof toCoachingListItem>[] = []
  if (teamIds.size) {
    const rows = await db.diagnosticResult.findMany({
      where: { subjectProfileId: { in: [...teamIds] }, status: 'COMPLETED' },
      orderBy: { submittedAt: 'desc' },
    })
    const seen = new Set<string>()
    for (const r of rows) {
      const key = r.subjectProfileId as string
      if (seen.has(key)) continue // keep only the latest per member
      seen.add(key)
      team.push(toCoachingListItem(toStored(r as never)))
    }
    team = team.sort((a, b) => a.overallScore - b.overallScore) // weakest first, so coaching attention sorts to the top
  }

  return NextResponse.json({ mine, team })
}
````

### src/app/api/agents/diagnostic/[id]/route.ts

````ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'
import { loadStored } from '@/lib/diagnostic/service'
import { toSubjectView, toCoachingView } from '@/lib/diagnostic/access'

// A single result inside the agent portal. The agent sees:
//   - the SUBJECT view if it is their own result
//   - the COACHING view if the subject is in their downline / a trainee
//   - 403 otherwise
// This is the drill-in behind the Diagnostic team list.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await resolveAgentIdentity(req)
  if ('error' in identity) return identity.error
  const myProfileId = identity.profileId

  const { id } = await params
  const stored = await loadStored(id)
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Own result.
  if (stored.subjectProfileId && stored.subjectProfileId === myProfileId) {
    return NextResponse.json({ tier: 'subject', result: toSubjectView(stored) })
  }

  // Team member? Need the subject's agentCode to run the upline/trainer check.
  if (stored.subjectProfileId) {
    const subject = await db.agentProfile.findUnique({
      where: { id: stored.subjectProfileId },
      select: { agentCode: true },
    })
    if (subject?.agentCode) {
      const allowed = await authorizeTeamMemberAccess(myProfileId, subject.agentCode)
      if (allowed) return NextResponse.json({ tier: 'coaching', result: toCoachingView(stored) })
    }
  }

  return NextResponse.json({ error: 'Not authorized to view this result' }, { status: 403 })
}
````

### src/app/api/vault/diagnostic/route.ts

````ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { db } from '@/lib/db'
import { toStored } from '@/lib/diagnostic/service'
import { toVaultListItem } from '@/lib/diagnostic/access'

// Vault list of every diagnostic result (admin + LC). Returns the full tier
// list rows (including risk, limiting factor, licensing probability, and
// attribution) so the page can filter, group by category, and export. The
// dataset is modest, so filtering + grouping happen client-side against this
// payload, matching the existing vault list pages (leads, new-business).

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const rows = await db.diagnosticResult.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })
  const items = rows.map(r => toVaultListItem(toStored(r as never)))
  return NextResponse.json({ items, count: items.length })
}
````

### src/app/api/vault/diagnostic/[id]/route.ts

````ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { loadStored } from '@/lib/diagnostic/service'
import { toVaultView } from '@/lib/diagnostic/access'

// Full per-result report for the vault (admin + LC). Everything: risk, the
// four probability indicators, the consistency / integrity check, attribution,
// and full contact detail.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const denied = requireRole(session, 'admin', 'licensing_coordinator')
  if (denied) return denied

  const { id } = await params
  const stored = await loadStored(id)
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ result: toVaultView(stored) })
}
````

### src/app/diagnostic/page.tsx

````tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUESTIONS,
  MODULES,
  FREQUENCY_OPTIONS,
  SCALE_LABELS,
  SCALE_STEPS,
  TOTAL_QUESTIONS,
  type Question,
  type ModuleMeta,
} from '@/lib/diagnostic/questions'

// Public-facing AFF Success Diagnostic: one question per screen, grouped by
// module, with a welcome screen and an end lead-capture step. Answers are
// encoded per the question bank (scale 1..7, frequency 0..4, choice 0-based
// index) and posted to /api/diagnostic/submit for server-side scoring.

// Palette + the handful of rules inline styles cannot express (theme
// variables, hover states, keyframes, responsive collapse). Everything else
// is inline via var(--x), matching the mockup and the codebase convention.
const THEME_CSS = `
:root {
  --paper:#F7F5F0; --surface:#FFFFFF; --surface-2:#FBFAF7; --surface-3:#F1EEE7;
  --ink:#16324E; --ink-soft:#40566C; --muted:#6B8299;
  --line:#E4E1D9; --line-strong:#D4D9DF;
  --gold:#C9A96E; --gold-deep:#A87F3C; --gold-wash:rgba(201,169,110,0.14);
  --good:#2E7D57; --good-wash:rgba(46,125,87,0.12);
  --elite:#1F6E4A; --elite-wash:rgba(31,110,74,0.14);
  --warn:#B67A22; --warn-wash:rgba(182,122,34,0.14);
  --crit:#B4451F; --crit-wash:rgba(180,69,31,0.12);
  --navy-wash:rgba(22,50,78,0.05);
  --shadow:0 1px 2px rgba(22,50,78,0.06), 0 12px 32px -12px rgba(22,50,78,0.18);
  --shadow-lg:0 2px 4px rgba(22,50,78,0.08), 0 30px 60px -24px rgba(22,50,78,0.32);
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:"SF Mono",ui-monospace,"Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper:#0F151B; --surface:#161F29; --surface-2:#1A242F; --surface-3:#202C38;
    --ink:#F1ECE2; --ink-soft:#C4D0DB; --muted:#8698AA;
    --line:#26323E; --line-strong:#334150;
    --gold:#D8B877; --gold-deep:#E4C68C; --gold-wash:rgba(216,184,119,0.12);
    --good:#5FB68A; --good-wash:rgba(95,182,138,0.14);
    --elite:#7ED0A6; --elite-wash:rgba(126,208,166,0.14);
    --warn:#DBA24C; --warn-wash:rgba(219,162,76,0.16);
    --crit:#E0805F; --crit-wash:rgba(224,128,95,0.15);
    --navy-wash:rgba(255,255,255,0.04);
    --shadow:0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6);
    --shadow-lg:0 2px 4px rgba(0,0,0,0.5), 0 30px 60px -24px rgba(0,0,0,0.7);
  }
}
:root[data-theme="light"] {
  --paper:#F7F5F0; --surface:#FFFFFF; --surface-2:#FBFAF7; --surface-3:#F1EEE7;
  --ink:#16324E; --ink-soft:#40566C; --muted:#6B8299;
  --line:#E4E1D9; --line-strong:#D4D9DF;
  --gold:#C9A96E; --gold-deep:#A87F3C; --gold-wash:rgba(201,169,110,0.14);
  --good:#2E7D57; --good-wash:rgba(46,125,87,0.12);
  --elite:#1F6E4A; --elite-wash:rgba(31,110,74,0.14);
  --warn:#B67A22; --warn-wash:rgba(182,122,34,0.14);
  --crit:#B4451F; --crit-wash:rgba(180,69,31,0.12);
  --navy-wash:rgba(22,50,78,0.05);
  --shadow:0 1px 2px rgba(22,50,78,0.06), 0 12px 32px -12px rgba(22,50,78,0.18);
  --shadow-lg:0 2px 4px rgba(22,50,78,0.08), 0 30px 60px -24px rgba(22,50,78,0.32);
}
:root[data-theme="dark"] {
  --paper:#0F151B; --surface:#161F29; --surface-2:#1A242F; --surface-3:#202C38;
  --ink:#F1ECE2; --ink-soft:#C4D0DB; --muted:#8698AA;
  --line:#26323E; --line-strong:#334150;
  --gold:#D8B877; --gold-deep:#E4C68C; --gold-wash:rgba(216,184,119,0.12);
  --good:#5FB68A; --good-wash:rgba(95,182,138,0.14);
  --elite:#7ED0A6; --elite-wash:rgba(126,208,166,0.14);
  --warn:#DBA24C; --warn-wash:rgba(219,162,76,0.16);
  --crit:#E0805F; --crit-wash:rgba(224,128,95,0.15);
  --navy-wash:rgba(255,255,255,0.04);
  --shadow:0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6);
  --shadow-lg:0 2px 4px rgba(0,0,0,0.5), 0 30px 60px -24px rgba(0,0,0,0.7);
}
.diag-root { background:var(--paper); color:var(--ink); font-family:var(--sans); min-height:100vh; overflow-x:hidden; }
.diag-root h1,.diag-root h2,.diag-root h3 { font-family:var(--serif); font-weight:600; line-height:1.15; margin:0; letter-spacing:-0.01em; }
.diag-opt { transition:transform .12s, border-color .12s, background .12s, color .12s; }
.diag-opt:hover { border-color:var(--gold); transform:translateY(-2px); }
.diag-btn { transition:border-color .12s, transform .12s, opacity .12s; }
.diag-btn:hover:not(:disabled) { border-color:var(--gold); }
.diag-btn:disabled { opacity:0.45; cursor:not-allowed; }
.diag-theme:hover { color:var(--ink); border-color:var(--gold); }
.diag-input:focus { outline:none; border-color:var(--gold); }
.diag-prog i { transition:width .3s ease; }
@keyframes diagspin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .diag-opt,.diag-btn,.diag-prog i { transition:none !important; } }
`

const MODULE_BY_KEY: Record<string, ModuleMeta> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
)

type Phase = 'welcome' | 'questions' | 'lead'
type Answers = Record<string, number>

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)
  useEffect(() => {
    const root = document.documentElement
    const t = (root.dataset.theme as 'light' | 'dark' | undefined) ?? null
    setTheme(t)
  }, [])
  const toggle = () => {
    const root = document.documentElement
    const current =
      root.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    setTheme(next)
  }
  return { theme, toggle }
}

export default function DiagnosticPage() {
  const router = useRouter()
  const { toggle } = useTheme()

  const [phase, setPhase] = useState<Phase>('welcome')
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [recruiterName, setRecruiterName] = useState('')
  const [recruiterCode, setRecruiterCode] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const ref = params.get('ref')
      if (ref) setRecruiterCode(ref.trim())
    } catch {
      /* no-op */
    }
  }, [])

  const answeredCount = Object.keys(answers).length
  const progressPct = Math.round((answeredCount / TOTAL_QUESTIONS) * 100)
  const question = QUESTIONS[qIndex]
  const module = question ? MODULE_BY_KEY[question.module] : undefined
  const currentAnswered = question ? answers[question.key] != null : false

  function setAnswer(key: string, value: number) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function goNext() {
    setError(null)
    if (qIndex < TOTAL_QUESTIONS - 1) setQIndex((i) => i + 1)
    else setPhase('lead')
  }
  function goBack() {
    setError(null)
    if (phase === 'lead') {
      setPhase('questions')
      setQIndex(TOTAL_QUESTIONS - 1)
    } else if (qIndex > 0) {
      setQIndex((i) => i - 1)
    } else {
      setPhase('welcome')
    }
  }

  async function submit() {
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please enter your first name, last name, and email.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/diagnostic/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          company: company.trim() || undefined,
          recruiterCode: recruiterCode || undefined,
          recruiterName: recruiterName.trim() || undefined,
          answers,
          pageUrl: window.location.href,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string; missing?: string[] }
      if (!res.ok || !data.ok || !data.id) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      router.push(`/diagnostic/results/${data.id}`)
    } catch {
      setError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="diag-root">
      <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />

      {/* top bar (sticky, iOS safe area aware) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'color-mix(in srgb, var(--paper) 88%, transparent)',
          backdropFilter: 'saturate(1.4) blur(12px)',
          WebkitBackdropFilter: 'saturate(1.4) blur(12px)',
          borderBottom: '1px solid var(--line)',
          paddingTop: 'calc(12px + env(safe-area-inset-top))',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '0 20px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: 'linear-gradient(150deg,var(--ink),#0d2036)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--gold)',
                fontFamily: 'var(--serif)',
                fontSize: 15,
                boxShadow: 'inset 0 0 0 1px rgba(201,169,110,0.35)',
              }}
            >
              A
            </span>
            <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em' }}>
              All Financial Freedom
              <small
                style={{
                  display: 'block',
                  fontFamily: 'var(--sans)',
                  fontWeight: 500,
                  fontSize: 10.5,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                Success Diagnostic
              </small>
            </span>
          </div>
          <button
            className="diag-theme"
            onClick={toggle}
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
            style={{
              marginLeft: 'auto',
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink-soft)',
              width: 38,
              height: 38,
              borderRadius: 9,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 16,
            }}
          >
            ◑
          </button>
        </div>
      </div>

      <main
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: '36px 20px 64px',
        }}
      >
        {phase === 'welcome' && (
          <Welcome onBegin={() => setPhase('questions')} referred={recruiterCode} />
        )}

        {phase === 'questions' && question && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              boxShadow: 'var(--shadow)',
              padding: '28px 26px 24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 18,
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--gold-deep)',
                  fontWeight: 600,
                }}
              >
                {module ? `Module ${module.order} · ${module.name}` : ''}
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {answeredCount} / {TOTAL_QUESTIONS}
              </span>
            </div>

            <div
              className="diag-prog"
              style={{
                height: 5,
                borderRadius: 3,
                background: 'var(--surface-3)',
                overflow: 'hidden',
                marginBottom: 26,
              }}
            >
              <i
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg,var(--gold),var(--gold-deep))',
                  borderRadius: 3,
                }}
              />
            </div>

            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 12,
                color: 'var(--gold-deep)',
                fontWeight: 600,
              }}
            >
              QUESTION {qIndex + 1}
            </div>
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 22,
                lineHeight: 1.3,
                margin: '8px 0 24px',
                color: 'var(--ink)',
              }}
            >
              {question.text}
            </p>

            <QuestionInput
              question={question}
              value={answers[question.key]}
              onSelect={(v) => setAnswer(question.key, v)}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 28,
                paddingTop: 20,
                borderTop: '1px solid var(--line)',
                gap: 12,
              }}
            >
              <button
                className="diag-btn"
                onClick={goBack}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  border: '1px solid var(--line-strong)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--sans)',
                }}
              >
                ← Back
              </button>
              <button
                className="diag-btn"
                onClick={goNext}
                disabled={!currentAnswered}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: '10px 18px',
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  background: 'linear-gradient(180deg,var(--gold),var(--gold-deep))',
                  color: '#241900',
                  boxShadow: 'var(--shadow)',
                  fontFamily: 'var(--sans)',
                }}
              >
                {qIndex === TOTAL_QUESTIONS - 1 ? 'Continue →' : 'Next →'}
              </button>
            </div>
          </div>
        )}

        {phase === 'lead' && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              boxShadow: 'var(--shadow)',
              padding: '30px 26px 26px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--gold-deep)',
                fontWeight: 600,
              }}
            >
              Almost done
            </div>
            <h2 style={{ fontSize: 25, margin: '12px 0 8px' }}>Where should we send your results?</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 22 }}>
              You have answered all {TOTAL_QUESTIONS} questions. Add your details and we will build your
              personal performance report.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="First name" required>
                <input
                  className="diag-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  style={inputStyle}
                />
              </Field>
              <Field label="Last name" required>
                <input
                  className="diag-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Email" required>
                <input
                  className="diag-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Company (optional)">
                <input
                  className="diag-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Who referred you? (optional)">
                <input
                  className="diag-input"
                  value={recruiterName}
                  onChange={(e) => setRecruiterName(e.target.value)}
                  placeholder={recruiterCode ? 'We already have your referral' : 'Name of the person who sent you'}
                  style={inputStyle}
                />
              </Field>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 18,
                  background: 'var(--crit-wash)',
                  border: '1px solid color-mix(in srgb,var(--crit) 30%, transparent)',
                  color: 'var(--crit)',
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 13.5,
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 24,
                gap: 12,
              }}
            >
              <button
                className="diag-btn"
                onClick={goBack}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  border: '1px solid var(--line-strong)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--sans)',
                }}
              >
                ← Back
              </button>
              <button
                className="diag-btn"
                onClick={submit}
                disabled={submitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 9,
                  borderRadius: 9,
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '11px 20px',
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  background: 'linear-gradient(180deg,var(--gold),var(--gold-deep))',
                  color: '#241900',
                  boxShadow: 'var(--shadow)',
                  fontFamily: 'var(--sans)',
                }}
              >
                {submitting && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      border: '2px solid rgba(36,25,0,0.35)',
                      borderTopColor: '#241900',
                      display: 'inline-block',
                      animation: 'diagspin .7s linear infinite',
                    }}
                  />
                )}
                {submitting ? 'Scoring your results…' : 'See my results →'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--line-strong)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  borderRadius: 9,
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: 'var(--sans)',
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--ink-soft)',
          marginBottom: 6,
          letterSpacing: '0.01em',
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--crit)' }}> *</span>}
      </span>
      {children}
    </label>
  )
}

function Welcome({ onBegin, referred }: { onBegin: () => void; referred: string | null }) {
  const stats = [
    { n: '120', l: 'scored questions' },
    { n: '10', l: 'performance modules' },
    { n: '800', l: 'point success score' },
    { n: '4', l: 'probability indicators' },
  ]
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        boxShadow: 'var(--shadow)',
        padding: '32px 28px 28px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--gold-deep)',
          fontWeight: 600,
        }}
      >
        Behavioral assessment
      </div>
      <h1 style={{ fontSize: 32, margin: '14px 0 12px', lineHeight: 1.08 }}>
        The AFF Success Diagnostic
      </h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 16, lineHeight: 1.6 }}>
        About 120 short items across 10 performance modules. It scores how you actually operate, flags
        your number one limiting factor, and predicts your odds of getting licensed and producing. It
        takes roughly 12 to 15 minutes.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 14,
          margin: '24px 0',
        }}
      >
        {stats.map((s) => (
          <div
            key={s.l}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--ink)', lineHeight: 1 }}>
              {s.n}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          background: 'var(--gold-wash)',
          border: '1px solid color-mix(in srgb,var(--gold) 40%, transparent)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 24,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1.2 }} aria-hidden="true">
          🎯
        </span>
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          Answer honestly, not the way you wish you were. Some items are worded in reverse and cross-check
          each other, so the most useful result comes from your first, real reaction.
        </p>
      </div>

      {referred && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>
          Referred by code <b style={{ color: 'var(--ink-soft)' }}>{referred}</b>. We will credit them
          automatically.
        </p>
      )}

      <button
        onClick={onBegin}
        className="diag-btn"
        style={{
          width: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 600,
          padding: '13px 18px',
          cursor: 'pointer',
          border: '1px solid transparent',
          background: 'linear-gradient(180deg,var(--gold),var(--gold-deep))',
          color: '#241900',
          boxShadow: 'var(--shadow)',
          fontFamily: 'var(--sans)',
        }}
      >
        Begin the diagnostic →
      </button>
    </div>
  )
}

function QuestionInput({
  question,
  value,
  onSelect,
}: {
  question: Question
  value: number | undefined
  onSelect: (v: number) => void
}) {
  if (question.type === 'scale') {
    return (
      <div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: SCALE_STEPS }, (_, i) => i + 1).map((n) => {
            const on = value === n
            return (
              <button
                key={n}
                type="button"
                className="diag-opt"
                aria-pressed={on}
                onClick={() => onSelect(n)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  aspectRatio: '1 / 1',
                  borderRadius: 11,
                  border: `1.5px solid ${on ? 'var(--gold)' : 'var(--line-strong)'}`,
                  background: on ? 'var(--gold-wash)' : 'var(--surface)',
                  color: on ? 'var(--gold-deep)' : 'var(--ink-soft)',
                  fontFamily: 'var(--mono)',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--muted)',
            marginTop: 12,
            gap: 8,
          }}
        >
          <span>{SCALE_LABELS.left}</span>
          <span>{SCALE_LABELS.center}</span>
          <span style={{ textAlign: 'right' }}>{SCALE_LABELS.right}</span>
        </div>
      </div>
    )
  }

  // choice + frequency both render as a vertical stack of option buttons.
  const options: string[] =
    question.type === 'choice' ? question.options.map((o) => o.label) : [...FREQUENCY_OPTIONS]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {options.map((label, i) => {
        const on = value === i
        return (
          <button
            key={i}
            type="button"
            className="diag-opt"
            aria-pressed={on}
            onClick={() => onSelect(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textAlign: 'left',
              borderRadius: 11,
              border: `1.5px solid ${on ? 'var(--gold)' : 'var(--line-strong)'}`,
              background: on ? 'var(--gold-wash)' : 'var(--surface)',
              color: on ? 'var(--ink)' : 'var(--ink-soft)',
              padding: '13px 15px',
              fontSize: 14.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
              lineHeight: 1.4,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                flexShrink: 0,
                border: `2px solid ${on ? 'var(--gold-deep)' : 'var(--line-strong)'}`,
                background: on ? 'var(--gold-deep)' : 'transparent',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {on && (
                <span
                  style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--surface)' }}
                />
              )}
            </span>
            {label}
          </button>
        )
      })}
    </div>
  )
}
````

### src/app/diagnostic/results/[id]/page.tsx

````tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { MODULES } from '@/lib/diagnostic/questions'
import {
  CLASS_LABEL,
  MAX_OVERALL,
  type DiagnosticClass,
} from '@/lib/diagnostic/scoring'

// Public results report for a completed AFF Success Diagnostic. Reads the
// row id (an unguessable capability token) from the route, fetches the
// subject view, and renders the score gauge, module breakdown, limiting
// factor, probability meters, recommended focus, and consistency badge.

const THEME_CSS = `
:root {
  --paper:#F7F5F0; --surface:#FFFFFF; --surface-2:#FBFAF7; --surface-3:#F1EEE7;
  --ink:#16324E; --ink-soft:#40566C; --muted:#6B8299;
  --line:#E4E1D9; --line-strong:#D4D9DF;
  --gold:#C9A96E; --gold-deep:#A87F3C; --gold-wash:rgba(201,169,110,0.14);
  --good:#2E7D57; --good-wash:rgba(46,125,87,0.12);
  --elite:#1F6E4A; --elite-wash:rgba(31,110,74,0.14);
  --warn:#B67A22; --warn-wash:rgba(182,122,34,0.14);
  --crit:#B4451F; --crit-wash:rgba(180,69,31,0.12);
  --navy-wash:rgba(22,50,78,0.05);
  --shadow:0 1px 2px rgba(22,50,78,0.06), 0 12px 32px -12px rgba(22,50,78,0.18);
  --shadow-lg:0 2px 4px rgba(22,50,78,0.08), 0 30px 60px -24px rgba(22,50,78,0.32);
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:"SF Mono",ui-monospace,"Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper:#0F151B; --surface:#161F29; --surface-2:#1A242F; --surface-3:#202C38;
    --ink:#F1ECE2; --ink-soft:#C4D0DB; --muted:#8698AA;
    --line:#26323E; --line-strong:#334150;
    --gold:#D8B877; --gold-deep:#E4C68C; --gold-wash:rgba(216,184,119,0.12);
    --good:#5FB68A; --good-wash:rgba(95,182,138,0.14);
    --elite:#7ED0A6; --elite-wash:rgba(126,208,166,0.14);
    --warn:#DBA24C; --warn-wash:rgba(219,162,76,0.16);
    --crit:#E0805F; --crit-wash:rgba(224,128,95,0.15);
    --navy-wash:rgba(255,255,255,0.04);
    --shadow:0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6);
    --shadow-lg:0 2px 4px rgba(0,0,0,0.5), 0 30px 60px -24px rgba(0,0,0,0.7);
  }
}
:root[data-theme="light"] {
  --paper:#F7F5F0; --surface:#FFFFFF; --surface-2:#FBFAF7; --surface-3:#F1EEE7;
  --ink:#16324E; --ink-soft:#40566C; --muted:#6B8299;
  --line:#E4E1D9; --line-strong:#D4D9DF;
  --gold:#C9A96E; --gold-deep:#A87F3C; --gold-wash:rgba(201,169,110,0.14);
  --good:#2E7D57; --good-wash:rgba(46,125,87,0.12);
  --elite:#1F6E4A; --elite-wash:rgba(31,110,74,0.14);
  --warn:#B67A22; --warn-wash:rgba(182,122,34,0.14);
  --crit:#B4451F; --crit-wash:rgba(180,69,31,0.12);
  --navy-wash:rgba(22,50,78,0.05);
  --shadow:0 1px 2px rgba(22,50,78,0.06), 0 12px 32px -12px rgba(22,50,78,0.18);
  --shadow-lg:0 2px 4px rgba(22,50,78,0.08), 0 30px 60px -24px rgba(22,50,78,0.32);
}
:root[data-theme="dark"] {
  --paper:#0F151B; --surface:#161F29; --surface-2:#1A242F; --surface-3:#202C38;
  --ink:#F1ECE2; --ink-soft:#C4D0DB; --muted:#8698AA;
  --line:#26323E; --line-strong:#334150;
  --gold:#D8B877; --gold-deep:#E4C68C; --gold-wash:rgba(216,184,119,0.12);
  --good:#5FB68A; --good-wash:rgba(95,182,138,0.14);
  --elite:#7ED0A6; --elite-wash:rgba(126,208,166,0.14);
  --warn:#DBA24C; --warn-wash:rgba(219,162,76,0.16);
  --crit:#E0805F; --crit-wash:rgba(224,128,95,0.15);
  --navy-wash:rgba(255,255,255,0.04);
  --shadow:0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6);
  --shadow-lg:0 2px 4px rgba(0,0,0,0.5), 0 30px 60px -24px rgba(0,0,0,0.7);
}
.diag-root { background:var(--paper); color:var(--ink); font-family:var(--sans); min-height:100vh; overflow-x:hidden; }
.diag-root h1,.diag-root h2,.diag-root h3 { font-family:var(--serif); font-weight:600; line-height:1.15; margin:0; letter-spacing:-0.01em; }
.diag-theme:hover { color:var(--ink); border-color:var(--gold); }
.diag-report-body { display:grid; grid-template-columns:1.35fr 1fr; gap:30px; }
.diag-report-hero { display:grid; grid-template-columns:auto 1fr; gap:28px; align-items:center; }
@keyframes diagspin { to { transform:rotate(360deg); } }
@media (max-width:720px) {
  .diag-report-body { grid-template-columns:1fr; }
  .diag-report-hero { grid-template-columns:1fr; text-align:center; justify-items:center; }
}
@media (prefers-reduced-motion: reduce) { * { animation-duration:0.001ms !important; } }
`

// Class -> theme-aware color + wash variables.
const CLASS_COLOR: Record<DiagnosticClass, { color: string; wash: string }> = {
  ENTRY: { color: 'var(--crit)', wash: 'var(--crit-wash)' },
  EMERGING: { color: 'var(--warn)', wash: 'var(--warn-wash)' },
  DEVELOPING: { color: 'var(--gold-deep)', wash: 'var(--gold-wash)' },
  ADVANCED: { color: 'var(--good)', wash: 'var(--good-wash)' },
  ELITE: { color: 'var(--elite)', wash: 'var(--elite-wash)' },
}

const MODULE_ORDER: Record<string, number> = Object.fromEntries(
  MODULES.map((m) => [m.key, m.order]),
)

interface ModuleScore {
  key: string
  name: string
  pct: number
  class: DiagnosticClass
}
interface Probabilities {
  licensing: number
  retention: number
  network: number
  leadership: number
}
interface ResultData {
  id: string
  name: string
  completedAt: string | null
  overallScore: number
  overallClass: DiagnosticClass
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
  probabilities: Probabilities
  consistencyLabel: string
}

function useTheme() {
  const toggle = () => {
    const root = document.documentElement
    const current =
      root.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    root.dataset.theme = current === 'dark' ? 'light' : 'dark'
  }
  return { toggle }
}

export default function ResultsPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { toggle } = useTheme()

  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading')
  const [result, setResult] = useState<ResultData | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    setStatus('loading')
    fetch(`/api/diagnostic/result/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (active) setStatus('notfound')
          return
        }
        if (!res.ok) {
          if (active) setStatus('error')
          return
        }
        const data = (await res.json()) as { result?: ResultData }
        if (active) {
          if (data.result) {
            setResult(data.result)
            setStatus('ready')
          } else {
            setStatus('error')
          }
        }
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [id])

  return (
    <div className="diag-root">
      <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />

      {/* top bar (sticky, iOS safe area aware) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'color-mix(in srgb, var(--paper) 88%, transparent)',
          backdropFilter: 'saturate(1.4) blur(12px)',
          WebkitBackdropFilter: 'saturate(1.4) blur(12px)',
          borderBottom: '1px solid var(--line)',
          paddingTop: 'calc(12px + env(safe-area-inset-top))',
        }}
      >
        <div
          style={{
            maxWidth: 920,
            margin: '0 auto',
            padding: '0 20px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: 'linear-gradient(150deg,var(--ink),#0d2036)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--gold)',
                fontFamily: 'var(--serif)',
                fontSize: 15,
                boxShadow: 'inset 0 0 0 1px rgba(201,169,110,0.35)',
              }}
            >
              A
            </span>
            <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em' }}>
              All Financial Freedom
              <small
                style={{
                  display: 'block',
                  fontFamily: 'var(--sans)',
                  fontWeight: 500,
                  fontSize: 10.5,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                Success Diagnostic
              </small>
            </span>
          </div>
          <button
            className="diag-theme"
            onClick={toggle}
            aria-label="Toggle light and dark theme"
            title="Toggle theme"
            style={{
              marginLeft: 'auto',
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink-soft)',
              width: 38,
              height: 38,
              borderRadius: 9,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 16,
            }}
          >
            ◑
          </button>
        </div>
      </div>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '30px 20px 64px' }}>
        {status === 'loading' && <StateCard title="Building your report…" spinner />}
        {status === 'notfound' && (
          <StateCard
            title="Report not found"
            body="This results link is invalid or has expired. If you just finished the diagnostic, please check the link and try again."
          />
        )}
        {status === 'error' && (
          <StateCard
            title="Something went wrong"
            body="We could not load this report right now. Please refresh the page in a moment."
          />
        )}
        {status === 'ready' && result && <Report result={result} />}
      </main>
    </div>
  )
}

function StateCard({ title, body, spinner }: { title: string; body?: string; spinner?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        boxShadow: 'var(--shadow)',
        padding: '48px 30px',
        textAlign: 'center',
        maxWidth: 520,
        margin: '40px auto 0',
      }}
    >
      {spinner && (
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: '3px solid var(--surface-3)',
            borderTopColor: 'var(--gold-deep)',
            display: 'inline-block',
            animation: 'diagspin .8s linear infinite',
            marginBottom: 18,
          }}
        />
      )}
      <h2 style={{ fontSize: 22, marginBottom: body ? 10 : 0 }}>{title}</h2>
      {body && <p style={{ color: 'var(--ink-soft)', fontSize: 15, lineHeight: 1.6 }}>{body}</p>}
    </div>
  )
}

function Pill({ className: cls, label }: { className: DiagnosticClass; label: string }) {
  const { color, wash } = CLASS_COLOR[cls]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.03em',
        padding: '3px 9px',
        borderRadius: 999,
        textTransform: 'uppercase',
        color,
        background: wash,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {label}
    </span>
  )
}

function Report({ result }: { result: ResultData }) {
  const pct = Math.round((result.overallScore / MAX_OVERALL) * 100)
  // Gauge arc: radius 74, circumference ~= 464.9. Fill proportional to score.
  const CIRC = 2 * Math.PI * 74
  const dashOffset = CIRC * (1 - result.overallScore / MAX_OVERALL)

  const modules = [...result.modules].sort(
    (a, b) => (MODULE_ORDER[a.key] ?? 99) - (MODULE_ORDER[b.key] ?? 99),
  )

  const limiting = result.modules.find((m) => m.key === result.limitingModule)
  const limitingPct = limiting ? Math.round(limiting.pct) : 0

  const probs: { label: string; value: number }[] = [
    { label: 'Licensing probability', value: result.probabilities.licensing },
    { label: 'Retention probability', value: result.probabilities.retention },
    { label: 'Network expansion', value: result.probabilities.network },
    { label: 'Leadership potential', value: result.probabilities.leadership },
  ]

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      {/* hero */}
      <div
        className="diag-report-hero"
        style={{
          padding: '30px 28px 26px',
          background: 'radial-gradient(600px 300px at 90% -20%, var(--gold-wash), transparent 60%)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ position: 'relative', width: 172, height: 172 }}>
          <svg width="172" height="172" viewBox="0 0 172 172" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="86" cy="86" r="74" fill="none" stroke="var(--surface-3)" strokeWidth="14" />
            <circle
              cx="86"
              cy="86"
              r="74"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={CIRC.toFixed(1)}
              strokeDashoffset={dashOffset.toFixed(1)}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeContent: 'center',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 42,
                lineHeight: 1,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {result.overallScore}
              <small style={{ fontSize: 16, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                /{MAX_OVERALL}
              </small>
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--gold-deep)',
                marginTop: 6,
              }}
            >
              Success Score
            </div>
          </div>
        </div>

        <div>
          <h3
            style={{
              fontSize: 15,
              fontFamily: 'var(--sans)',
              fontWeight: 600,
              color: 'var(--muted)',
              letterSpacing: '0.02em',
            }}
          >
            Personal Performance Report
          </h3>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, margin: '2px 0 14px', color: 'var(--ink)' }}>
            {result.name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, justifyContent: 'inherit' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--ink-soft)',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: '7px 12px',
              }}
            >
              Overall class <Pill className={result.overallClass} label={result.overallClassLabel} />
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--ink-soft)',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: '7px 12px',
              }}
            >
              Consistency <b style={{ color: 'var(--good)', fontWeight: 600 }}>{result.consistencyLabel}</b>
            </span>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="diag-report-body" style={{ padding: '26px 28px 30px' }}>
        {/* left: module breakdown */}
        <div>
          <div style={blockTitleStyle}>
            <span style={{ color: 'var(--gold-deep)' }}>■</span> Module breakdown
          </div>

          {modules.map((m) => {
            const p = Math.round(m.pct)
            const { color } = CLASS_COLOR[m.class]
            return (
              <div
                key={m.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '6px 12px',
                  alignItems: 'center',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{m.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Pill className={m.class} label={CLASS_LABEL[m.class]} />
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      width: 44,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {p}%
                  </span>
                </div>
                <div
                  style={{
                    gridColumn: '1 / -1',
                    height: 6,
                    borderRadius: 4,
                    background: 'var(--surface-3)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      width: `${p}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>
            )
          })}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'var(--good-wash)',
              border: '1px solid color-mix(in srgb,var(--good) 28%, transparent)',
              borderRadius: 12,
              padding: '14px 16px',
              marginTop: 20,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--surface)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--good)',
                flexShrink: 0,
                boxShadow: 'var(--shadow)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              <b style={{ color: 'var(--good)' }}>Consistency: {result.consistencyLabel}.</b> Your
              reverse-worded items line up with their positive twins, so this score reflects your real
              pattern.
            </div>
          </div>
        </div>

        {/* right: limiting factor + probabilities */}
        <div>
          <div
            style={{
              background: 'var(--crit-wash)',
              border: '1px solid color-mix(in srgb,var(--crit) 30%, transparent)',
              borderRadius: 12,
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--crit)',
                fontWeight: 700,
              }}
            >
              ⚠ #1 Limiting factor
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 19, margin: '6px 0 3px', color: 'var(--ink)' }}>
              {result.limitingModuleName}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              Lowest module at{' '}
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--crit)', fontWeight: 700 }}>
                {limitingPct}%
              </span>
              . Everything downstream is capped here first.
            </div>
          </div>

          <div style={{ ...blockTitleStyle, marginTop: 26 }}>
            <span style={{ color: 'var(--gold-deep)' }}>■</span> Probability indicators
          </div>
          {probs.map((p) => {
            const v = Math.round(p.value)
            return (
              <div key={p.label} style={{ marginBottom: 15 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    marginBottom: 6,
                    color: 'var(--ink-soft)',
                  }}
                >
                  <span>{p.label}</span>
                  <b style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--ink)' }}>{v}%</b>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 5,
                      width: `${v}%`,
                      background: 'linear-gradient(90deg,#3b6ea5,var(--ink))',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* recommended focus, full width */}
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
            background: 'linear-gradient(120deg,var(--surface-2),var(--surface-3))',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '18px 22px',
          }}
        >
          <div>
            <b
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--gold-deep)',
              }}
            >
              🎯 Recommended focus area
            </b>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, marginTop: 3, color: 'var(--ink)' }}>
              {result.recommendedFocus}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const blockTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
````

### src/app/agents/diagnostic/page.tsx

````tsx
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/useIsMobile'

// Class colors, shared by pills and bars.
const CLASS_COLOR: Record<string, string> = {
  ENTRY: '#B4451F',
  EMERGING: '#B67A22',
  DEVELOPING: '#C9A96E',
  ADVANCED: '#4ADE80',
  ELITE: '#34D399',
}

const MAX_OVERALL = 800

// Which classes each segmented-control bucket includes.
const CLASS_BUCKETS: Record<string, string[]> = {
  ALL: ['ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE'],
  ADVANCED: ['ADVANCED', 'ELITE'],
  EMERGING: ['EMERGING', 'DEVELOPING'],
  ENTRY: ['ENTRY'],
}
const BUCKET_LABEL: Record<string, string> = {
  ALL: 'All',
  ADVANCED: 'Advanced+',
  EMERGING: 'Emerging',
  ENTRY: 'Entry',
}

interface ModuleScore {
  key: string
  name: string
  pct: number
  class: string
}

interface SubjectView {
  id: string
  name: string
  completedAt: string | null
  overallScore: number
  overallClass: string
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
  probabilities: { licensing: number; retention: number; network: number; leadership: number }
  consistencyLabel: string
}

interface CoachingListItem {
  id: string
  name: string
  completedAt: string | null
  overallScore: number
  overallClass: string
  overallClassLabel: string
  limitingModule: string
  limitingModuleName: string
}

// The coaching drill-in view. No risk, no probabilities, no consistency.
interface CoachingView {
  id: string
  name: string
  state: string | null
  completedAt: string | null
  overallScore: number
  overallClass: string
  overallClassLabel: string
  modules: ModuleScore[]
  limitingModule: string
  limitingModuleName: string
  recommendedFocus: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ClassPill({ cls, label }: { cls: string; label: string }) {
  const color = CLASS_COLOR[cls] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color, background: `${color}1A`, border: `1px solid ${color}55`,
      borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// A thin score bar colored by class, filled proportional to score/800.
function ScoreBar({ score, cls, width = 80 }: { score: number; cls: string; width?: number | string }) {
  const color = CLASS_COLOR[cls] ?? '#6B8299'
  const pct = Math.max(0, Math.min(100, (score / MAX_OVERALL) * 100))
  return (
    <div style={{ width, height: 6, borderRadius: 999, background: 'rgba(155,176,196,0.15)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  )
}

// A single module row in the 10-module breakdown.
function ModuleRow({ m }: { m: ModuleScore }) {
  const color = CLASS_COLOR[m.class] ?? '#6B8299'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#9BB0C4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {m.name}
      </div>
      <div style={{ flex: '0 0 96px', height: 6, borderRadius: 999, background: 'rgba(155,176,196,0.15)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, m.pct))}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <div style={{ flex: '0 0 40px', textAlign: 'right', fontSize: 11, fontWeight: 700, color }}>
        {Math.round(m.pct)}%
      </div>
    </div>
  )
}

function ModuleBreakdown({ modules }: { modules: ModuleScore[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {modules.map(m => <ModuleRow key={m.key} m={m} />)}
    </div>
  )
}

export default function DiagnosticPage() {
  const router = useRouter()
  const isMobile = useIsMobile()

  const [loading, setLoading] = useState(true)
  const [mine, setMine] = useState<SubjectView | null>(null)
  const [team, setTeam] = useState<CoachingListItem[]>([])
  const [agentCode, setAgentCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState<'ALL' | 'ADVANCED' | 'EMERGING' | 'ENTRY'>('ALL')
  const [moduleFilter, setModuleFilter] = useState<string>('ALL')

  // Drill-in modal
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CoachingView | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    // Preserve ?preview=<token> so admin "view portal as X" keeps working.
    const search = typeof window !== 'undefined' ? window.location.search : ''
    fetch(`/api/agents/diagnostic${search}`)
      .then(r => r.json())
      .then((d: { mine: SubjectView | null; team: CoachingListItem[] }) => {
        setMine(d.mine ?? null)
        setTeam(Array.isArray(d.team) ? d.team : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    fetch(`/api/agents/me${search}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { agentCode?: string } | null) => { if (d?.agentCode) setAgentCode(d.agentCode) })
      .catch(() => {})
  }, [])

  const openDetail = useCallback((id: string) => {
    setOpenId(id)
    setDetail(null)
    setDetailLoading(true)
    const qs = typeof window !== 'undefined' ? window.location.search : ''
    fetch(`/api/agents/diagnostic/${id}${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { tier: string; result: CoachingView } | null) => { setDetail(d?.result ?? null) })
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }, [])

  const copyShareLink = useCallback(async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = agentCode
      ? `${origin}/diagnostic?ref=${encodeURIComponent(agentCode)}`
      : `${origin}/diagnostic`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy your diagnostic link:', link)
    }
  }, [agentCode])

  // Module chips available to filter by (from the team's limiting modules).
  const moduleOptions = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const t of team) {
      if (t.limitingModule) byKey.set(t.limitingModule, t.limitingModuleName)
    }
    return [...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [team])

  const filteredTeam = useMemo(() => {
    const q = search.trim().toLowerCase()
    const bucket = CLASS_BUCKETS[classFilter]
    return team
      .filter(t => {
        if (q && !t.name.toLowerCase().includes(q)) return false
        if (!bucket.includes(t.overallClass)) return false
        if (moduleFilter !== 'ALL' && t.limitingModule !== moduleFilter) return false
        return true
      })
      .sort((a, b) => a.overallScore - b.overallScore) // weakest first
  }, [team, search, classFilter, moduleFilter])

  const panel = '#142D48'
  const card = '#132238'
  const gold = '#C9A96E'

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628' }}>
      {/* Sticky header */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: isMobile
          ? 'calc(10px + env(safe-area-inset-top)) 14px 10px'
          : 'calc(14px + env(safe-area-inset-top)) clamp(16px,4vw,32px) 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: gold, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: gold }}>
            AFF Success Diagnostic
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 1 }}>Diagnostic</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px,4vw,28px)' }}>
        {loading ? (
          <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>Loading...</div>
        ) : (
          <>
            {/* Your result */}
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B8299', margin: '0 0 12px' }}>
                Your result
              </h2>

              {mine ? (
                <div style={{
                  background: panel, border: '1px solid rgba(201,169,110,0.14)', borderRadius: 12,
                  padding: 'clamp(16px,3vw,22px)',
                }}>
                  {/* Score + class */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{mine.overallScore}</span>
                      <span style={{ fontSize: 16, color: '#6B8299', fontWeight: 600 }}>/ {MAX_OVERALL}</span>
                    </div>
                    <div style={{ paddingBottom: 4 }}>
                      <ClassPill cls={mine.overallClass} label={mine.overallClassLabel} />
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6B8299', paddingBottom: 6 }}>
                      Completed {formatDate(mine.completedAt)}
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <ScoreBar score={mine.overallScore} cls={mine.overallClass} width="100%" />
                  </div>

                  {/* Module breakdown */}
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 10 }}>
                    Module breakdown
                  </div>
                  <ModuleBreakdown modules={mine.modules} />

                  {/* Limiting factor + recommended focus */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 20 }}>
                    <div style={{ background: card, border: '1px solid rgba(180,69,31,0.35)', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B4451F', marginBottom: 6 }}>
                        #1 Limiting factor
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{mine.limitingModuleName}</div>
                    </div>
                    <div style={{ background: card, border: '1px solid rgba(201,169,110,0.25)', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: gold, marginBottom: 6 }}>
                        Recommended focus
                      </div>
                      <div style={{ fontSize: 13, color: '#9BB0C4', lineHeight: 1.5 }}>{mine.recommendedFocus}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: panel, border: '1px solid rgba(201,169,110,0.14)', borderRadius: 12,
                  padding: 'clamp(20px,4vw,28px)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                    You haven&apos;t taken the diagnostic yet
                  </div>
                  <div style={{ fontSize: 13, color: '#9BB0C4', marginBottom: 18, lineHeight: 1.5 }}>
                    Get your AFF success score across all 10 modules and see exactly where to focus next.
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <a
                      href="/diagnostic"
                      style={{
                        display: 'inline-block', background: gold, color: '#0A1628',
                        fontWeight: 700, fontSize: 13, letterSpacing: '0.03em',
                        borderRadius: 8, padding: '10px 20px', textDecoration: 'none',
                      }}
                    >
                      Take the diagnostic
                    </a>
                    <button
                      onClick={copyShareLink}
                      style={{
                        background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.3)',
                        color: gold, fontWeight: 700, fontSize: 13, borderRadius: 8,
                        padding: '10px 20px', cursor: 'pointer',
                      }}
                    >
                      {copied ? 'Link copied' : 'Share your link'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Your team */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B8299', margin: 0 }}>
                  Your team
                </h2>
                {team.length > 0 && (
                  <span style={{ fontSize: 11, color: '#4B5563' }}>
                    {filteredTeam.length} of {team.length}
                  </span>
                )}
                {mine && (
                  <button
                    onClick={copyShareLink}
                    style={{
                      marginLeft: 'auto',
                      background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.3)',
                      color: gold, fontWeight: 700, fontSize: 11, borderRadius: 6,
                      padding: '6px 12px', cursor: 'pointer',
                    }}
                  >
                    {copied ? 'Link copied' : 'Share your link'}
                  </button>
                )}
              </div>

              {team.length === 0 ? (
                <div style={{
                  background: panel, border: '1px solid rgba(201,169,110,0.1)', borderRadius: 12,
                  padding: 'clamp(20px,4vw,32px)', textAlign: 'center',
                  color: '#9BB0C4', fontSize: 13, lineHeight: 1.6,
                }}>
                  No completed diagnostics from your team yet. Share your link to get started.
                </div>
              ) : (
                <>
                  {/* Filters */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name..."
                        style={{
                          flex: 1, minWidth: 160,
                          background: card, border: '1px solid rgba(201,169,110,0.2)',
                          borderRadius: 6, color: '#9BB0C4', padding: '8px 12px', fontSize: 13,
                        }}
                      />
                      {/* Class segmented control */}
                      <div style={{ display: 'inline-flex', background: card, border: '1px solid rgba(201,169,110,0.2)', borderRadius: 8, padding: 3, gap: 2 }}>
                        {(['ALL', 'ADVANCED', 'EMERGING', 'ENTRY'] as const).map(b => {
                          const active = classFilter === b
                          return (
                            <button
                              key={b}
                              onClick={() => setClassFilter(b)}
                              style={{
                                background: active ? 'rgba(201,169,110,0.18)' : 'transparent',
                                border: active ? '1px solid rgba(201,169,110,0.4)' : '1px solid transparent',
                                color: active ? gold : '#6B8299',
                                fontSize: 11, fontWeight: 700, borderRadius: 6,
                                padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              {BUCKET_LABEL[b]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Weakest-module chips */}
                    {moduleOptions.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4B5563', marginRight: 2 }}>
                          Top gap
                        </span>
                        {[['ALL', 'All'] as [string, string], ...moduleOptions].map(([key, label]) => {
                          const active = moduleFilter === key
                          return (
                            <button
                              key={key}
                              onClick={() => setModuleFilter(key)}
                              style={{
                                background: active ? 'rgba(201,169,110,0.18)' : 'rgba(201,169,110,0.04)',
                                border: active ? '1px solid rgba(201,169,110,0.4)' : '1px solid rgba(201,169,110,0.12)',
                                color: active ? gold : '#9BB0C4',
                                fontSize: 11, fontWeight: 600, borderRadius: 999,
                                padding: '4px 11px', cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Team list */}
                  {filteredTeam.length === 0 ? (
                    <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                      No recruits match these filters.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filteredTeam.map(t => (
                        <button
                          key={t.id}
                          onClick={() => openDetail(t.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr auto' : '1.5fr 1.2fr auto 1.4fr auto',
                            alignItems: 'center', gap: isMobile ? 8 : 14,
                            background: card, border: '1px solid rgba(201,169,110,0.1)',
                            borderRadius: 10, padding: isMobile ? '12px 14px' : '12px 16px',
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.name}
                            </div>
                            {isMobile && (
                              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Gap: {t.limitingModuleName}
                              </div>
                            )}
                          </div>

                          {!isMobile && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ScoreBar score={t.overallScore} cls={t.overallClass} width={70} />
                              <span style={{ fontSize: 11, color: '#9BB0C4', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {t.overallScore}/{MAX_OVERALL}
                              </span>
                            </div>
                          )}

                          <ClassPill cls={t.overallClass} label={t.overallClassLabel} />

                          {!isMobile && (
                            <div style={{ fontSize: 12, color: '#9BB0C4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.limitingModuleName}
                            </div>
                          )}

                          <div style={{ fontSize: 11, color: '#6B8299', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {isMobile ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                <span style={{ color: '#9BB0C4', fontWeight: 600 }}>{t.overallScore}/{MAX_OVERALL}</span>
                                <span>{formatDate(t.completedAt)}</span>
                              </div>
                            ) : (
                              formatDate(t.completedAt)
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* Drill-in modal */}
      {openId && (
        <div
          onClick={() => setOpenId(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(10,22,40,0.82)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
            padding: isMobile ? 0 : 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#142D48', border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: isMobile ? '16px 16px 0 0' : 14,
              width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
              padding: 'clamp(18px,4vw,24px)',
              paddingBottom: isMobile ? 'calc(24px + env(safe-area-inset-bottom))' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A96E' }}>
                Coaching view
              </div>
              <button
                onClick={() => setOpenId(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: '#6B8299', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>

            {detailLoading ? (
              <div style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Loading...</div>
            ) : !detail ? (
              <div style={{ color: '#9BB0C4', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
                Could not load this result.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{detail.name}</div>
                  {detail.state && <div style={{ fontSize: 12, color: '#6B8299', paddingBottom: 3 }}>{detail.state}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{detail.overallScore}</span>
                  <span style={{ fontSize: 14, color: '#6B8299' }}>/ {MAX_OVERALL}</span>
                  <span style={{ marginLeft: 4 }}><ClassPill cls={detail.overallClass} label={detail.overallClassLabel} /></span>
                </div>
                <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 16 }}>
                  Completed {formatDate(detail.completedAt)}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 10 }}>
                  Module breakdown
                </div>
                <ModuleBreakdown modules={detail.modules} />

                <div style={{ background: '#132238', border: '1px solid rgba(180,69,31,0.35)', borderRadius: 10, padding: 14, marginTop: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B4451F', marginBottom: 6 }}>
                    #1 Limiting factor
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{detail.limitingModuleName}</div>
                </div>

                <div style={{ background: '#132238', border: '1px solid rgba(201,169,110,0.25)', borderRadius: 10, padding: 14, marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
                    Recommended focus
                  </div>
                  <div style={{ fontSize: 13, color: '#9BB0C4', lineHeight: 1.5 }}>{detail.recommendedFocus}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
````

### src/app/vault/diagnostic/page.tsx

````tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// VAULT Success Diagnostic — list view for admin + licensing coordinators.
// Fetches completed diagnostic results, offers rich client-side filtering,
// group-by, metric cards, and a CSV export of the current filtered view.

const card: React.CSSProperties = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }
const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = { background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 4, color: '#9BB0C4', padding: '7px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' }

type Risk = 'NEEDS_IMPROVEMENT' | 'MODERATE' | 'ON_TRACK' | 'STRONG'
type OverallClass = 'ENTRY' | 'EMERGING' | 'DEVELOPING' | 'ADVANCED' | 'ELITE'

interface VaultListItem {
  id: string
  createdAt: string
  completedAt: string | null
  status: string
  name: string
  email: string
  state: string | null
  source: string | null
  recruiterCode: string | null
  recruiterName: string | null
  overallScore: number
  overallClass: OverallClass
  overallClassLabel: string
  risk: Risk
  limitingModule: string | null
  limitingModuleName: string | null
  licensingProbability: number
}

const CLASS_ORDER: OverallClass[] = ['ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE']
const CLASS_COLOR: Record<OverallClass, string> = {
  ENTRY: '#B4451F', EMERGING: '#C9862E', DEVELOPING: '#C9A96E', ADVANCED: '#2E7D57', ELITE: '#1F6E4A',
}
const RISK_ORDER: Risk[] = ['NEEDS_IMPROVEMENT', 'MODERATE', 'ON_TRACK', 'STRONG']
const RISK_COLOR: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: '#B4451F', MODERATE: '#C9862E', ON_TRACK: '#3B6EA5', STRONG: '#2E7D57',
}
const RISK_LABEL: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: 'Needs improvement', MODERATE: 'Moderate', ON_TRACK: 'On track', STRONG: 'Strong',
}

const MAX_SCORE = 800

type GroupKey = 'none' | 'class' | 'risk' | 'module' | 'recruiter' | 'state'
const GROUP_OPTIONS: { key: GroupKey; label: string }[] = [
  { key: 'none', label: 'None (flat table)' },
  { key: 'class', label: 'Overall class' },
  { key: 'risk', label: 'Risk' },
  { key: 'module', label: 'Weakest module' },
  { key: 'recruiter', label: 'Recruiter' },
  { key: 'state', label: 'State' },
]

// ── CSV export helper (mirrors /vault/progress). UTF-8 BOM so Excel reads
// it as Unicode; quote any cell with a comma / quote / newline. ──────────
function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

export default function VaultDiagnosticPage() {
  const [items, setItems] = useState<VaultListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [classFilter, setClassFilter] = useState<string>('')
  const [riskFilter, setRiskFilter] = useState<string>('')
  const [moduleFilter, setModuleFilter] = useState<string>('')
  const [recruiterFilter, setRecruiterFilter] = useState<string>('')
  const [stateFilter, setStateFilter] = useState<string>('')
  const [minScore, setMinScore] = useState<number>(0)
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/vault/diagnostic')
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ items: VaultListItem[]; count: number }>
      })
      .then(d => setItems(d.items ?? []))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // Distinct option sets for the dropdowns, derived from the data so we
  // only ever offer values that actually appear.
  const moduleOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items) {
      if (it.limitingModule) m.set(it.limitingModule, it.limitingModuleName ?? it.limitingModule)
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  const recruiterOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items) {
      if (it.recruiterCode) m.set(it.recruiterCode, it.recruiterName ?? it.recruiterCode)
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  const stateOptions = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) if (it.state) s.add(it.state)
    return Array.from(s).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(it => {
      if (classFilter && it.overallClass !== classFilter) return false
      if (riskFilter && it.risk !== riskFilter) return false
      if (moduleFilter && it.limitingModule !== moduleFilter) return false
      if (recruiterFilter && it.recruiterCode !== recruiterFilter) return false
      if (stateFilter && it.state !== stateFilter) return false
      if (minScore > 0 && it.overallScore < minScore) return false
      if (q) {
        const hay = `${it.name} ${it.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, classFilter, riskFilter, moduleFilter, recruiterFilter, stateFilter, minScore, search])

  // ── Metric cards (org-wide, computed from ALL items, not the filtered
  // subset, so they read as a stable overview). ──────────────────────────
  const metrics = useMemo(() => {
    const total = items.length
    const aClass = items.filter(it => it.overallClass === 'ADVANCED' || it.overallClass === 'ELITE').length
    const avgLicensing = total > 0
      ? Math.round(items.reduce((s, it) => s + (it.licensingProbability || 0), 0) / total)
      : 0
    // Most common weakest module org-wide.
    const moduleCounts = new Map<string, number>()
    for (const it of items) {
      if (it.limitingModuleName) moduleCounts.set(it.limitingModuleName, (moduleCounts.get(it.limitingModuleName) ?? 0) + 1)
    }
    let topModule = '—'
    let topCount = 0
    for (const [name, c] of moduleCounts) {
      if (c > topCount) { topModule = name; topCount = c }
    }
    return { total, aClass, avgLicensing, topModule, topCount }
  }, [items])

  // ── Grouping. Each group carries a stable key, a display label, its
  // rows, a count, and the average score across the group. ────────────────
  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: '__all__', label: '', rows: filtered, count: filtered.length, avgScore: avg(filtered) }]
    }
    const buckets = new Map<string, VaultListItem[]>()
    for (const it of filtered) {
      const key = groupKeyFor(it, groupBy)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(it)
    }
    const arr = Array.from(buckets.entries()).map(([key, rows]) => ({
      key,
      label: groupLabelFor(rows[0], groupBy),
      rows,
      count: rows.length,
      avgScore: avg(rows),
      sortIndex: groupSortIndex(rows[0], groupBy),
    }))
    arr.sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex
      return a.label.localeCompare(b.label)
    })
    return arr
  }, [filtered, groupBy])

  const activeFilters = classFilter || riskFilter || moduleFilter || recruiterFilter || stateFilter || minScore > 0 || search.trim()

  const clearAll = () => {
    setClassFilter(''); setRiskFilter(''); setModuleFilter(''); setRecruiterFilter('')
    setStateFilter(''); setMinScore(0); setSearch('')
  }

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const exportCsv = () => {
    const cols = [
      'Name', 'Email', 'State', 'Recruiter', 'Recruiter code', 'Score', 'Class',
      'Risk', 'Licensing %', 'Weakest module', 'Source', 'Completed', 'Created',
    ]
    const rows: string[] = [cols.map(escapeCsv).join(',')]
    for (const it of filtered) {
      const r = [
        it.name ?? '',
        it.email ?? '',
        it.state ?? '',
        it.recruiterName ?? '',
        it.recruiterCode ?? '',
        String(it.overallScore),
        it.overallClassLabel ?? it.overallClass,
        RISK_LABEL[it.risk] ?? it.risk,
        String(it.licensingProbability),
        it.limitingModuleName ?? '',
        it.source ?? '',
        it.completedAt ? new Date(it.completedAt).toISOString() : '',
        it.createdAt ? new Date(it.createdAt).toISOString() : '',
      ]
      rows.push(r.map(escapeCsv).join(','))
    }
    const blob = new Blob(['﻿', rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `aff-diagnostic-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto', color: '#E6EDF5' }}>
      <div style={sectionLabel}>Success Diagnostic</div>
      <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 300, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
        Diagnostic Results
      </h1>
      <p style={{ color: '#6B8299', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
        Completed VAULT Success Diagnostics across the org. Filter, group, and open any result for the full report.
      </p>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
        <MetricCard label="Completed diagnostics" value={metrics.total.toLocaleString()} accent="#C9A96E" />
        <MetricCard label="A-class candidates" value={metrics.aClass.toLocaleString()} accent="#2E7D57" hint="Advanced or Elite overall" />
        <MetricCard label="Avg licensing probability" value={`${metrics.avgLicensing}%`} accent="#3B6EA5" />
        <MetricCard label="Most common weak spot" value={metrics.topModule} accent="#B4451F" hint={metrics.topCount > 0 ? `${metrics.topCount} result${metrics.topCount === 1 ? '' : 's'}` : undefined} small />
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: '16px 20px', marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 220px', minWidth: 180 }}>
          <label style={fieldLabel}>Search</label>
          <input style={inputStyle} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={fieldLabel}>Risk</label>
          <select style={inputStyle} value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
            <option value="">All risk levels</option>
            {RISK_ORDER.map(r => <option key={r} value={r}>{RISK_LABEL[r]}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Weakest module</label>
          <select style={inputStyle} value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
            <option value="">All modules</option>
            {moduleOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label style={fieldLabel}>Recruiter</label>
          <select style={inputStyle} value={recruiterFilter} onChange={e => setRecruiterFilter(e.target.value)}>
            <option value="">All recruiters</option>
            {recruiterOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 120 }}>
          <label style={fieldLabel}>State</label>
          <select style={inputStyle} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="">All states</option>
            {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 130 }}>
          <label style={fieldLabel}>Min score</label>
          <select style={inputStyle} value={String(minScore)} onChange={e => setMinScore(Number(e.target.value))}>
            {[0, 200, 300, 400, 500, 600, 700].map(v => <option key={v} value={v}>{v === 0 ? 'Any' : `${v}+`}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 190 }}>
          <label style={fieldLabel}>Group by</label>
          <select style={inputStyle} value={groupBy} onChange={e => setGroupBy(e.target.value as GroupKey)}>
            {GROUP_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title="Download the current filtered view as a CSV"
          style={{
            background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.3)',
            borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', cursor: filtered.length === 0 ? 'default' : 'pointer',
            opacity: filtered.length === 0 ? 0.4 : 1,
          }}
        >
          ↓ CSV
        </button>
      </div>

      {/* Class segmented control */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <ClassChip label="All classes" active={classFilter === ''} onClick={() => setClassFilter('')} />
        {CLASS_ORDER.map(c => (
          <ClassChip
            key={c}
            label={c.charAt(0) + c.slice(1).toLowerCase()}
            color={CLASS_COLOR[c]}
            active={classFilter === c}
            onClick={() => setClassFilter(classFilter === c ? '' : c)}
          />
        ))}
      </div>

      {/* Active-filter chips */}
      {activeFilters && (
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#6B8299' }}>Active filters:</span>
          {classFilter && <FilterPill label={`Class: ${classFilter.charAt(0) + classFilter.slice(1).toLowerCase()}`} onClear={() => setClassFilter('')} />}
          {riskFilter && <FilterPill label={`Risk: ${RISK_LABEL[riskFilter as Risk]}`} onClear={() => setRiskFilter('')} />}
          {moduleFilter && <FilterPill label={`Module: ${moduleOptions.find(m => m[0] === moduleFilter)?.[1] ?? moduleFilter}`} onClear={() => setModuleFilter('')} />}
          {recruiterFilter && <FilterPill label={`Recruiter: ${recruiterOptions.find(r => r[0] === recruiterFilter)?.[1] ?? recruiterFilter}`} onClear={() => setRecruiterFilter('')} />}
          {stateFilter && <FilterPill label={`State: ${stateFilter}`} onClear={() => setStateFilter('')} />}
          {minScore > 0 && <FilterPill label={`Score ≥ ${minScore}`} onClear={() => setMinScore(0)} />}
          {search.trim() && <FilterPill label={`Search: "${search.trim()}"`} onClear={() => setSearch('')} />}
          <button
            onClick={clearAll}
            style={{ background: 'transparent', border: 'none', color: '#C9A96E', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          >Clear all</button>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#6B8299', marginBottom: 10 }}>
        Showing {filtered.length} of {items.length} result{items.length === 1 ? '' : 's'}
      </div>

      {loading ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#6B8299', fontSize: 13 }}>Loading diagnostics…</div>
      ) : error ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#E08A6B', fontSize: 13 }}>Couldn&apos;t load diagnostics ({error}).</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#6B8299', fontSize: 14 }}>
          No results match the current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: groupBy === 'none' ? 0 : 12 }}>
          {groups.map(g => {
            const isCollapsed = groupBy !== 'none' && collapsed.has(g.key)
            return (
              <div key={g.key} style={{ ...card, overflow: 'hidden' }}>
                {groupBy !== 'none' && (
                  <button
                    onClick={() => toggleGroup(g.key)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 16px', background: '#0F1E33', border: 'none', cursor: 'pointer',
                      borderBottom: isCollapsed ? 'none' : '1px solid rgba(201,169,110,0.08)',
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#6B8299', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{g.label}</span>
                    <span style={{ fontSize: 11, color: '#6B8299' }}>{g.count} result{g.count === 1 ? '' : 's'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>
                      avg {g.avgScore}/{MAX_SCORE}
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {['Name', 'Recruiter', 'Score', 'Class', 'Risk', 'Licensing', 'Weakest module', 'Completed'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map(it => (
                          <ResultRow key={it.id} it={it} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ResultRow({ it }: { it: VaultListItem }) {
  const classColor = CLASS_COLOR[it.overallClass] ?? '#6B8299'
  const pct = Math.max(0, Math.min(1, it.overallScore / MAX_SCORE))
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <td style={{ padding: '10px 14px' }}>
        <Link href={`/vault/diagnostic/${it.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{it.name || '—'}</div>
          <div style={{ fontSize: 11, color: '#6B8299' }}>{it.email || '—'}{it.state ? ` · ${it.state}` : ''}</div>
        </Link>
      </td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>
        {it.recruiterName || it.recruiterCode || '—'}
      </td>
      <td style={{ padding: '10px 14px', minWidth: 130 }}>
        <div style={{ fontSize: 12, color: '#E6EDF5', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{it.overallScore}<span style={{ color: '#6B8299' }}>/{MAX_SCORE}</span></div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: classColor, borderRadius: 3 }} />
        </div>
      </td>
      <td style={{ padding: '10px 14px' }}><ClassPill overallClass={it.overallClass} label={it.overallClassLabel} /></td>
      <td style={{ padding: '10px 14px' }}><RiskPill risk={it.risk} /></td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4', fontVariantNumeric: 'tabular-nums' }}>{it.licensingProbability}%</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#9BB0C4' }}>{it.limitingModuleName || '—'}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B8299', whiteSpace: 'nowrap' }}>
        {it.completedAt ? new Date(it.completedAt).toLocaleDateString() : '—'}
      </td>
    </tr>
  )
}

// ── Grouping helpers ──────────────────────────────────────────────────────
function groupKeyFor(it: VaultListItem, by: GroupKey): string {
  switch (by) {
    case 'class': return it.overallClass
    case 'risk': return it.risk
    case 'module': return it.limitingModule ?? '__none__'
    case 'recruiter': return it.recruiterCode ?? '__none__'
    case 'state': return it.state ?? '__none__'
    default: return '__all__'
  }
}
function groupLabelFor(it: VaultListItem, by: GroupKey): string {
  switch (by) {
    case 'class': return it.overallClassLabel || (it.overallClass.charAt(0) + it.overallClass.slice(1).toLowerCase())
    case 'risk': return RISK_LABEL[it.risk] ?? it.risk
    case 'module': return it.limitingModuleName || 'No weakest module'
    case 'recruiter': return it.recruiterName || it.recruiterCode || 'No recruiter'
    case 'state': return it.state || 'No state'
    default: return ''
  }
}
function groupSortIndex(it: VaultListItem, by: GroupKey): number {
  if (by === 'class') return CLASS_ORDER.indexOf(it.overallClass)
  if (by === 'risk') return RISK_ORDER.indexOf(it.risk)
  return 0
}
function avg(rows: VaultListItem[]): number {
  if (rows.length === 0) return 0
  return Math.round(rows.reduce((s, r) => s + r.overallScore, 0) / rows.length)
}

// ── Presentational pieces ─────────────────────────────────────────────────
function MetricCard({ label, value, accent, hint, small }: { label: string; value: string; accent: string; hint?: string; small?: boolean }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: small ? 18 : 28, fontWeight: 300, color: accent, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6 }}>{hint}</div>}
    </div>
  )
}

function ClassChip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  const c = color ?? '#C9A96E'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: active ? `${c}22` : 'transparent',
        border: `1px solid ${active ? c : 'rgba(255,255,255,0.08)'}`,
        color: active ? c : '#6B8299', cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function ClassPill({ overallClass, label }: { overallClass: OverallClass; label: string }) {
  const c = CLASS_COLOR[overallClass] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {label || (overallClass.charAt(0) + overallClass.slice(1).toLowerCase())}
    </span>
  )
}

function RiskPill({ risk }: { risk: Risk }) {
  const c = RISK_COLOR[risk] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {RISK_LABEL[risk] ?? risk}
    </span>
  )
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.35)',
      fontSize: 11, fontWeight: 600, color: '#E0C088',
    }}>
      {label}
      <button
        onClick={onClear}
        style={{ background: 'transparent', border: 'none', color: '#E0C088', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
        aria-label={`Clear ${label}`}
      >×</button>
    </span>
  )
}
````

### src/app/vault/diagnostic/[id]/page.tsx

````tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// VAULT Success Diagnostic — full per-result report for admin + LCs.

const card: React.CSSProperties = { background: '#132238', border: '1px solid rgba(201,169,110,0.1)', borderRadius: 6 }
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }
const detailLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 5 }

type Risk = 'NEEDS_IMPROVEMENT' | 'MODERATE' | 'ON_TRACK' | 'STRONG'
type OverallClass = 'ENTRY' | 'EMERGING' | 'DEVELOPING' | 'ADVANCED' | 'ELITE'

interface ModuleView { key: string; name: string; pct: number; class: OverallClass }
interface VaultView {
  id: string
  name: string
  state: string | null
  completedAt: string | null
  createdAt: string
  status: string
  version: string | null
  overallScore: number
  overallClass: OverallClass
  overallClassLabel: string
  modules: ModuleView[]
  limitingModule: string | null
  limitingModuleName: string | null
  recommendedFocus: string | null
  email: string | null
  phone: string | null
  company: string | null
  source: string | null
  recruiterCode: string | null
  recruiterName: string | null
  risk: Risk
  probabilities: { licensing: number; retention: number; network: number; leadership: number }
  consistencyIndex: number
  consistencyPenaltyPct: number
  consistencyLabel: string
}

const MAX_SCORE = 800
const CLASS_COLOR: Record<OverallClass, string> = {
  ENTRY: '#B4451F', EMERGING: '#C9862E', DEVELOPING: '#C9A96E', ADVANCED: '#2E7D57', ELITE: '#1F6E4A',
}
const RISK_COLOR: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: '#B4451F', MODERATE: '#C9862E', ON_TRACK: '#3B6EA5', STRONG: '#2E7D57',
}
const RISK_LABEL: Record<Risk, string> = {
  NEEDS_IMPROVEMENT: 'Needs improvement', MODERATE: 'Moderate', ON_TRACK: 'On track', STRONG: 'Strong',
}

export default function VaultDiagnosticDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const [result, setResult] = useState<VaultView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/vault/diagnostic/${id}`)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ result: VaultView }>
      })
      .then(d => setResult(d.result))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [id])

  const backLink = (
    <Link href="/vault/diagnostic" style={{ fontSize: 12, color: '#C9A96E', textDecoration: 'none' }}>
      ← Back to diagnostics
    </Link>
  )

  if (loading) {
    return <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto', color: '#6B8299' }}>{backLink}<div style={{ marginTop: 20 }}>Loading report…</div></div>
  }
  if (error || !result) {
    return <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto', color: '#E08A6B' }}>{backLink}<div style={{ marginTop: 20 }}>Couldn&apos;t load this diagnostic{error ? ` (${error})` : ''}.</div></div>
  }

  const r = result
  const classColor = CLASS_COLOR[r.overallClass] ?? '#6B8299'
  const scorePct = Math.max(0, Math.min(1, r.overallScore / MAX_SCORE))

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto', color: '#E6EDF5' }}>
      <div style={{ marginBottom: 16 }}>{backLink}</div>
      <div style={sectionLabel}>Success Diagnostic</div>

      {/* Header: identity + contact + attribution */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(201,169,110,0.08)' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 300, color: '#ffffff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            {r.name || 'Unnamed respondent'}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: '#9BB0C4' }}>
            {r.email && <span>{r.email}</span>}
            {r.phone && <span>{r.phone}</span>}
            {r.company && <span>{r.company}</span>}
            {r.state && <span>{r.state}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11, color: '#6B8299', marginTop: 8 }}>
            <span>Recruiter: <span style={{ color: '#C9A96E' }}>{r.recruiterName || r.recruiterCode || '—'}</span></span>
            {r.source && <span>Source: {r.source}</span>}
            <span>Completed: {r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}</span>
            {r.version && <span>v{r.version}</span>}
          </div>
        </div>

        {/* Score gauge + class + risk */}
        <div style={{ ...card, padding: '18px 22px', minWidth: 240, flex: '0 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 300, color: classColor, letterSpacing: '-0.03em', lineHeight: 1 }}>{r.overallScore}</span>
            <span style={{ fontSize: 15, color: '#6B8299' }}>/ {MAX_SCORE}</span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', margin: '10px 0 14px' }}>
            <div style={{ width: `${scorePct * 100}%`, height: '100%', background: classColor, borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ClassPill overallClass={r.overallClass} label={r.overallClassLabel} />
            <RiskPill risk={r.risk} />
          </div>
        </div>
      </div>

      {/* Module breakdown */}
      <div style={{ ...card, padding: '18px 22px', marginBottom: 20 }}>
        <div style={sectionLabel}>Module breakdown</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {r.modules.map(m => {
            const c = CLASS_COLOR[m.class] ?? '#C9A96E'
            const isLimiting = m.key === r.limitingModule
            const pct = Math.max(0, Math.min(100, m.pct))
            return (
              <div key={m.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, color: '#E6EDF5', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {m.name}
                    {isLimiting && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B4451F', border: '1px solid rgba(180,69,31,0.5)', background: 'rgba(180,69,31,0.12)', borderRadius: 3, padding: '1px 6px' }}>
                        Limiting
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: c, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 4 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* #1 limiting factor + recommended focus */}
      {(r.limitingModuleName || r.recommendedFocus) && (
        <div style={{ ...card, padding: '18px 22px', marginBottom: 20, borderLeft: '3px solid #B4451F' }}>
          <div style={sectionLabel}>#1 limiting factor</div>
          {r.limitingModuleName && (
            <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', marginBottom: r.recommendedFocus ? 10 : 0 }}>
              {r.limitingModuleName}
            </div>
          )}
          {r.recommendedFocus && (
            <>
              <div style={{ ...detailLabel, marginTop: 4 }}>Recommended focus</div>
              <p style={{ fontSize: 13.5, color: '#C7D3E0', lineHeight: 1.6, margin: 0 }}>{r.recommendedFocus}</p>
            </>
          )}
        </div>
      )}

      {/* Probability meters */}
      <div style={{ ...card, padding: '18px 22px', marginBottom: 20 }}>
        <div style={sectionLabel}>Predicted probabilities</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <ProbabilityMeter label="Licensing" value={r.probabilities.licensing} />
          <ProbabilityMeter label="Retention" value={r.probabilities.retention} />
          <ProbabilityMeter label="Network growth" value={r.probabilities.network} />
          <ProbabilityMeter label="Leadership" value={r.probabilities.leadership} />
        </div>
      </div>

      {/* Consistency / integrity panel */}
      <div style={{ ...card, padding: '18px 22px', marginBottom: 20 }}>
        <div style={sectionLabel}>Consistency &middot; integrity</div>
        <p style={{ fontSize: 12, color: '#6B8299', margin: '0 0 16px', lineHeight: 1.5 }}>
          Internal honesty check. Flags response patterns that look inconsistent or too self-favorable. Not shown to the respondent.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <div style={{ background: '#0F1E33', borderRadius: 6, padding: '14px 16px' }}>
            <div style={detailLabel}>Assessment</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#ffffff' }}>{r.consistencyLabel || '—'}</div>
          </div>
          <div style={{ background: '#0F1E33', borderRadius: 6, padding: '14px 16px' }}>
            <div style={detailLabel}>Consistency index</div>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#C9A96E', fontVariantNumeric: 'tabular-nums' }}>{r.consistencyIndex}</div>
          </div>
          <div style={{ background: '#0F1E33', borderRadius: 6, padding: '14px 16px' }}>
            <div style={detailLabel}>Penalty applied</div>
            <div style={{ fontSize: 22, fontWeight: 300, color: r.consistencyPenaltyPct > 0 ? '#C9862E' : '#9BB0C4', fontVariantNumeric: 'tabular-nums' }}>
              {r.consistencyPenaltyPct > 0 ? '−' : ''}{r.consistencyPenaltyPct}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProbabilityMeter({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  // Traffic-tone the meter by band so a weak likelihood reads immediately.
  const color = pct >= 70 ? '#2E7D57' : pct >= 45 ? '#C9A96E' : pct >= 25 ? '#C9862E' : '#B4451F'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9BB0C4' }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function ClassPill({ overallClass, label }: { overallClass: OverallClass; label: string }) {
  const c = CLASS_COLOR[overallClass] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 11px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {label || (overallClass.charAt(0) + overallClass.slice(1).toLowerCase())}
    </span>
  )
}

function RiskPill({ risk }: { risk: Risk }) {
  const c = RISK_COLOR[risk] ?? '#6B8299'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 11px', borderRadius: 999,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {RISK_LABEL[risk] ?? risk}
    </span>
  )
}
````

### Nav + access wiring (edits to existing files)

Agent portal nav (`src/app/agents/page.tsx`): add a "Diagnostic" link to the
desktop nav and the mobile menu (mirror your portal's nav pattern).
VaultSidebar (`src/components/vault/VaultSidebar.tsx`): add `{ href:'/vault/diagnostic', label:'Diagnostic', icon }` to the admin group and the LC group.
Permissions (`src/lib/permissions.ts`): add `/vault/diagnostic` to the LC allow-list so licensing coordinators are not redirected away.
