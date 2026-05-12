-- Client-touchpoint reminder system: agents toggle on
-- birthday / 30-day thank-you / 1-year review reminders for their
-- book of clients. A daily cron scans + fires the due ones; the
-- fire log keeps us from re-firing.

ALTER TABLE "agent_profiles"
  ADD COLUMN "client_reminder_prefs" JSONB;

CREATE TABLE "client_reminder_fires" (
  "id"              TEXT NOT NULL,
  "agentProfileId"  TEXT NOT NULL,
  "submissionId"    TEXT,
  "kind"            TEXT NOT NULL,
  "periodKey"       TEXT NOT NULL,
  "firedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_reminder_fires_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_reminder_fires_agentProfileId_fkey"
    FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "client_reminder_fires_unique"
  ON "client_reminder_fires"("agentProfileId", "submissionId", "kind", "periodKey");

CREATE INDEX "client_reminder_fires_agent_fired_idx"
  ON "client_reminder_fires"("agentProfileId", "firedAt");
