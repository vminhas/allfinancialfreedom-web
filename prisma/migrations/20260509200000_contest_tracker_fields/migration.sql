-- Live tracker embed in Discord. discordChannelId is where the
-- leaderboard-style status embed lives; discordTrackerMessageId is
-- the message the bot owns and edits in place on every sync, so
-- the channel stays clean and the embed always reflects current
-- progress.

ALTER TABLE "contests"
  ADD COLUMN "discordChannelId"        TEXT,
  ADD COLUMN "discordTrackerMessageId" TEXT;
