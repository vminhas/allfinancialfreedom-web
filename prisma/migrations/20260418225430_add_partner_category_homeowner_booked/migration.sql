-- AlterTable
ALTER TABLE "business_partners" ADD COLUMN     "bookedAppt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "homeowner" BOOLEAN NOT NULL DEFAULT false;
