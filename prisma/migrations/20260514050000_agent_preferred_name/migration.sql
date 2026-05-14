-- AgentProfile.preferredName lets an agent override their first name
-- in every user-facing render (Discord cards, leaderboards, team
-- directory, welcome-email greeting) without touching their legal
-- first/last name on file. Mirrors the existing partner_display_name
-- / couple_display_name pattern.

ALTER TABLE "AgentProfile" ADD COLUMN "preferred_name" TEXT;
