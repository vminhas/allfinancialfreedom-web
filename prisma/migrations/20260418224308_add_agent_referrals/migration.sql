-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "agent_referrals" (
    "id" TEXT NOT NULL,
    "referringAgentId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_referrals_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agent_referrals" ADD CONSTRAINT "agent_referrals_referringAgentId_fkey" FOREIGN KEY ("referringAgentId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
