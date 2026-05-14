-- ─── Per-client paid add-ons for personal-trainer teams ─────────────────
-- A trainer can enable add-on features for specific clients (e.g. when the
-- client opts into the ELITE LV-profile package). One row per (trainer,
-- client, addon). Soft-deletable via `enabled`.
create table if not exists public.trainer_client_addons (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  client_id   uuid not null references public.players(id) on delete cascade,
  addon_key   text not null check (addon_key in ('lv_profile')),
  enabled     boolean not null default true,
  enabled_at  timestamptz not null default now(),
  disabled_at timestamptz,
  notes       text,
  unique (trainer_id, client_id, addon_key)
);

create index if not exists trainer_client_addons_client_addon_idx
  on public.trainer_client_addons (client_id, addon_key) where enabled = true;
create index if not exists trainer_client_addons_trainer_idx
  on public.trainer_client_addons (trainer_id) where enabled = true;

alter table public.trainer_client_addons enable row level security;
revoke all on public.trainer_client_addons from anon;
grant select, insert, update, delete on public.trainer_client_addons to authenticated;
grant select, insert, update, delete on public.trainer_client_addons to service_role;

drop policy if exists trainer_addons_owner_read on public.trainer_client_addons;
create policy trainer_addons_owner_read on public.trainer_client_addons
  for select to authenticated
  using (trainer_id = auth.uid());

drop policy if exists trainer_addons_owner_write on public.trainer_client_addons;
create policy trainer_addons_owner_write on public.trainer_client_addons
  for all to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

comment on table public.trainer_client_addons is
  'Per-client paid add-ons (e.g. lv_profile) for personal-trainer teams. Used as a feature-gate flag — billing tracked outside this table.';

-- ─── LV-profile tests ──────────────────────────────────────────────────
create table if not exists public.lv_profile_tests (
  id                  uuid primary key default gen_random_uuid(),
  trainer_id          uuid not null references public.profiles(id) on delete cascade,
  client_id           uuid not null references public.players(id) on delete cascade,
  test_date           date not null default current_date,
  exercise_key        text not null check (exercise_key in
    ('squat_jump','bench_press','back_squat','trap_bar_deadlift','deadlift','custom')),
  exercise_label      text,
  datapoints          jsonb not null,
  mvt                 numeric not null,
  slope               numeric,
  intercept           numeric,
  see                 numeric,
  r_squared           numeric,
  y_offset_velocity   numeric,
  x_offset_load       numeric,
  zero_velocity_load  numeric,
  est_one_rm          numeric,
  est_one_rm_high     numeric,
  est_one_rm_low      numeric,
  profile_type        text,
  profile_reason      text,
  dsi_ballistic_peak_n numeric,
  dsi_iso_peak_n      numeric,
  dsi_ratio           numeric,
  dsi_tier            text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists lv_profile_tests_client_exercise_idx
  on public.lv_profile_tests (client_id, exercise_key, test_date desc);
create index if not exists lv_profile_tests_trainer_idx
  on public.lv_profile_tests (trainer_id, test_date desc);

alter table public.lv_profile_tests enable row level security;
revoke all on public.lv_profile_tests from anon;
grant select, insert, update, delete on public.lv_profile_tests to authenticated;
grant select, insert, update, delete on public.lv_profile_tests to service_role;

drop policy if exists lv_profile_trainer_read on public.lv_profile_tests;
create policy lv_profile_trainer_read on public.lv_profile_tests
  for select to authenticated
  using (trainer_id = auth.uid() or client_id in (
    select id from public.players where user_id = auth.uid()
  ));

drop policy if exists lv_profile_trainer_write on public.lv_profile_tests;
create policy lv_profile_trainer_write on public.lv_profile_tests
  for all to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

comment on table public.lv_profile_tests is
  'Load-velocity profile test sessions for personal-training clients. ELITE add-on (gated by trainer_client_addons.addon_key = ''lv_profile'').';
