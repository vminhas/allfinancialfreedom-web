-- One-time avatar cache-bust backfill.
--
-- Avatar uploads write to a deterministic, overwrite-in-place Vercel
-- Blob path (agent-avatars/<id>.<ext>), so the URL was byte-identical
-- across re-uploads. Vercel's CDN + the browser cache blob URLs
-- long-term and the <img> tags carry no cache-buster, so a freshly
-- uploaded photo never appeared ("not sticking") for the whole team.
--
-- The upload routes now append ?v=<timestamp> per upload, but that only
-- helps future uploads. This backfill appends a version marker to the
-- already-stored URLs so the current (latest actually-uploaded) image
-- shows for everyone immediately, without each person re-uploading.
--
-- Safe + idempotent: only rows pointing at blob storage and only when
-- the URL has no query string yet, so a re-deploy never double-appends
-- and any URL already busted by the route is left alone.

UPDATE "agent_profiles"
SET "avatarUrl" = "avatarUrl" || '?v=20260516150000'
WHERE "avatarUrl" IS NOT NULL
  AND "avatarUrl" LIKE '%blob.vercel-storage.com%'
  AND POSITION('?' IN "avatarUrl") = 0;
