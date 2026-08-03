-- The coach roster "Make inactive" action writes players.status = 'INACTIVE'
-- (see src/app/coach/players/page.tsx deactivatePlayer + loadPlayers), but the
-- original CHECK constraint only allowed PENDING/ACTIVE/REJECTED, so the update
-- failed with a 23514 constraint violation (surfaced as an opaque [object Object]).
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_status_check;
ALTER TABLE public.players ADD CONSTRAINT players_status_check
  CHECK (status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'REJECTED'::text, 'INACTIVE'::text]));
