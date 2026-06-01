-- Clear actionJson for items that used navigate-tab actions (frontend navigation,
-- not admin-controlled). These were seeded from constants and are no longer needed.
UPDATE "phase_item_definitions"
SET "actionJson" = NULL
WHERE "actionJson" LIKE '%navigate-tab%';
