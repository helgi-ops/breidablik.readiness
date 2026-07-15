-- Guardian contact on a consent row. For a minor, consent is given by a parent
-- or guardian (granted_by_relationship IN ('parent','guardian')) with their name
-- in granted_by_full_name; this adds their contact (email/phone) at the time of
-- consent, so the guardian is reachable and a later email verification / re-
-- consent can be built on it. Additive + nullable — no backfill.

ALTER TABLE public.player_consents
  ADD COLUMN IF NOT EXISTS granted_by_contact text;

COMMENT ON COLUMN public.player_consents.granted_by_contact IS
  'Contact (email/phone) of the person who granted the consent — captured for guardian/parent consents so they can be reached and later verified. NULL for self-consents.';
