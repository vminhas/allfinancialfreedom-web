-- Screenshot attachments on agent feedback. Plain text[] since we never
-- query individual entries; cap of 4 per ticket lives at the API layer.
ALTER TABLE "agent_feedback"
  ADD COLUMN "screenshotUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
