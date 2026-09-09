-- Coach's per-MD training METHOD map, stored alongside the team strength palette.
-- md_structures maps a configurable MD day (MD-4 | MD-3) to a structure key
-- (cluster | straight_sets | contrast | french_contrast). When set (and non-default)
-- the INDIVIDUALISED / auto build lays that method out for the day instead of the
-- built-in template; the palette + taper + readiness still tune it. Other MD days
-- (MD-2 activation, MD-1 primer, MD+1 recovery) keep their fixed template.
alter table team_strength_palette
  add column if not exists md_structures jsonb not null default '{}'::jsonb;
