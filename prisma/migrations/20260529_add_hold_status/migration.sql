-- Add a HOLD state to NewBusinessStatus for the LC SOP (application
-- paused, waiting on client info / underwriting). Kept in its own
-- migration because Postgres cannot use a newly-added enum value in
-- the same transaction it is added in; deploying this first means the
-- value is committed before any later migration or code references it.
ALTER TYPE "NewBusinessStatus" ADD VALUE IF NOT EXISTS 'HOLD';
