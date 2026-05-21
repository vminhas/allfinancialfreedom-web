-- Public-team-page editor: one table for all three sections
-- (Leadership / Directors / Associates) so the admin can manage
-- everyone from one screen. Section enum tells the public page
-- which layout to use; sortOrder is set by drag-reorder.

DO $$ BEGIN
  CREATE TYPE "TeamSection" AS ENUM ('LEADERSHIP', 'DIRECTOR', 'ASSOCIATE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "team_members" (
  "id"          TEXT PRIMARY KEY,
  "section"     "TeamSection" NOT NULL,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "name"        TEXT NOT NULL,
  "title"       TEXT,
  "credentials" TEXT,
  "specialty"   TEXT,
  "location"    TEXT,
  "initials"    TEXT,
  "image_url"   TEXT,
  "bio"         TEXT,
  "calendly"    TEXT,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "team_members_section_sort_order_idx"
  ON "team_members" ("section", "sort_order");

-- Seed from the existing hardcoded constants so the public /team
-- page keeps rendering immediately after the migration applies.
-- Uses ON CONFLICT DO NOTHING via WHERE NOT EXISTS so re-running
-- the migration is idempotent on environments that already seeded.

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "title", "credentials", "image_url", "bio")
SELECT 'seed_team_vick', 'LEADERSHIP', 0,
  'Karmvir "Vick" Minhas',
  'Chief Executive Officer',
  'MBA, EMD',
  '/team/vick.jpg',
  'With over 16 years of experience in the financial services industry, Vick brings a powerful blend of expertise, vision, and unwavering dedication to our mission. A natural educator and driven leader, he''s passionate about breaking down complex financial concepts into actionable strategies that create long-term success.'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_vick');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "title", "credentials", "image_url", "bio")
SELECT 'seed_team_melinee', 'LEADERSHIP', 1,
  'Melinee Minhas',
  'Chief Operations Officer',
  'MBA, EMD',
  '/team/melinee.jpg',
  'Driven by purpose and powered by strategy, Melinee brings heart, hustle, and vision to every financial journey. As COO, she''s the steady hand behind our systems, making sure every client and partner feels seen, supported, and set up to win.'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_melinee');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "title", "credentials", "image_url", "bio", "calendly")
SELECT 'seed_team_jeremy', 'DIRECTOR', 0,
  'Dr. Jeremy Davis',
  'Marketing Director',
  'PhD',
  '/team/jeremy.jpg',
  'Dr. Davis brings a rare combination of academic depth and real-world marketing insight to the All Financial Freedom team. His strategic approach to brand building, community outreach, and client education helps ensure our message reaches the families who need it most.',
  'https://calendly.com/davisfamilyfinancial/discoverycall'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_jeremy');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "initials", "specialty", "location", "image_url", "calendly")
SELECT 'seed_team_kiirah', 'ASSOCIATE', 0,
  'Kiirah Washington', 'KW', 'Insurance Planning', 'Houston, TX',
  '/team/kiirah.jpg',
  'https://calendly.com/k-washington1-gfi/30min'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_kiirah');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "initials", "specialty", "location", "image_url", "calendly")
SELECT 'seed_team_sadie', 'ASSOCIATE', 1,
  'Sadie Grubb', 'SG', 'Financial Planning', 'Centerville, IA',
  '/team/sadie.jpg',
  'https://calendly.com/sadiegrubb/future-planning-call'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_sadie');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "initials", "specialty", "location", "image_url")
SELECT 'seed_team_tamarah', 'ASSOCIATE', 2,
  'Dr. Tamarah Davis', 'TD', 'Financial Planning', 'Boston, MA',
  '/team/tamarh.jpg'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_tamarah');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "initials", "specialty", "location", "image_url")
SELECT 'seed_team_heather', 'ASSOCIATE', 3,
  'Heather Cullum', 'HC', 'Retirement Planning', 'Leonardtown, MD',
  '/team/heather.jpg'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_heather');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "initials", "specialty", "location", "image_url", "calendly")
SELECT 'seed_team_sam', 'ASSOCIATE', 4,
  'Sam Yonce', 'SY', 'Asset Protection', 'Cape Carteret, NC',
  '/team/sam.jpg',
  'https://calendly.com/syonce61/new-meeting'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_sam');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "initials", "specialty", "location", "image_url", "calendly")
SELECT 'seed_team_doug', 'ASSOCIATE', 5,
  'Doug Morrison', 'DM', 'Wealth Building', 'Columbus, OH',
  '/team/doug.jpg',
  'https://calendly.com/dougmorrison-gfi/gfi-discovery-phone-call-clone'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_doug');

INSERT INTO "team_members" ("id", "section", "sort_order", "name", "initials", "specialty", "location", "image_url")
SELECT 'seed_team_bhavita', 'ASSOCIATE', 6,
  'Bhavita Patel', 'BP', 'Financial Planning', 'Murfreesboro, TN',
  '/team/bhavita.jpeg'
WHERE NOT EXISTS (SELECT 1 FROM "team_members" WHERE "id" = 'seed_team_bhavita');
