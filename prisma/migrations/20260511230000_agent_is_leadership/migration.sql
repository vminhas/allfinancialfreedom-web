-- isLeadership marks AFF founders / executives (Vick, Melinee) who
-- have AgentProfiles but operate as staff. Hides them from the
-- production leaderboard; bundles their recruits into a single
-- 'Vick & Melinee' synthetic row on the recruits leaderboard.

ALTER TABLE "agent_profiles"
  ADD COLUMN "is_leadership" BOOLEAN NOT NULL DEFAULT false;
