-- AlterTable
ALTER TABLE "agent_profiles" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'US',
ADD COLUMN     "zip" TEXT;
