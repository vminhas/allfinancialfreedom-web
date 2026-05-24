ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "ghlOpportunityId" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "ghlPipelineStage" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "ghlStageUpdatedAt" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ghl_appointments" (
  "id" TEXT NOT NULL,
  "ghlCalendarId" TEXT,
  "ghlEventId" TEXT,
  "calendarName" TEXT NOT NULL,
  "contactId" TEXT,
  "contactName" TEXT NOT NULL,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "appointmentDate" TIMESTAMP(3) NOT NULL,
  "duration" INTEGER,
  "assignedTo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'BOOKED',
  "outcome" TEXT,
  "notes" TEXT,
  "zoomVerified" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT,
  "pipelineAction" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ghl_appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ghl_appointments_ghlEventId_key" UNIQUE ("ghlEventId"),
  CONSTRAINT "ghl_appointments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "ghl_appointments_contactId_idx" ON "ghl_appointments"("contactId");
CREATE INDEX IF NOT EXISTS "ghl_appointments_appointmentDate_idx" ON "ghl_appointments"("appointmentDate");
CREATE INDEX IF NOT EXISTS "ghl_appointments_status_idx" ON "ghl_appointments"("status");
