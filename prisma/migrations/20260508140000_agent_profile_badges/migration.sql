-- Add badges array to AgentProfile, backfill 'CFT' for every active
-- Phase 3+ agent. Under the old data model Phase 3 = "Certified Field
-- Trainer", so anyone at Phase 3 or higher had necessarily earned the
-- CFT designation. Going forward Phase 3 is renamed to "Senior
-- Associate" and CFT becomes a separate, admin-managed badge that
-- recomputes when the four Phase-3 signoff items (cft_classes,
-- cft_trainer_signoff, cft_coordinator_signoff, emd_signoff) toggle.

ALTER TABLE "agent_profiles"
    ADD COLUMN "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: mark every active Phase 3+ agent as CFT. Preserves the
-- existing "CFT-ness" of the roster across the rename.
UPDATE "agent_profiles"
   SET "badges" = ARRAY['CFT']
 WHERE "phase" >= 3
   AND "status" = 'ACTIVE'
   AND NOT ('CFT' = ANY ("badges"));
