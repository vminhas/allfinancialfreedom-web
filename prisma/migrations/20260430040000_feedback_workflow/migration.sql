-- Feedback workflow: status enum-as-string + agent-visible response.
-- Existing rows default to OPEN; updatedAt gets seeded to createdAt
-- so existing rows have a sensible initial value.
ALTER TABLE "agent_feedback"
  ADD COLUMN "status"           TEXT      NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "responseToAgent"  TEXT,
  ADD COLUMN "reviewedAt"       TIMESTAMP(3),
  ADD COLUMN "closedAt"         TIMESTAMP(3),
  ADD COLUMN "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: anything previously marked read=true gets ACKNOWLEDGED
-- so the new view shows a sensible status for legacy items.
UPDATE "agent_feedback"
   SET "status" = 'ACKNOWLEDGED', "reviewedAt" = "createdAt"
 WHERE "read" = true;
