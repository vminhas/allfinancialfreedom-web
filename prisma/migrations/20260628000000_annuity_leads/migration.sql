-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'BOOKED', 'NURTURE', 'WON', 'DEAD');

-- CreateEnum
CREATE TYPE "LeadScore" AS ENUM ('A', 'STANDARD', 'NURTURE');

-- CreateTable
CREATE TABLE "annuity_leads" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "age_band" TEXT NOT NULL,
    "savings_band" TEXT NOT NULL,
    "income_timing" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "score" "LeadScore" NOT NULL DEFAULT 'STANDARD',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "consent_text" TEXT NOT NULL,
    "consented_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "page_url" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "fbclid" TEXT,
    "referrer" TEXT,
    "ghl_contact_id" TEXT,
    "meta_event_id" TEXT,
    "notes" TEXT,
    "last_contacted" TIMESTAMP(3),

    CONSTRAINT "annuity_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annuity_leads_status_created_at_idx" ON "annuity_leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "annuity_leads_score_created_at_idx" ON "annuity_leads"("score", "created_at");

-- CreateIndex
CREATE INDEX "annuity_leads_email_idx" ON "annuity_leads"("email");
