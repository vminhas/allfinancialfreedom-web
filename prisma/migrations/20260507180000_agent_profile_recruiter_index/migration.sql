-- AgentProfile.recruiterId stores the recruiter's agentCode (not an FK).
-- Production leaderboard's "My Downline" scope walks the tree by joining
-- agent_profiles to itself on recruiterId = agentCode; without this index
-- that walk turns into a sequential scan once we get past a few hundred
-- agents. CONCURRENTLY would be ideal but Prisma's migrate runner doesn't
-- support it inside a migration transaction, and the table is small
-- enough today that a non-concurrent index won't block writes for long.
CREATE INDEX IF NOT EXISTS "agent_profiles_recruiterId_idx" ON "agent_profiles" ("recruiterId");
