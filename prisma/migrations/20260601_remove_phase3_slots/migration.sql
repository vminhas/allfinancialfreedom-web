-- Phase 3 items had slot definitions added accidentally, which disables
-- the manual checkbox toggle. Remove fulfillments first (FK), then slots.
DELETE FROM "agent_slot_fulfillments"
WHERE "slotDefId" IN (
  SELECT s."id"
  FROM "phase_item_slot_defs" s
  JOIN "phase_item_definitions" d ON s."phaseItemDefinitionId" = d."id"
  WHERE d."phase" = 3
);

DELETE FROM "phase_item_slot_defs"
WHERE "phaseItemDefinitionId" IN (
  SELECT "id" FROM "phase_item_definitions" WHERE "phase" = 3
);
