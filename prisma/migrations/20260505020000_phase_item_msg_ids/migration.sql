-- Track Discord message IDs for the activity-channel and announcements
-- posts so we can delete those messages when an agent un-checks the
-- corresponding phase item. Without this we can post on completion but
-- have no way to retract on uncheck. Both columns are nullable: items
-- whose definition has notifications disabled never get an ID, and
-- legacy completions from before this column existed stay null too.

ALTER TABLE "phase_items"
  ADD COLUMN IF NOT EXISTS "activityMsgId"      TEXT,
  ADD COLUMN IF NOT EXISTS "announcementMsgId"  TEXT;
