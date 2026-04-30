-- FTAs need a real lifecycle so the agent dashboard can show only
-- COMPLETED appointments toward their "Field Training N" progress
-- and let them flip status as the world changes (reschedule,
-- cancellation, no-show, completion).

CREATE TYPE "FtaStatus" AS ENUM (
  'SCHEDULED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED', 'NO_SHOW'
);

ALTER TABLE "field_training_appointments"
  ADD COLUMN "status"       "FtaStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "outcomeNotes" TEXT,
  ADD COLUMN "originalDate" TIMESTAMP(3),
  ADD COLUMN "completedAt"  TIMESTAMP(3),
  ADD COLUMN "cancelledAt"  TIMESTAMP(3);

CREATE INDEX "field_training_appointments_agentProfileId_status_idx"
  ON "field_training_appointments" ("agentProfileId", "status");
