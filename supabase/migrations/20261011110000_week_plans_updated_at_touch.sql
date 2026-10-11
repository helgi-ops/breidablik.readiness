-- week_plans gets a real updated_at so Week Setup can resolve Meso-vs-WeekSetup
-- conflicts by "last edit wins". The Meso autosave rewrites the WHOLE block's days
-- on every edit, so a naive updated_at would mark every week as freshly edited. The
-- trigger therefore bumps updated_at ONLY when a day's meaningful content actually
-- changes; an idempotent rewrite of an unchanged day keeps its old timestamp.
alter table public.week_plans
  add column if not exists updated_at timestamptz not null default now();

-- Preserve history: existing rows keep their original time (not now()), so a week the
-- coach last touched in Week Setup still reads as the newer edit until the Meso changes it.
update public.week_plans set updated_at = created_at where updated_at is null or updated_at = now();

create or replace function public.week_plans_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (OLD.day_type, OLD.focus, OLD.day_intent, OLD.planned_load, OLD.system_key)
     is distinct from
     (NEW.day_type, NEW.focus, NEW.day_intent, NEW.planned_load, NEW.system_key) then
    NEW.updated_at := now();
  else
    NEW.updated_at := OLD.updated_at; -- unchanged content → keep the old timestamp
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_week_plans_touch_updated_at on public.week_plans;
create trigger trg_week_plans_touch_updated_at
  before update on public.week_plans
  for each row execute function public.week_plans_touch_updated_at();
