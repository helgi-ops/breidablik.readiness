-- Age + training experience for the goal-driven recommender. These gate which
-- training methods are appropriate: a young (<18) and/or beginner client should
-- not be recommended advanced high-CNS methods like French Contrast.
alter table public.pt_client_goals
  add column if not exists age integer,
  add column if not exists experience text;  -- 'beginner' | 'intermediate' | 'advanced'

comment on column public.pt_client_goals.age is 'Client age (years). <18 caps the recommended method demand (no max-CNS complexes).';
comment on column public.pt_client_goals.experience is 'Training experience: beginner | intermediate | advanced. Caps recommended method demand.';
