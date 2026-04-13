-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPOINTED', 'JIT');

-- CreateTable
CREATE TABLE "agent_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "inviteToken" TEXT,
    "inviteExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "agent_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_profiles" (
    "id" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "agentCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "state" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "npn" TEXT,
    "icaDate" TIMESTAMP(3),
    "recruiterId" TEXT,
    "cft" TEXT,
    "eliteCft" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "phase" INTEGER NOT NULL DEFAULT 1,
    "phaseStartedAt" TIMESTAMP(3),
    "goal" TEXT,
    "initialPointOfContact" TEXT,
    "examDate" TIMESTAMP(3),
    "licenseNumber" TEXT,
    "licenseLines" TEXT,
    "dateSubmittedToGfi" TIMESTAMP(3),
    "discordJoinDate" TIMESTAMP(3),
    "discordUserId" TEXT,
    "welcomeLetterSentAt" TIMESTAMP(3),
    "clientProduct" TEXT,
    "licenseProcess" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_items" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_appointments" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "producerNumber" TEXT,
    "appointedDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognition_milestones" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "recognition_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_partners" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "timeZone" TEXT,
    "age" TEXT,
    "married" BOOLEAN NOT NULL DEFAULT false,
    "children" BOOLEAN NOT NULL DEFAULT false,
    "occupation" TEXT,
    "characterTraits" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "icaDate" TIMESTAMP(3),
    "firstCallDate" TIMESTAMP(3),
    "secondCallDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_entries" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "policyNumber" TEXT,
    "clientName" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "splitAgentName" TEXT,
    "dateSubmitted" TIMESTAMP(3),
    "targetPremium" DOUBLE PRECISION,
    "targetPoints" DOUBLE PRECISION,
    "commissionPayout" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "callDate" TIMESTAMP(3) NOT NULL,
    "contactName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "subject" TEXT,
    "notes" TEXT,
    "result" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_users_email_key" ON "agent_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "agent_users_inviteToken_key" ON "agent_users"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_agentUserId_key" ON "agent_profiles"("agentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_agentCode_key" ON "agent_profiles"("agentCode");

-- CreateIndex
CREATE UNIQUE INDEX "phase_items_agentProfileId_phase_itemKey_key" ON "phase_items"("agentProfileId", "phase", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "carrier_appointments_agentProfileId_carrier_key" ON "carrier_appointments"("agentProfileId", "carrier");

-- CreateIndex
CREATE UNIQUE INDEX "recognition_milestones_agentProfileId_milestone_key" ON "recognition_milestones"("agentProfileId", "milestone");

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "agent_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_items" ADD CONSTRAINT "phase_items_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_appointments" ADD CONSTRAINT "carrier_appointments_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_milestones" ADD CONSTRAINT "recognition_milestones_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_entries" ADD CONSTRAINT "policy_entries_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
