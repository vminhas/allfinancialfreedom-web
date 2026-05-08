-- Audit log for "email-reminder" sends out of the Progression Matrix.
-- One row per recipient per send. Lets admins see what's been sent and
-- when, and powers any future cooldown logic.

CREATE TABLE "phase_item_reminders" (
    "id" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "recipientAgentProfileId" TEXT NOT NULL,
    "sentByAdminId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyPreview" VARCHAR(500) NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "ghlMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_item_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "phase_item_reminders_phase_itemKey_sentAt_idx"
    ON "phase_item_reminders" ("phase", "itemKey", "sentAt");

CREATE INDEX "phase_item_reminders_recipientAgentProfileId_sentAt_idx"
    ON "phase_item_reminders" ("recipientAgentProfileId", "sentAt");

ALTER TABLE "phase_item_reminders"
    ADD CONSTRAINT "phase_item_reminders_recipientAgentProfileId_fkey"
    FOREIGN KEY ("recipientAgentProfileId") REFERENCES "agent_profiles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "phase_item_reminders"
    ADD CONSTRAINT "phase_item_reminders_sentByAdminId_fkey"
    FOREIGN KEY ("sentByAdminId") REFERENCES "admin_users" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
