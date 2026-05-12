-- Power-couple pairing for AgentProfiles.
--
-- Two flavors:
--   1. Two-sided: both partners have AgentProfiles. Each points
--      to the other via partner_agent_profile_id. Leaderboard
--      coalesces their stats into one row.
--   2. One-sided: partner is admin-only (no AgentProfile). Set
--      partner_display_name + couple_display_name on the licensed
--      agent's row.
--
-- couple_avatar_url is an optional joint photo (Joey & Jen-style
-- two-person headshot) used by the leaderboard embeds.

ALTER TABLE "agent_profiles"
  ADD COLUMN "partner_agent_profile_id" TEXT,
  ADD COLUMN "partner_display_name"     TEXT,
  ADD COLUMN "couple_display_name"      TEXT,
  ADD COLUMN "couple_avatar_url"        TEXT;
