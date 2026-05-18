-- CreateTable
CREATE TABLE "agent_notes" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorType" "NoteAuthorType" NOT NULL,
    "authorAgentId" TEXT,
    "authorAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_notes_agentProfileId_createdAt_idx" ON "agent_notes"("agentProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_authorAgentId_fkey" FOREIGN KEY ("authorAgentId") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
