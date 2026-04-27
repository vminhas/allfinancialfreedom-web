-- CreateEnum
CREATE TYPE "NoteScope" AS ENUM ('LICENSING', 'ADMIN_ONLY');

-- DropIndex
DROP INDEX "licensing_notes_agentProfileId_createdAt_idx";

-- AlterTable
ALTER TABLE "licensing_notes" ADD COLUMN     "scope" "NoteScope" NOT NULL DEFAULT 'LICENSING';

-- CreateIndex
CREATE INDEX "licensing_notes_agentProfileId_scope_createdAt_idx" ON "licensing_notes"("agentProfileId", "scope", "createdAt");
