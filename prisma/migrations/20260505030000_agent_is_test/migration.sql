-- Mark certain AgentProfile rows as test accounts so they can keep
-- logging in to QA new features without polluting any roster-facing
-- view (admin progression matrix, agent-facing leaderboard, future
-- aggregate dashboards). Default false so every existing row stays
-- production-real.

ALTER TABLE "agent_profiles"
  ADD COLUMN IF NOT EXISTS "is_test" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "agent_profiles_is_test_idx" ON "agent_profiles" ("is_test");
