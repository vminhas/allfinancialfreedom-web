-- Permanent dismissal list for attendance matching, so a dismissed
-- unmatched Zoom guest is not recreated as an orphan on the next sync.
CREATE TABLE IF NOT EXISTS "attendance_dismissals" (
  "id" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_dismissals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_dismissals_nameKey_key" ON "attendance_dismissals"("nameKey");
CREATE INDEX IF NOT EXISTS "attendance_dismissals_email_idx" ON "attendance_dismissals"("email");
