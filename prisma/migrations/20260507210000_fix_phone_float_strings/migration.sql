-- Strip trailing ".0" (and ".00" etc.) from phone numbers that were
-- imported from CSV where Excel serialized them as floats.
-- e.g. "4696556307.0" -> "4696556307"
UPDATE "AgentProfile"
SET phone = regexp_replace(phone, '\.0+$', '')
WHERE phone ~ '^\d+\.0+$';
