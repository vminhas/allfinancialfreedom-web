-- AlterTable
ALTER TABLE "training_events" ADD COLUMN     "flyerImageUrl" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "driveFileId" DROP NOT NULL,
ALTER COLUMN "driveFileName" DROP NOT NULL,
ALTER COLUMN "driveModifiedTime" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "training_events_published_startsAt_idx" ON "training_events"("published", "startsAt");
