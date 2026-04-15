-- CreateEnum
CREATE TYPE "TrainingStreamType" AS ENUM ('GFI_LIVE', 'ZOOM');

-- CreateTable
CREATE TABLE "training_events" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL DEFAULT 0,
    "driveFileName" TEXT NOT NULL,
    "driveModifiedTime" TIMESTAMP(3) NOT NULL,
    "driveThumbnailUrl" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "category" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "presenters" JSONB NOT NULL,
    "streamType" "TrainingStreamType" NOT NULL DEFAULT 'GFI_LIVE',
    "streamRoomName" TEXT,
    "streamId" TEXT,
    "passcode" TEXT,
    "audienceRestriction" TEXT,
    "partnerBrand" TEXT,
    "targetRegion" TEXT,
    "discordEventId" TEXT,
    "discordEventCreatedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parseError" TEXT,
    "rawParseJson" JSONB,
    "modelId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_events_startsAt_idx" ON "training_events"("startsAt");

-- CreateIndex
CREATE INDEX "training_events_reminderSentAt_idx" ON "training_events"("reminderSentAt");

-- CreateIndex
CREATE UNIQUE INDEX "training_events_driveFileId_eventIndex_key" ON "training_events"("driveFileId", "eventIndex");
