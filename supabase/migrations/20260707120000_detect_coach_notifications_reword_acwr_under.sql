-- Reword the ACWR-under (undertraining) coach notification so it no longer uses
-- "sweet spot" / "sweet-spot" framing, which violates the project's ACWR
-- convention (frame ACWR as spike-size / distance from the player's own usual
-- load, never as an optimal-zone "sweet spot"; Impellizzeri 2020). The message
-- keeps the legitimate detraining/undertraining meaning, just without the
-- injury-zone wording. Done by rewriting the two string literals in the existing
-- detect_coach_notifications() body so the rest of the (large) function is
-- untouched.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'detect_coach_notifications';

  IF d IS NULL THEN
    RAISE NOTICE 'detect_coach_notifications not found — nothing to reword';
    RETURN;
  END IF;

  d := replace(
    d,
    'Training load has been below the sweet spot for a week — risk of detraining and reduced match readiness',
    'Training load has stayed well below his usual for a week — risk of detraining and lost conditioning'
  );
  d := replace(
    d,
    'Æfingaálag undir sweet-spot í heila viku — fitness fer niður og leikmaður missir keppnisform',
    'Æfingaálag hefur verið vel undir hans vanalega í viku — hætta á afþjálfun og tapi á formi'
  );

  EXECUTE d;
END $$;
