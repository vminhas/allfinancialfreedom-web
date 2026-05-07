-- Add a nullable FK from a phase item completion to the agent who
-- fulfilled it (only meaningful for the direct_1/2/3 "Recruit & Onboard
-- Your Nth Agent" items). Lets recruiters claim an existing AFF agent
-- as their recruit so the milestone has data integrity and the team
-- view shows the right downline structure.

ALTER TABLE "phase_items"
  ADD COLUMN IF NOT EXISTS "linkedAgentProfileId" TEXT;

CREATE INDEX IF NOT EXISTS "phase_items_linkedAgentProfileId_idx"
  ON "phase_items"("linkedAgentProfileId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'phase_items_linkedAgentProfileId_fkey'
  ) THEN
    ALTER TABLE "phase_items"
      ADD CONSTRAINT "phase_items_linkedAgentProfileId_fkey"
      FOREIGN KEY ("linkedAgentProfileId") REFERENCES "agent_profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
