-- AgentProfile.preferredName lets an agent override their first name
-- in every user-facing render (Discord cards, leaderboards, team
-- directory, welcome-email greeting) without touching their legal
-- first/last name on file. Mirrors the existing partner_display_name
-- / couple_display_name pattern.
--
-- Table name is `agent_profiles` (snake_case, via @@map in schema.prisma),
-- NOT the Prisma model name "AgentProfile". An earlier version of this
-- migration targeted the model name and failed in prod with P3018; if
-- you're resolving that failure, run:
--   prisma migrate resolve --rolled-back 20260514050000_agent_preferred_name
-- against the prod DB before re-deploying.

ALTER TABLE "agent_profiles" ADD COLUMN IF NOT EXISTS "preferred_name" TEXT;
