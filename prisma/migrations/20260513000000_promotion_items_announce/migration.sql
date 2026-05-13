-- Phase-item promotion definitions for every rank above Associate, plus
-- a backfill that flips post_to_announcements=true on every rank gate so
-- the milestone broadcasts to #announcements without any admin having to
-- remember to tick a per-item toggle. The phase-item-announce helper
-- also force-broadcasts these keys regardless of the DB flag (see
-- ALWAYS_ANNOUNCE in src/lib/phase-item-announce.ts), so this migration
-- is belt-and-suspenders for the editor UI and any future auditor who
-- reads the table.
--
-- Column-name reminder for future editors: most PhaseItemDefinition
-- columns ship as quoted camelCase identifiers (no Prisma @map), while
-- the three notification flags use snake_case via @map. So the lookup
-- column is "itemKey" but the flag column is "post_to_announcements".
-- The prior version of this migration referenced "item_key" and the
-- production deploy errored on E42703. Don't regress.

-- 1. Backfill the announce flag for every rank-gating item. WHERE
--    filters by itemKey so we don't accidentally update unrelated rows
--    if a future itemKey collides.
UPDATE "phase_item_definitions"
   SET "post_to_announcements" = true
 WHERE "itemKey" IN (
   'associate_promotion',
   'md_promotion',
   'emd_promotion',
   'nvp_promotion',
   'emd_signoff',
   'first_1000'
 );

-- 2. Seed the three new rank promotion definitions. ON CONFLICT keeps
--    this migration idempotent and lets the admin checklist editor own
--    any field updates an admin makes later (we only re-assert the
--    announce flag on conflict). Hardcoded ids are stable so re-runs
--    don't duplicate; the schema's @default(cuid()) only applies when
--    the application creates the row, raw INSERT must supply one.
INSERT INTO "phase_item_definitions" (
  "id", "phase", "itemKey", "label", "description",
  "groupKey", "sortOrder", "adminOnly", "actionJson",
  "post_to_activity", "ping_admin", "post_to_announcements",
  "videos", "createdAt", "updatedAt"
) VALUES
  (
    'def_md_promotion', 4, 'md_promotion',
    'Marketing Director Promotion',
    'Officially promoted to Marketing Director. Recognizes you hit 45,000 production points and built a team of 5 net licensed agents.',
    'milestones', 999, true,
    '{"type":"inline-form","modal":"promotion-request","label":"Request Promotion"}',
    true, false, true,
    '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'def_emd_promotion', 5, 'emd_promotion',
    'Executive Marketing Director Promotion',
    'Officially promoted to Executive Marketing Director. Recognizes 150,000 net production points over 6 months, an EMD-sized organization, and at least one MD on your team.',
    'milestones', 999, true,
    '{"type":"inline-form","modal":"promotion-request","label":"Request Promotion"}',
    true, false, true,
    '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'def_nvp_promotion', 6, 'nvp_promotion',
    'National Vice President Promotion',
    'Officially promoted to National Vice President, the pinnacle of the AFF career path. Gated by Vick.',
    'milestones', 999, true,
    '{"type":"inline-form","modal":"promotion-request","label":"Request Promotion"}',
    true, false, true,
    '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("itemKey") DO UPDATE
   SET "post_to_announcements" = true;
