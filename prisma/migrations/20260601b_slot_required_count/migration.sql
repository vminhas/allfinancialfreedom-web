-- Add slotRequiredCount to phase_item_definitions.
-- null = all slots required (AND); a positive integer = "any N of M" (OR logic).
ALTER TABLE "phase_item_definitions" ADD COLUMN "slot_required_count" INTEGER;
