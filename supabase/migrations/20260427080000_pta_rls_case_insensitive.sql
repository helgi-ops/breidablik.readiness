-- Fix: RLS policy on player_template_assignments was case-sensitive
-- ('coach' / 'admin' lowercase only). Production profiles store role
-- as uppercase ('COACH', 'ADMIN', 'STAFF'); the rest of the codebase
-- (api/team/decisions/route.ts requireCoachContext) accepts both.
-- ADMIN users were getting silently denied on insert; UI surfaced
-- as "Tókst ekki að vista úthlutun".
--
-- Fix: case-insensitive comparison via upper(), and add STAFF role
-- to align with the rest of the API auth surface.

drop policy if exists pta_coach_all on public.player_template_assignments;
drop policy if exists pta_coach_write on public.player_template_assignments;

create policy pta_coach_all on public.player_template_assignments
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and upper(p.role) = ANY (ARRAY['COACH','ADMIN','STAFF'])
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and upper(p.role) = ANY (ARRAY['COACH','ADMIN','STAFF'])
    )
  );
