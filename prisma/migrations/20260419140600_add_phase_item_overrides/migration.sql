-- CreateTable
CREATE TABLE "phase_item_overrides" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "duration" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phase_item_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "phase_item_overrides_itemKey_key" ON "phase_item_overrides"("itemKey");
