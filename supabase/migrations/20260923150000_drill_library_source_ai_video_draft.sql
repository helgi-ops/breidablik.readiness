-- Allow drill_library.source = 'ai_video_draft' (drills drafted by the video → AI drill read,
-- then confirmed by the coach). Extends the existing source CHECK; all prior values preserved.
alter table drill_library drop constraint if exists drill_library_source_check;
alter table drill_library add constraint drill_library_source_check
  check (source = any (array['seed'::text, 'coach'::text, 'catapult'::text, 'public_template'::text, 'ai_video_draft'::text]));
