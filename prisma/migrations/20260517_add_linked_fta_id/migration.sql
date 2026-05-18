ALTER TABLE "phase_items" ADD COLUMN IF NOT EXISTS "linkedFtaId" TEXT REFERENCES "field_training_appointments"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "phase_items_linkedFtaId_idx" ON "phase_items"("linkedFtaId");
