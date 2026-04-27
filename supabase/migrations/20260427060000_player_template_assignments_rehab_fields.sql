-- Extend player_template_assignments with optional program-grouping
-- fields so multi-day rehab assignments can be grouped, labelled,
-- and traced back to the originating injury.
--
-- All fields are nullable + back-compatible — existing microdose
-- assignments continue to work unchanged.

alter table public.player_template_assignments
  add column if not exists program_label text,
  add column if not exists program_stage_label text,
  add column if not exists injury_event_id uuid references public.injury_events(id) on delete set null;

create index if not exists idx_player_template_assignments_injury
  on public.player_template_assignments (injury_event_id)
  where injury_event_id is not null;

create index if not exists idx_player_template_assignments_program
  on public.player_template_assignments (player_id, program_label)
  where program_label is not null;

comment on column public.player_template_assignments.program_label is
'Optional grouping label for multi-day rehab programs. NULL for one-off microdose assignments. Lets the UI render an injured player''s 7-day rehab as a single program in the player accordion.';

comment on column public.player_template_assignments.program_stage_label is
'Optional clinical-stage tag (Acute / Sub-acute / Sport-specific / Return-to-play) per Aspetar 2014 RTP framework.';

comment on column public.player_template_assignments.injury_event_id is
'When the assignment was created in response to a logged injury, links back to it. Used by the injuries page to show "Active rehab" badge on the row.';
