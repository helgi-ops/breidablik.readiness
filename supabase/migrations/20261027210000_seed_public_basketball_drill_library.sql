-- Standard shared (public) basketball drill library — visible to every basketball team in
-- the General Library + Build Session picker (scope=general reads owner_type='public' +
-- sport filter). Load estimates are on the Titan "Load Index" scale (~18/min; varies by
-- category). GPS/IMA columns stay null (indoor, no GPS). Idempotent.
insert into public.drill_library
  (category, drill_name, description, drill_format, total_players, reps, duration_min, player_load, player_load_per_min, source, sport, owner_type)
select v.category, v.drill_name, v.description, v.drill_format, v.total_players, v.reps, v.duration_min, v.player_load, v.player_load_per_min, 'admin_upload', 'basketball', 'public'
from (values
  ('shooting','Form Shooting','Close-range form shooting to groove mechanics — hand placement, follow-through, soft touch. Low load, high volume of makes.','Stations / solo',1,'10 makes ×3 spots',10.0,100,10.0),
  ('shooting','Catch-and-Shoot Series','Spot-up shooting off a pass from spots around the arc; passer rebounds and swings. Game-speed footwork into the catch.','Partners / 2–4 at a hoop',4,'10 shots ×5 spots',12.0,144,12.0),
  ('shooting','Shooting off the Dribble','One or two dribbles into a pull-up from the wing and top; alternate directions to work both hands.','Solo / partner rebound',2,'8 each spot',10.0,130,13.0),
  ('fast_break','3-Man Weave','Classic full-court weave finishing with a layup; emphasise spacing, timing and a controlled finish.','Full court, groups of 3',3,'5 min continuous',8.0,176,22.0),
  ('fast_break','2-on-1 / 3-on-2 Continuous','Advantage break then transition the other way; decision-making under numbers, finish or kick.','Full court, continuous',6,'8–10 min',10.0,240,24.0),
  ('fast_break','11-Man Fast Break','Continuous full-court transition with outlet, fill and defensive match-up; high-tempo conditioning + decisions.','Full court, 11 players',11,'3 trips ×4',12.0,264,22.0),
  ('half_court_offense','5-Out Motion (Give-and-Go)','Pass, cut, replace in a 5-out spacing; read the give-and-go and backdoor off the deny.','Half court, 5v0 / 5v5',10,'10 each side',10.0,150,15.0),
  ('half_court_offense','Pick-and-Roll Reads','Ball-screen reads — turn the corner, reject, pocket pass, pop; add a help defender to force the read.','Half court, 2v2 / 4v4',4,'4 min blocks',12.0,180,15.0),
  ('half_court_offense','Flex Offense Breakdown','Flex cut + down-screen continuity; break it into parts then play live to a score.','Half court, 5v5',10,'to 3 stops',12.0,168,14.0),
  ('defense','Shell Defense (4v4)','On/off-ball positioning — jump to the ball, help-and-recover, close out. Build habits before live.','Half court, 4v4',8,'4 min blocks',12.0,204,17.0),
  ('defense','Closeout & Contest','Closeout from the help, contest without fouling, then live 1v1 from the catch. High change-of-direction.','Half court, pairs',4,'8 reps each',8.0,144,18.0),
  ('defense','1-on-1 Live Defense','Guard the ball from the wing to a score or stop; stance, slides and a clean contest. Short, intense reps.','Half court, 1v1',2,'6 reps each',10.0,200,20.0),
  ('conditioning','Suicides / Lines','Baseline-to-line-and-back sprints (free throw, half, far FT, far baseline). Anaerobic repeat-sprint.','Full court, team',12,'4 reps ×2 sets',8.0,224,28.0),
  ('conditioning','17s (Baseline Sprints)','17 full-court widths inside a time cap — classic repeat-sprint conditioning.','Full court, team',12,'2 reps',6.0,180,30.0),
  ('conditioning','Transition Defense (5v5 Get-Back)','Score/miss then sprint back to stop the break; conditions the get-back habit at high intensity.','Full court, 5v5',10,'6 trips',12.0,288,24.0),
  ('warmup','Dynamic Warm-up + Ball-handling','Movement prep (leg swings, lunges, skips) into two-ball dribbling and layup lines. Raise temperature, prime touch.','Full court, team',12,'10 min flow',10.0,90,9.0)
) as v(category, drill_name, description, drill_format, total_players, reps, duration_min, player_load, player_load_per_min)
where not exists (
  select 1 from public.drill_library where sport='basketball' and owner_type='public'
);
