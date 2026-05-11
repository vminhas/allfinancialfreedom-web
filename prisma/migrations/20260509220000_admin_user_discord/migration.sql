-- Discord-link the staff users (admins + licensing coordinators) so
-- the bot can DM them on coordinator-relevant events: new business
-- submissions, licensing tickets, agent replies, etc.

ALTER TABLE "admin_users"
  ADD COLUMN "discordUserId"   TEXT,
  ADD COLUMN "discordUsername" TEXT;
