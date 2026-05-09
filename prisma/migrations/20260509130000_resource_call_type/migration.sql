-- Converge call coaching scripts into the existing Resource Center
-- (SetupResource) instead of a separate CallScript model. Admins
-- already manage Canva / Drive / Slides links there; tagging a
-- resource with a CallType lets the AI analyzer pick "the AFF script
-- for this call's type" without duplicating content.
--
-- Drops the CallScript table seeded last commit. No production data
-- has been entered into call_scripts yet (only placeholder rows).

ALTER TABLE "setup_resources"
  ADD COLUMN "callType"           "CallType",
  ADD COLUMN "rawScriptContent"   TEXT,
  ADD COLUMN "aiScriptOutline"    TEXT,
  ADD COLUMN "outlineGeneratedAt" TIMESTAMP(3);

CREATE INDEX "setup_resources_callType_idx"
  ON "setup_resources"("callType");

DROP TABLE IF EXISTS "call_scripts";
