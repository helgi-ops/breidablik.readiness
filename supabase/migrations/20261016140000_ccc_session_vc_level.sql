-- Visual-Cognitive axis (VC-CCC) for the per-session chaos tags (ccc/visualCognitive.ts).
--
-- Each rehab session can now also carry a cognitive-load level (pre-planned → cued →
-- reactive/unanticipated → open-play), classified by the physio from the drill DESIGN
-- (there is no sensor proxy for decision load). It is a SECOND, independent axis beside
-- the physical chaos level, so a tag may carry a physical level, a cognitive level, or
-- both — chaos_level is relaxed to nullable (a cognitive-only tag leaves the physical
-- level to the accel+decel proxy suggestion). Descriptive decision-support — never the
-- readiness colour.

alter table public.ccc_session_chaos_tags
  add column if not exists cognitive_level text;   -- a VcLevel (validated app-side via isVcLevel)

alter table public.ccc_session_chaos_tags
  alter column chaos_level drop not null;
