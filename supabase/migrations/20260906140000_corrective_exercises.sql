-- Corrective-exercise library — the counterpart to movement_tests. Built-in
-- exercises are hydrated from the typed code seed
-- (src/lib/micropulse/movementScreen/correctives/registry.ts) by slug; a team can
-- add its own via a row with a `definition` jsonb (no pipeline change). The code
-- registry stays the source of truth for the built-ins listed here.
-- Screening/training only — never a diagnosis, never the readiness colour.
create table if not exists corrective_exercises (
  slug text primary key,
  name jsonb not null,          -- { en, is } (listing label; full def in code/definition)
  phase text not null,          -- inhibit | lengthen | activate | integrate
  active boolean not null default true,
  team_id uuid references teams(id) on delete cascade,   -- null = global library
  definition jsonb,             -- full CorrectiveExercise for a team-custom entry; null = built-in code seed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into corrective_exercises (slug, name, phase) values
  ('smr_tfl_itband', '{"en":"Foam-roll TFL / IT band","is":"Rúllun TFL / IT-band"}'::jsonb, 'inhibit'),
  ('smr_adductors', '{"en":"Foam-roll adductors","is":"Rúllun aðfærsluvöðva"}'::jsonb, 'inhibit'),
  ('smr_calf', '{"en":"Foam-roll calf (gastroc/soleus)","is":"Rúllun kálfa (gastroc/soleus)"}'::jsonb, 'inhibit'),
  ('calf_stretch_gastroc', '{"en":"Standing calf stretch (gastroc)","is":"Kálfateygja standandi (gastroc)"}'::jsonb, 'lengthen'),
  ('ankle_df_knee_to_wall', '{"en":"Knee-to-wall ankle mobilisation (banded)","is":"Hné-að-vegg ökkla-liðkun (teygja)"}'::jsonb, 'lengthen'),
  ('hip_flexor_stretch', '{"en":"Half-kneeling hip-flexor stretch","is":"Mjaðma-beygju teygja í hálf-kné"}'::jsonb, 'lengthen'),
  ('glute_bridge', '{"en":"Bilateral glute bridge","is":"Tvífætt rassbrú"}'::jsonb, 'activate'),
  ('clamshell', '{"en":"Clamshell (banded)","is":"Skel (teygja)"}'::jsonb, 'activate'),
  ('side_lying_hip_abduction', '{"en":"Side-lying hip abduction","is":"Mjaðma-fráfærsla á hlið"}'::jsonb, 'activate'),
  ('half_kneeling_banded_hip_er', '{"en":"Half-kneeling banded hip external rotation","is":"Mjaðma-útsnúningur í hálf-kné með teygju"}'::jsonb, 'activate'),
  ('standing_banded_hip_abduction', '{"en":"Standing hip abduction, band at the ankle","is":"Mjaðma-fráfærsla standandi, teygja við ökkla"}'::jsonb, 'activate'),
  ('side_plank_hip_abduction', '{"en":"Side plank with top-leg abduction (side bridge)","is":"Hliðarplanki með efri-fótar fráfærslu"}'::jsonb, 'activate'),
  ('quadruped_hip_extension', '{"en":"Quadruped hip extension","is":"Mjaðma-rétta í fjórfætling"}'::jsonb, 'activate'),
  ('lateral_step_up', '{"en":"Lateral step-up","is":"Hliðar-uppstig"}'::jsonb, 'integrate'),
  ('crossover_step_up', '{"en":"Cross-over step-up","is":"Kross-uppstig"}'::jsonb, 'integrate'),
  ('single_leg_squat', '{"en":"Single-leg squat (to box)","is":"Einfætt hnébeygja (á kassa)"}'::jsonb, 'integrate'),
  ('rotational_single_leg_squat', '{"en":"Rotational single-leg squat","is":"Snúnings einfætt hnébeygja"}'::jsonb, 'integrate'),
  ('goblet_squat_knee_tracking', '{"en":"Goblet squat, knee-tracking cue","is":"Bikar-hnébeygja, hné-stýrings vísbending"}'::jsonb, 'integrate'),
  ('barbell_hip_thrust', '{"en":"Barbell hip thrust","is":"Stangar-mjaðmaýta (hip thrust)"}'::jsonb, 'integrate'),
  ('split_squat', '{"en":"Rear-foot-elevated split squat","is":"Klofbeygja með aftara fót upphækkaðan"}'::jsonb, 'integrate'),
  ('goblet_squat_counterbalance', '{"en":"Counterbalance goblet squat to depth","is":"Mótvægis bikar-hnébeygja í dýpt"}'::jsonb, 'integrate')
on conflict (slug) do nothing;

alter table corrective_exercises enable row level security;
drop policy if exists corrective_exercises_ro on corrective_exercises;
create policy corrective_exercises_ro on corrective_exercises for select
  using (team_id is null or team_id in (select coach_team_ids()) or is_staff());
drop policy if exists corrective_exercises_rw on corrective_exercises;
create policy corrective_exercises_rw on corrective_exercises for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());
