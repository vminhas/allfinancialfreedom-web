-- CreateEnum
CREATE TYPE "RenewalStage" AS ENUM ('SIXTY_DAYS', 'THIRTY_DAYS', 'SEVEN_DAYS');

-- CreateTable
CREATE TABLE "renewal_reminders" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "stage" "RenewalStage" NOT NULL,
    "anniversaryYear" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentByAdminId" TEXT,

    CONSTRAINT "renewal_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "renewal_reminders_submissionId_idx" ON "renewal_reminders"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "renewal_reminders_submissionId_stage_anniversaryYear_key" ON "renewal_reminders"("submissionId", "stage", "anniversaryYear");

-- AddForeignKey
ALTER TABLE "renewal_reminders" ADD CONSTRAINT "renewal_reminders_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "new_business_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_reminders" ADD CONSTRAINT "renewal_reminders_sentByAdminId_fkey" FOREIGN KEY ("sentByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
