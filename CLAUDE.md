# Project conventions for AI assistants

## Writing style

- **Never use em-dashes (`—`) in user-visible text**: emails, page copy,
  modal text, labels, button text, error messages, Discord notifications.
  Use commas, colons, periods, parentheses, or `&middot;` (`·`) instead.
  This is non-negotiable. The CEO does not want them.
- The `—` glyph IS still acceptable as an empty-cell placeholder in
  tabular data (e.g. `state ?? '—'` in a table cell). That's a UI pattern,
  not prose.
- Code comments may use em-dashes if it improves readability of internal
  notes. They aren't user-facing.

## Branding

- Brand name: **All Financial Freedom**, abbreviated **AFF**.
- Operations contact (Natalia) and Onboarding Host (Melinee, COO) are
  configurable in `/vault/settings`. Do not hardcode their names.
- Vick Minhas is CEO. The CEO intro email comes from
  `vick@allfinancialfreedom.com`.

## Stack

- Next.js 16 App Router, Prisma 7.7 with PrismaPg adapter, Neon Postgres.
- `db.prisma` operations from `@/lib/db`. Prisma client is generated to
  `src/generated/prisma`.
- Auth: NextAuth.js. A single `authOptions` config in `@/lib/auth`
  issues sessions for all three roles (admin, licensing_coordinator,
  agent) via separate CredentialsProviders + Google OAuth. Both
  `/api/auth/[...nextauth]` and `/api/agent-auth/[...nextauth]` mount
  the same `authOptions`. Server-side: `getServerSession(authOptions)`
  and gate on `session.user.role`. There is no separate
  `agentAuthOptions` — that legacy config existed but was never wired
  up and was deleted; do not reintroduce it.

## Data model rules

- `BusinessPartner.category` is the only field that distinguishes a contact
  as a Business Partner Prospect, FTA Contact, etc. Null = "in queue, not
  yet classified."
- Contact-import flow: imported contact lands with `category = null` and
  `source = 'csv_import'`. Classifying it sets the category and removes
  it from the queue.
- An agent's downline is computed from `AgentProfile.recruiterId` (which
  stores the recruiter's `agentCode`, not the recruiter's database id).

## Mobile / iOS

- Any sticky-or-fixed bar at `top: 0` MUST include
  `paddingTop: 'calc(<intended-top-padding> + env(safe-area-inset-top))'`,
  otherwise on iPhone the status bar / battery indicator overlaps the
  header content (logo, "Back to portal" button, etc.) and the buttons
  become unclickable. The global `nav { ... }` rule in `globals.css`
  only covers `<nav>` elements, not page-level `<div>` headers like the
  ones in `/agents/*` and other custom shells. The CEO has reported this
  bug repeatedly: do not regress it.
- `VaultSidebar.tsx` is the reference implementation for a mobile top
  bar that handles the inset correctly.

## Migrations

- All schema changes need a Prisma migration in `prisma/migrations/<ts>_<name>/migration.sql`.
- Production Vercel build runs `prisma migrate deploy` (only on
  production, see `scripts/build.mjs`). Preview deploys skip it to avoid
  advisory-lock contention.
