-- Each FTA optionally links to the BusinessPartner (FTA contact) it
-- was scheduled with, so the agent can pick from their imported book
-- when creating the appointment and the Phase 2 checklist can show
-- which contact filled each fta_N slot.

ALTER TABLE "field_training_appointments"
  ADD COLUMN "businessPartnerId" TEXT;

ALTER TABLE "field_training_appointments"
  ADD CONSTRAINT "field_training_appointments_businessPartnerId_fkey"
  FOREIGN KEY ("businessPartnerId") REFERENCES "business_partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "field_training_appointments_businessPartnerId_idx"
  ON "field_training_appointments" ("businessPartnerId");
