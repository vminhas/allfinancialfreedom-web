-- CreateTable: slot definitions (one per phase item template)
CREATE TABLE "phase_item_slot_defs" (
    "id" TEXT NOT NULL,
    "phaseItemDefinitionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slotType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_item_slot_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: per-agent slot fulfillments
CREATE TABLE "agent_slot_fulfillments" (
    "id" TEXT NOT NULL,
    "slotDefId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "businessPartnerId" TEXT,
    "ftaId" TEXT,
    "fulfilledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_slot_fulfillments_pkey" PRIMARY KEY ("id")
);

-- Unique: one fulfillment per slot per agent
CREATE UNIQUE INDEX "agent_slot_fulfillments_slotDefId_agentProfileId_key"
    ON "agent_slot_fulfillments"("slotDefId", "agentProfileId");

-- FK: slot def → phase item definition (cascade delete)
ALTER TABLE "phase_item_slot_defs"
    ADD CONSTRAINT "phase_item_slot_defs_phaseItemDefinitionId_fkey"
    FOREIGN KEY ("phaseItemDefinitionId")
    REFERENCES "phase_item_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: fulfillment → slot def (cascade delete)
ALTER TABLE "agent_slot_fulfillments"
    ADD CONSTRAINT "agent_slot_fulfillments_slotDefId_fkey"
    FOREIGN KEY ("slotDefId")
    REFERENCES "phase_item_slot_defs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: fulfillment → agent profile (cascade delete)
ALTER TABLE "agent_slot_fulfillments"
    ADD CONSTRAINT "agent_slot_fulfillments_agentProfileId_fkey"
    FOREIGN KEY ("agentProfileId")
    REFERENCES "agent_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: fulfillment → business partner (set null on delete)
ALTER TABLE "agent_slot_fulfillments"
    ADD CONSTRAINT "agent_slot_fulfillments_businessPartnerId_fkey"
    FOREIGN KEY ("businessPartnerId")
    REFERENCES "business_partners"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: fulfillment → field training appointment (set null on delete)
ALTER TABLE "agent_slot_fulfillments"
    ADD CONSTRAINT "agent_slot_fulfillments_ftaId_fkey"
    FOREIGN KEY ("ftaId")
    REFERENCES "field_training_appointments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
