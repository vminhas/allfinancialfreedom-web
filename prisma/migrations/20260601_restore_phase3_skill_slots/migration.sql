-- Restore slots that were accidentally deleted by the
-- 20260601_remove_phase3_slots migration.

-- 1) "Independently Close 2 Apps or 5,000 Points" — 3 slots, 2 required
--    Match by label pattern since the itemKey is editor-generated.
UPDATE "phase_item_definitions"
SET "slot_required_count" = 2
WHERE "phase" = 3
  AND "label" ILIKE '%close%app%'
  AND "slot_required_count" IS NULL;

INSERT INTO "phase_item_slot_defs" ("id", "phaseItemDefinitionId", "label", "slotType", "sortOrder", "createdAt")
SELECT
  gen_random_uuid()::text,
  d."id",
  s."label",
  s."slotType",
  s."sortOrder",
  now()
FROM "phase_item_definitions" d
CROSS JOIN (VALUES
  ('Field Appointment 1', 'field_appointment', 0),
  ('Field Appointment 2', 'field_appointment', 1),
  ('5,000 Point Application', 'field_appointment', 2)
) AS s("label", "slotType", "sortOrder")
WHERE d."phase" = 3
  AND d."label" ILIKE '%close%app%'
  AND NOT EXISTS (
    SELECT 1 FROM "phase_item_slot_defs" ex
    WHERE ex."phaseItemDefinitionId" = d."id"
  );

-- 2) "Independently Onboard 2 Business Partners" — 2 slots, all required
INSERT INTO "phase_item_slot_defs" ("id", "phaseItemDefinitionId", "label", "slotType", "sortOrder", "createdAt")
SELECT
  gen_random_uuid()::text,
  d."id",
  s."label",
  s."slotType",
  s."sortOrder",
  now()
FROM "phase_item_definitions" d
CROSS JOIN (VALUES
  ('Business Partner 1', 'business_partner', 0),
  ('Business Partner 2', 'business_partner', 1)
) AS s("label", "slotType", "sortOrder")
WHERE d."phase" = 3
  AND d."label" ILIKE '%onboard%business partner%'
  AND NOT EXISTS (
    SELECT 1 FROM "phase_item_slot_defs" ex
    WHERE ex."phaseItemDefinitionId" = d."id"
  );
