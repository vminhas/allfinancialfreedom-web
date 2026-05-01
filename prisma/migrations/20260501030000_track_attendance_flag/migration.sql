-- Per-event opt-out of attendance tracking. Default true so existing
-- and newly-parsed events keep landing on the grid; admins flip false
-- for event types like Onboarding Academy / hierarchy calls / guest
-- broadcasts that aren't hosted on the AFF Zoom account.

ALTER TABLE "training_events"
  ADD COLUMN "trackAttendance" BOOLEAN NOT NULL DEFAULT true;
