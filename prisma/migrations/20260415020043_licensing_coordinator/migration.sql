-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'LICENSING_COORDINATOR');

-- CreateEnum
CREATE TYPE "LicensingRequestTopic" AS ENUM ('SCHEDULE_EXAM', 'PASS_POST_LICENSING', 'FINGERPRINTS_APPLY', 'GFI_APPOINTMENTS', 'CE_COURSES', 'EO_INSURANCE', 'DIRECT_DEPOSIT', 'UNDERWRITING', 'GENERAL');

-- CreateEnum
CREATE TYPE "LicensingRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'ADMIN';

-- CreateTable
CREATE TABLE "coordinator_requests" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "phaseItemKey" TEXT,
    "topic" "LicensingRequestTopic" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "LicensingRequestStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "coordinator_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coordinator_requests_agentProfileId_status_idx" ON "coordinator_requests"("agentProfileId", "status");

-- CreateIndex
CREATE INDEX "coordinator_requests_status_assignedToId_idx" ON "coordinator_requests"("status", "assignedToId");

-- AddForeignKey
ALTER TABLE "coordinator_requests" ADD CONSTRAINT "coordinator_requests_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_requests" ADD CONSTRAINT "coordinator_requests_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Move '3 Business Partners' checklist item from Phase 1 to Phase 2 for all existing agents
UPDATE "phase_items" SET "phase" = 2 WHERE "itemKey" = '3_business_partners';
