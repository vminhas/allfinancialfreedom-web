INSERT INTO "phase_item_definitions" (
  "id", "phase", "itemKey", "label", "description", "duration",
  "groupKey", "sortOrder", "adminOnly", "actionJson",
  "post_to_activity", "ping_admin", "post_to_announcements",
  "videos", "createdAt", "updatedAt"
)
VALUES (
  gen_random_uuid()::text,
  1,
  'pfr',
  'Personal Financial Review',
  'Sit down with your trainer for your own Personal Financial Review. This is both a real planning session for your finances and your first hands-on experience with the tool you''ll use to help families.',
  '1 Hour',
  'step1',
  4,
  false,
  '{"type":"navigate-tab","tab":"pfr","label":"Open PFR"}',
  true,
  false,
  false,
  '[]',
  now(),
  now()
)
ON CONFLICT ("itemKey") DO NOTHING;
