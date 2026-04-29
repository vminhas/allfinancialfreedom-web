-- Add lifecycle status + last-contact tracking to BusinessPartner.
-- Existing rows that already have a category get backfilled to NEW;
-- rows without a category go to PENDING (the queue) so the agent can
-- classify them in the new flow.
ALTER TABLE "business_partners"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "lastContactAt" TIMESTAMP(3);

UPDATE "business_partners"
SET "status" = 'NEW'
WHERE "category" IS NOT NULL AND "category" <> '';

UPDATE "business_partners"
SET "status" = 'INTRO_SENT'
WHERE "introSentAt" IS NOT NULL;

UPDATE "business_partners"
SET "status" = 'BOOKED'
WHERE "bookedAppt" = true;

CREATE INDEX "business_partners_agentProfileId_status_idx"
  ON "business_partners" ("agentProfileId", "status");
