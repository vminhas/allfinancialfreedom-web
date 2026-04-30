-- Schedule announcements ahead of time. Null = "live now" (legacy
-- behavior); a future timestamp means the announcement won't appear
-- to agents until that moment passes. Agent GET endpoint filters
-- where scheduledFor > now so scheduled rows stay invisible until
-- their start time.
ALTER TABLE "announcements" ADD COLUMN "scheduledFor" TIMESTAMP(3);
