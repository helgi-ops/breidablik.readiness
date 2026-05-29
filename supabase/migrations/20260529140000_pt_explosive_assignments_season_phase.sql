-- Season phase for explosive-power programme assignments.
-- Lets the trainer assign a ready-made programme for a specific season block;
-- drives an explainable volume/intensity modifier on the client surface.
alter table public.pt_explosive_programme_assignments
  add column if not exists season_phase text
  check (season_phase is null or season_phase in ('offseason','preseason','inseason','postseason'));

comment on column public.pt_explosive_programme_assignments.season_phase is
  'Season phase the programme is assigned for: offseason (build), preseason (convert to power), inseason (maintain/freshness), postseason (restoration). Drives an explainable volume/intensity modifier on the client surface.';
