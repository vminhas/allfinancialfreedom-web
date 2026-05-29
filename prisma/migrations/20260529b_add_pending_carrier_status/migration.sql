-- Add a distinct "Pending" (at carrier) state to NewBusinessStatus.
-- The SOP separates "New" (= PENDING, the default + what the claim and
-- stats flows key on) from "Pending" (actively submitted to the
-- carrier). Kept in its own migration because Postgres cannot use a
-- newly-added enum value in the same transaction it is added in.
ALTER TYPE "NewBusinessStatus" ADD VALUE IF NOT EXISTS 'PENDING_CARRIER';
