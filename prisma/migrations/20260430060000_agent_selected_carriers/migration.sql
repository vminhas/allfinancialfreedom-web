-- Lets agents curate which carriers show on their dashboard. Active
-- appointments (PENDING/APPOINTED/JIT) are always visible regardless;
-- this column only affects which NOT_STARTED carriers we hide.
ALTER TABLE "agent_profiles"
  ADD COLUMN "selectedCarriers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
