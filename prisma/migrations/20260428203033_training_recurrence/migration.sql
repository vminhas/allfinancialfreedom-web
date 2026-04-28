-- AlterTable
ALTER TABLE "training_events" ADD COLUMN "recurrenceParentId" TEXT;
ALTER TABLE "training_events" ADD COLUMN "recurrenceFrequency" TEXT;

-- CreateIndex
CREATE INDEX "training_events_recurrenceParentId_idx" ON "training_events"("recurrenceParentId");

-- AddForeignKey
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_recurrenceParentId_fkey" FOREIGN KEY ("recurrenceParentId") REFERENCES "training_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
