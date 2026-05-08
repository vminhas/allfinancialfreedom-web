-- AdminCallReview gains an optional outcome enum so admins can record
-- what actually happened on the call (RECRUITED / APPOINTMENT_BOOKED /
-- POLICY_CLOSED / FOLLOW_UP_SCHEDULED / NOT_INTERESTED / NO_CONTACT)
-- after the AI scoring is in. Mirrors the agent-side CallReview.outcome
-- column (same CallOutcome enum), so reporting can union the two later.

ALTER TABLE "admin_call_reviews"
    ADD COLUMN "outcome" "CallOutcome";
