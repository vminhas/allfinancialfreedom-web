-- AlterTable
ALTER TABLE "annuity_leads" ADD COLUMN "account_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
