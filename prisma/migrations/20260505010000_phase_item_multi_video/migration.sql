-- Allow multiple walkthrough videos per checklist item.
--
-- The legacy single-video columns (video_url / video_title) stay for now so
-- any old code path that hasn't been updated still has data to read; new code
-- reads from `videos` (an ordered JSON array of {url, title} objects). When
-- writing through the admin route we mirror videos[0] back into the legacy
-- columns so the two stay in sync until we drop them in a future migration.

ALTER TABLE "phase_item_definitions"
  ADD COLUMN "videos" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "phase_item_definitions"
   SET "videos" = jsonb_build_array(
         jsonb_build_object('url', "video_url", 'title', "video_title")
       )
 WHERE "video_url" IS NOT NULL
   AND "video_url" <> '';
