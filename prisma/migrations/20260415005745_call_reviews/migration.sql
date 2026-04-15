-- CreateEnum
CREATE TYPE "CallTranscriptSource" AS ENUM ('MANUAL_PASTE', 'FATHOM_OAUTH', 'FATHOM_MANUAL');

-- AlterTable
ALTER TABLE "call_logs" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "transcriptSource" "CallTranscriptSource",
ADD COLUMN     "transcriptText" TEXT;

-- CreateTable
CREATE TABLE "call_reviews" (
    "id" TEXT NOT NULL,
    "callLogId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "rubricScores" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "coachingTips" JSONB NOT NULL,
    "nextSteps" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "flaggedForCoaching" BOOLEAN NOT NULL DEFAULT false,
    "adminNotes" TEXT,
    "discussedAt" TIMESTAMP(3),
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreateTokens" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_reviews_callLogId_key" ON "call_reviews"("callLogId");

-- CreateIndex
CREATE INDEX "call_reviews_agentProfileId_reviewedAt_idx" ON "call_reviews"("agentProfileId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "call_reviews" ADD CONSTRAINT "call_reviews_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_reviews" ADD CONSTRAINT "call_reviews_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
