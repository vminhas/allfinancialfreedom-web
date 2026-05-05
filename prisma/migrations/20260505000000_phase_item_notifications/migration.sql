-- Add per-item Discord notification toggles to phase_item_definitions.
-- post_to_activity defaults to true so existing items immediately start
-- producing the agent-activity feed once the route is wired up; the other
-- two flags default to false (opt-in for milestone broadcasts and admin
-- pings).

ALTER TABLE "phase_item_definitions"
  ADD COLUMN "post_to_activity" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ping_admin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "post_to_announcements" BOOLEAN NOT NULL DEFAULT false;
