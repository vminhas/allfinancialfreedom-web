-- AlterTable: capture Google Ads / GA4 attribution + down-funnel conversion sends
ALTER TABLE "annuity_leads" ADD COLUMN "gclid" TEXT;
ALTER TABLE "annuity_leads" ADD COLUMN "ga_client_id" TEXT;
ALTER TABLE "annuity_leads" ADD COLUMN "qualify_event_at" TIMESTAMP(3);
ALTER TABLE "annuity_leads" ADD COLUMN "convert_event_at" TIMESTAMP(3);
