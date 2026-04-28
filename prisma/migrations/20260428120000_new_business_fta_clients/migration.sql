-- CreateEnum
CREATE TYPE "NewBusinessStatus" AS ENUM ('PENDING', 'ISSUED', 'DECLINED', 'LAPSED', 'NOT_TAKEN');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('TERM', 'WHOLE_LIFE', 'IUL', 'ANNUITY', 'DISABILITY', 'LTC', 'OTHER');

-- CreateEnum
CREATE TYPE "NoteAuthorType" AS ENUM ('AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "FtaCategory" AS ENUM ('UNDER_50', 'FIFTY_PLUS', 'FIFTY_NINE_HALF_PLUS', 'JUST_RETIRED', 'TRANSITIONING_JOBS', 'RECEIVED_INHERITANCE');

-- CreateTable
CREATE TABLE "new_business_submissions" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "applicationDate" TIMESTAMP(3) NOT NULL,
    "carrier" TEXT NOT NULL,
    "policyType" "PolicyType" NOT NULL,
    "points" DOUBLE PRECISION,
    "splitWithAgentId" TEXT,
    "illustrationUrls" TEXT[],
    "clientFirstName" TEXT NOT NULL,
    "clientLastName" TEXT NOT NULL,
    "clientPhone" TEXT,
    "clientEmail" TEXT,
    "clientBirthday" TIMESTAMP(3),
    "clientAddressLine1" TEXT,
    "clientAddressLine2" TEXT,
    "clientCity" TEXT,
    "clientState" TEXT,
    "clientZip" TEXT,
    "status" "NewBusinessStatus" NOT NULL DEFAULT 'PENDING',
    "issuedDate" TIMESTAMP(3),
    "policyNumber" TEXT,
    "declinedReason" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "new_business_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "new_business_notes" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorType" "NoteAuthorType" NOT NULL,
    "authorAgentId" TEXT,
    "authorAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "new_business_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_training_appointments" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "timeZone" TEXT,
    "age" INTEGER,
    "married" BOOLEAN,
    "children" INTEGER,
    "homeowner" BOOLEAN,
    "occupation60kPlus" BOOLEAN,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "category" "FtaCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_training_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "new_business_submissions_agentProfileId_status_idx" ON "new_business_submissions"("agentProfileId", "status");

-- CreateIndex
CREATE INDEX "new_business_submissions_status_createdAt_idx" ON "new_business_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "new_business_submissions_clientLastName_clientFirstName_idx" ON "new_business_submissions"("clientLastName", "clientFirstName");

-- CreateIndex
CREATE INDEX "new_business_notes_submissionId_createdAt_idx" ON "new_business_notes"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "field_training_appointments_agentProfileId_appointmentDate_idx" ON "field_training_appointments"("agentProfileId", "appointmentDate");

-- AddForeignKey
ALTER TABLE "new_business_submissions" ADD CONSTRAINT "new_business_submissions_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "new_business_submissions" ADD CONSTRAINT "new_business_submissions_splitWithAgentId_fkey" FOREIGN KEY ("splitWithAgentId") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "new_business_submissions" ADD CONSTRAINT "new_business_submissions_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "new_business_notes" ADD CONSTRAINT "new_business_notes_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "new_business_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "new_business_notes" ADD CONSTRAINT "new_business_notes_authorAgentId_fkey" FOREIGN KEY ("authorAgentId") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "new_business_notes" ADD CONSTRAINT "new_business_notes_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_training_appointments" ADD CONSTRAINT "field_training_appointments_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
