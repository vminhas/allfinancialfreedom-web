/*
  Warnings:

  - You are about to drop the `phase_item_overrides` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "phase_item_overrides";

-- CreateTable
CREATE TABLE "phase_item_definitions" (
    "id" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration" TEXT,
    "groupKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    "actionJson" TEXT,
    "coordinatorTopic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phase_item_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "phase_item_definitions_itemKey_key" ON "phase_item_definitions"("itemKey");
