-- CreateTable
CREATE TABLE "agent_feedback" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_feedback_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
