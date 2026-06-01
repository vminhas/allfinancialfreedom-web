UPDATE "phase_item_definitions"
SET "actionJson" = '{"type":"navigate-tab","tab":"pfr","label":"Open PFR"}',
    "updatedAt" = now()
WHERE "itemKey" = 'pfr'
  AND "actionJson" IS NULL;
