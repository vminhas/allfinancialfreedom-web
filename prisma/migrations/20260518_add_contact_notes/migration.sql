CREATE TABLE IF NOT EXISTS "contact_notes" (
  "id" TEXT NOT NULL,
  "businessPartnerId" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_notes_businessPartnerId_fkey" FOREIGN KEY ("businessPartnerId") REFERENCES "business_partners"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "contact_notes_businessPartnerId_createdAt_idx" ON "contact_notes"("businessPartnerId", "createdAt");
