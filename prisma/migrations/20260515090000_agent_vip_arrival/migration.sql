-- One-off "red carpet" for a single distinguished guest. Drives an
-- "Announce VIP Arrival" button on the agent's tracker profile and a
-- one-time gold welcome modal on their first portal sign-in. Both
-- retire the moment the flag is flipped back off.

ALTER TABLE "agent_profiles"
  ADD COLUMN IF NOT EXISTS "vip_arrival" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vip_arrival_title" TEXT;
