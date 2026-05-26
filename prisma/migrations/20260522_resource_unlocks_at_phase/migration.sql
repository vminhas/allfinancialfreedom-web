-- Phase-gated resource unlocks. Each setup_resource now has a
-- minimum AgentProfile.phase needed to unlock it. Default 1 means
-- "available to everyone" so this rollout is non-breaking; the
-- admin opts each resource into a higher gate as desired from
-- /vault/setup.

ALTER TABLE "setup_resources"
  ADD COLUMN IF NOT EXISTS "unlocks_at_phase" INTEGER NOT NULL DEFAULT 1;
