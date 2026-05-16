-- Rebrand the phase-2 "Recruit & Onboard" group to "Business Partner".
-- The bundled defaults in src/lib/agent-constants.ts already carry the
-- new copy, but once the checklist editor has been opened those defaults
-- are seeded into phase_group_definitions / phase_item_definitions and
-- the agent dashboard reads from there instead. This brings any already
-- seeded rows in line. Scoped to the three known keys so unrelated
-- admin customizations are untouched; safe no-op if the rows do not
-- exist yet (defaults will seed with the new copy on first load).

UPDATE "phase_group_definitions"
SET "label" = 'Business Partner',
    "description" = 'Expand your agency with your first 3 business partners.'
WHERE "groupKey" = 'recruits';

UPDATE "phase_item_definitions"
SET "label" = '1st Business Partner',
    "description" = 'Sponsor and onboard your first business partner. Someone you personally recruited who has joined AFF. Building your agency starts here.'
WHERE "itemKey" = 'direct_1';

UPDATE "phase_item_definitions"
SET "label" = '2nd Business Partner',
    "description" = 'Sponsor and onboard your second business partner on your team.'
WHERE "itemKey" = 'direct_2';

UPDATE "phase_item_definitions"
SET "label" = '3rd Business Partner',
    "description" = 'Sponsor and onboard your third business partner. Three actives is the foundation of a growing agency.'
WHERE "itemKey" = 'direct_3';
