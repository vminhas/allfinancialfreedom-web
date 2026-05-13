-- ICA (Independent Contractor Agreement) submission queue. One row per
-- PDF ingested from the admin activity Discord channel (or a web
-- upload). Admin reviews + approves in /vault/recruits, which creates
-- the live AgentProfile and fires the NEW RECRUIT announcement.

CREATE TYPE "IcaSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PARSE_FAILED');

CREATE TABLE "ica_submissions" (
  "id"                          TEXT NOT NULL,
  "status"                      "IcaSubmissionStatus" NOT NULL DEFAULT 'PENDING',

  -- Source tracking
  "sourceType"                  TEXT NOT NULL,
  "source_message_id"           TEXT,
  "source_channel_id"           TEXT,
  "source_author_discord_id"    TEXT,
  "source_attachment_url"       TEXT,
  "pdf_blob_url"                TEXT,
  "pdf_filename"                TEXT,

  -- Parser output
  "raw_text"                    TEXT,
  "parsed_raw"                  JSONB,
  "parse_error"                 TEXT,
  "first_name"                  TEXT,
  "middle_name"                 TEXT,
  "last_name"                   TEXT,
  "email"                       TEXT,
  "dob"                         TIMESTAMP(3),
  "gender"                      TEXT,
  "marital_status"              TEXT,
  "spouse_name"                 TEXT,
  "address_line1"               TEXT,
  "city"                        TEXT,
  "state"                       TEXT,
  "zip"                         TEXT,
  "country"                     TEXT,
  "reference_code"              TEXT,
  "classification"              TEXT,
  "has_license"                 BOOLEAN,

  -- Approval bookkeeping
  "reviewed_at"                 TIMESTAMP(3),
  "reviewed_by_email"           TEXT,
  "review_note"                 TEXT,
  "created_agent_profile_id"    TEXT,

  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ica_submissions_pkey" PRIMARY KEY ("id")
);

-- Uniqueness: one submission row per Discord message (idempotency for the cron poller).
CREATE UNIQUE INDEX "ica_submissions_source_message_id_key"
  ON "ica_submissions"("source_message_id");

-- Uniqueness: the AgentProfile we create at approval time has exactly one originating submission.
CREATE UNIQUE INDEX "ica_submissions_created_agent_profile_id_key"
  ON "ica_submissions"("created_agent_profile_id");

-- Queue view: pending submissions newest-first. APPROVED + REJECTED rows tail-end the same index.
CREATE INDEX "ica_submissions_status_created_at_idx"
  ON "ica_submissions"("status", "created_at" DESC);
