-- Auto-tracked attendance for ZOOM-streamed trainings. The Zoom API
-- gives us per-meeting participants; the sync writes one row per
-- active agent per event, defaulting to ABSENT and flipping to
-- PRESENT for anyone we matched in the participant report.

CREATE TYPE "TrainingAttendanceStatus" AS ENUM (
  'PRESENT',
  'ABSENT',
  'EXCUSED',
  'NOT_TRACKING',
  'NOT_JOINED_YET'
);

-- Track when each TrainingEvent was last synced from Zoom so the
-- hourly cron can skip events it already pulled and only revisit
-- recent ones for late stragglers.
ALTER TABLE "training_events"
  ADD COLUMN "attendanceSyncedAt" TIMESTAMP(3);

-- One row per (event, agent). Manual override is split out so we can
-- preserve the auto-computed status as a base layer; the grid renders
-- manualStatus when set and falls back to status otherwise.
CREATE TABLE "training_attendances" (
  "id"               TEXT NOT NULL,
  "trainingEventId"  TEXT NOT NULL,
  "agentProfileId"   TEXT NOT NULL,

  "status"           "TrainingAttendanceStatus" NOT NULL,
  "manualStatus"     "TrainingAttendanceStatus",
  "manualNote"       TEXT,

  "zoomDisplayName"  TEXT,
  "zoomEmail"        TEXT,
  "zoomUserId"       TEXT,
  "joinedAt"         TIMESTAMP(3),
  "leftAt"           TIMESTAMP(3),
  "durationSeconds"  INTEGER,

  "source"           TEXT NOT NULL DEFAULT 'zoom',
  "syncedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "training_attendances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_attendances_trainingEventId_agentProfileId_key"
  ON "training_attendances" ("trainingEventId", "agentProfileId");

CREATE INDEX "training_attendances_trainingEventId_status_idx"
  ON "training_attendances" ("trainingEventId", "status");

CREATE INDEX "training_attendances_agentProfileId_status_idx"
  ON "training_attendances" ("agentProfileId", "status");

ALTER TABLE "training_attendances"
  ADD CONSTRAINT "training_attendances_trainingEventId_fkey"
  FOREIGN KEY ("trainingEventId") REFERENCES "training_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_attendances"
  ADD CONSTRAINT "training_attendances_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Zoom participants the matcher couldn't resolve to an AgentProfile.
-- Admin queue handles these; once resolved we also write the real
-- attendance row and stamp resolvedAt here.
CREATE TABLE "training_attendance_orphans" (
  "id"               TEXT NOT NULL,
  "trainingEventId"  TEXT NOT NULL,

  "zoomDisplayName"  TEXT NOT NULL,
  "zoomEmail"        TEXT,
  "zoomUserId"       TEXT,
  "joinedAt"         TIMESTAMP(3) NOT NULL,
  "durationSeconds"  INTEGER NOT NULL,

  "resolvedAgentId"  TEXT,
  "resolvedAt"       TIMESTAMP(3),

  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "training_attendance_orphans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_attendance_orphans_trainingEventId_idx"
  ON "training_attendance_orphans" ("trainingEventId");

CREATE INDEX "training_attendance_orphans_resolvedAt_idx"
  ON "training_attendance_orphans" ("resolvedAt");

ALTER TABLE "training_attendance_orphans"
  ADD CONSTRAINT "training_attendance_orphans_trainingEventId_fkey"
  FOREIGN KEY ("trainingEventId") REFERENCES "training_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_attendance_orphans"
  ADD CONSTRAINT "training_attendance_orphans_resolvedAgentId_fkey"
  FOREIGN KEY ("resolvedAgentId") REFERENCES "agent_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
