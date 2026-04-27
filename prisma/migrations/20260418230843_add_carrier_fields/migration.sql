-- AlterTable
ALTER TABLE "carrier_appointments" ADD COLUMN     "carrierType" TEXT,
ADD COLUMN     "googleFormDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "readyToSubmit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sureLcDate" TIMESTAMP(3),
ADD COLUMN     "writingCode" TEXT;
