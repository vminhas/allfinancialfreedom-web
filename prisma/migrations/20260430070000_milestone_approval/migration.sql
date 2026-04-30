-- Adds approval workflow to RecognitionMilestone. Existing rows
-- become AWARDED (status default) so the badges agents see today
-- don't blink off after deploy.

CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING_REVIEW', 'AWARDED', 'REJECTED');

ALTER TABLE "recognition_milestones"
  ADD COLUMN "status"          "MilestoneStatus" NOT NULL DEFAULT 'AWARDED',
  ADD COLUMN "requestedAt"     TIMESTAMP(3),
  ADD COLUMN "requestNote"     TEXT,
  ADD COLUMN "reviewedAt"      TIMESTAMP(3),
  ADD COLUMN "reviewerAdminId" TEXT,
  ADD COLUMN "reviewNote"      TEXT;

CREATE INDEX "recognition_milestones_status_idx"
  ON "recognition_milestones" ("status");

ALTER TABLE "recognition_milestones"
  ADD CONSTRAINT "recognition_milestones_reviewerAdminId_fkey"
  FOREIGN KEY ("reviewerAdminId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every active agent currently at phase >= 4 gets the
-- elite_trainer milestone marked AWARDED so we don't strip badges
-- from people who already qualified under the old auto-rule.
INSERT INTO "recognition_milestones" ("id", "agentProfileId", "milestone", "status", "completedAt")
SELECT
  'mfill_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20),
  id,
  'elite_trainer',
  'AWARDED',
  COALESCE("phaseStartedAt", "createdAt")
FROM "agent_profiles"
WHERE "phase" >= 4 AND "status" = 'ACTIVE'
ON CONFLICT ("agentProfileId", "milestone") DO NOTHING;
