-- Threaded notes on AgentFeedback. Replaces the "single
-- responseToAgent + single adminNotes" pattern with a real ticket
-- conversation. Both columns on agent_feedback stay populated so
-- legacy code paths keep working through the transition; this
-- migration also seeds them as the first notes on each ticket so
-- the UI doesn't lose history.

CREATE TABLE IF NOT EXISTS "agent_feedback_notes" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "authorAdminId" TEXT,
  "authorAgentProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_feedback_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_feedback_notes_feedbackId_createdAt_idx"
  ON "agent_feedback_notes"("feedbackId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_feedback_notes_feedbackId_fkey'
  ) THEN
    ALTER TABLE "agent_feedback_notes"
      ADD CONSTRAINT "agent_feedback_notes_feedbackId_fkey"
      FOREIGN KEY ("feedbackId") REFERENCES "agent_feedback"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_feedback_notes_authorAdminId_fkey'
  ) THEN
    ALTER TABLE "agent_feedback_notes"
      ADD CONSTRAINT "agent_feedback_notes_authorAdminId_fkey"
      FOREIGN KEY ("authorAdminId") REFERENCES "admin_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_feedback_notes_authorAgentProfileId_fkey'
  ) THEN
    ALTER TABLE "agent_feedback_notes"
      ADD CONSTRAINT "agent_feedback_notes_authorAgentProfileId_fkey"
      FOREIGN KEY ("authorAgentProfileId") REFERENCES "agent_profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- One-shot seed: every existing AgentFeedback with a populated
-- responseToAgent gets a visible note; same for adminNotes (internal).
-- Deterministic IDs so re-running the migration is a no-op.
INSERT INTO "agent_feedback_notes" ("id", "feedbackId", "body", "isInternal", "createdAt")
SELECT
  'fbn_seed_resp_' || "id",
  "id",
  "responseToAgent",
  false,
  COALESCE("reviewedAt", "updatedAt", "createdAt")
FROM "agent_feedback"
WHERE "responseToAgent" IS NOT NULL AND length(trim("responseToAgent")) > 0
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "agent_feedback_notes" ("id", "feedbackId", "body", "isInternal", "createdAt")
SELECT
  'fbn_seed_admin_' || "id",
  "id",
  "adminNotes",
  true,
  COALESCE("reviewedAt", "updatedAt", "createdAt")
FROM "agent_feedback"
WHERE "adminNotes" IS NOT NULL AND length(trim("adminNotes")) > 0
ON CONFLICT ("id") DO NOTHING;
