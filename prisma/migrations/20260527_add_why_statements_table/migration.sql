-- CreateTable
CREATE TABLE "why_statements" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "why_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "why_statements_agentProfileId_createdAt_idx" ON "why_statements"("agentProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "why_statements" ADD CONSTRAINT "why_statements_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
