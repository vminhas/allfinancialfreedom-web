-- Add tevah_client_id to new_business_submissions for Tevah sync deduplication.
ALTER TABLE "new_business_submissions" ADD COLUMN "tevah_client_id" INTEGER;
CREATE UNIQUE INDEX "new_business_submissions_tevah_client_id_key" ON "new_business_submissions"("tevah_client_id");
