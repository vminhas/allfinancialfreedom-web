/*
  Warnings:

  - You are about to drop the column `licensingNotes` on the `agent_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "agent_profiles" DROP COLUMN "licensingNotes";

-- CreateTable
CREATE TABLE "licensing_notes" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licensing_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "licensing_notes_agentProfileId_createdAt_idx" ON "licensing_notes"("agentProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "licensing_notes" ADD CONSTRAINT "licensing_notes_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing_notes" ADD CONSTRAINT "licensing_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
