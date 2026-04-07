-- Basketball seed drills: research-backed SSG/drill templates for drill_library_public
-- Sources: Castagna 2011, Conte 2015/2016, Svilar 2018, Vazquez-Guerrero 2018,
--          Delextrat 2013, McCormick 2012, Atli 2013, Montgomery 2010,
--          Sansone 2018, Krause/Meyer/Meyer 2008

-- 1) Add sport column to drill_library_public
alter table public.drill_library_public
  add column if not exists sport text not null default 'football';

comment on column public.drill_library_public.sport
  is 'Sport this template applies to: football or basketball';

-- 2) Expand category check constraint to include basketball categories
alter table public.drill_library_public
  drop constraint if exists drill_library_public_category_check;

alter table public.drill_library_public
  add constraint drill_library_public_category_check
  check (category in (
    -- Football
    'possession','ssg','transition','running','finishing',
    -- Basketball
    'shooting','fast_break','half_court_offense','defense','conditioning',
    -- Shared
    'warmup','other'
  ));

-- 3) Add BMP columns to drill_library_public (matching drill_library)
alter table public.drill_library_public
  add column if not exists accel_total    numeric(5,1),
  add column if not exists decel_total    numeric(5,1),
  add column if not exists jump_count     int,
  add column if not exists ima_cod_total  int,
  add column if not exists high_ima       int;

-- 4) Index for sport filtering
create index if not exists drill_library_public_sport_idx
  on public.drill_library_public(sport);

-- 5) Insert basketball seed drills
-- ─────────────────────────────────────────────────────────────────────────────
-- Each drill is a research-validated protocol with metrics where available.
-- Player Load values are per-minute (PLmin) where noted; duration_min is per bout.
-- Coaches copy these into their team drill_library.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.drill_library_public
  (sport, category, drill_name, description, drill_format,
   field_length_m, field_width_m, total_players, reps, duration_min,
   player_load, player_load_per_min, hr_pct_max, blood_lactate_mmol, rpe_cr10,
   accel_total, decel_total, jump_count, ima_cod_total, high_ima,
   coach_encouragement, source_citation, source_doi, tags)
values

-- ── SSG / Conditioning drills ───────────────────────────────────────────────

-- 1. Castagna 2v2 Full-Court (High Intensity)
('basketball', 'conditioning', '2v2 Full-Court SSG',
 'Research-backed 2v2 on full 28×15m court. Highest physiological intensity among basketball SSG formats. '
 'Elicits ~92% HRpeak and 7.8 mmol/L blood lactate. Use for maximal aerobic/anaerobic conditioning. '
 'Man-to-man defense, no free throws.',
 '2v2 · 3×4min · 3min rest',
 28, 15, 4, '3×4min, 3min passive rest', 4.0,
 null, null, 92.0, 7.80, null,
 null, null, null, null, null,
 true,
 'Castagna et al. 2011', '10.1080/02640414.2011.587513',
 array['conditioning','high_intensity','aerobic','anaerobic','ssg']),

-- 2. Castagna 3v3 Full-Court (Medium-High)
('basketball', 'conditioning', '3v3 Full-Court SSG',
 'Research-backed 3v3 on full 28×15m court. ~88% HRpeak and 6.2 mmol/L blood lactate. '
 'Strong aerobic + anaerobic stimulus with more tactical complexity than 2v2. Man-to-man defense.',
 '3v3 · 3×4min · 3min rest',
 28, 15, 6, '3×4min, 3min passive rest', 4.0,
 null, null, 88.0, 6.20, null,
 null, null, null, null, null,
 true,
 'Castagna et al. 2011', '10.1080/02640414.2011.587513',
 array['conditioning','medium_high','aerobic','ssg']),

-- 3. Castagna 5v5 Full-Court (Match-like)
('basketball', 'conditioning', '5v5 Full-Court SSG',
 'Research-backed 5v5 on full 28×15m court. ~84% HRpeak, 4.2 mmol/L lactate. '
 'Most game-realistic format, useful for tactical conditioning closer to competition. Standard rules.',
 '5v5 · 3×4min · 3min rest',
 28, 15, 10, '3×4min, 3min passive rest', 4.0,
 null, null, 84.0, 4.20, null,
 null, null, null, null, null,
 true,
 'Castagna et al. 2011', '10.1080/02640414.2011.587513',
 array['conditioning','match_like','aerobic','ssg']),

-- 4. Svilar No-Stop 5v5 (Elite protocol)
('basketball', 'conditioning', '5v5 No-Stop Game (NSG)',
 'Elite-level protocol from Svilar et al. No free-throws, no clock stoppages, no time-outs. '
 'Forces continuous play and significantly higher Player Load/min (~13.15 AU/min) vs regular scrimmage. '
 'Ball immediately in play after made baskets (opponent inbounds). Great for conditioning blocks.',
 '5v5 · 2-3×5min · 4min rest',
 28, 15, 10, '2-3×5min, 4min passive rest', 5.0,
 null, 13.15, null, null, null,
 null, null, null, null, null,
 true,
 'Svilar et al. 2018', '10.1123/ijspp.2017-0753',
 array['conditioning','no_stop','high_intensity','elite','ssg']),

-- 5. Svilar Regular-Stop 5v5 (Elite)
('basketball', 'conditioning', '5v5 Regular Scrimmage (RSG)',
 'Standard 5v5 scrimmage with normal game rules and stoppages (free-throws, time-outs). '
 'Player Load/min ~11.27 AU/min. Match-play simulation for tactical work with moderate-high conditioning.',
 '5v5 · 2-3×5min · 4min rest',
 28, 15, 10, '2-3×5min, 4min passive rest', 5.0,
 null, 11.27, null, null, null,
 null, null, null, null, null,
 true,
 'Svilar et al. 2018', '10.1123/ijspp.2017-0753',
 array['conditioning','match_simulation','ssg']),

-- 6. Conte 2v2 Continuous (High physiological load)
('basketball', 'conditioning', '2v2 Continuous SSG',
 'Continuous 2v2 format from Conte et al. 2016. ~87% HRmax with continuous regime (3×4min). '
 'Continuous bouts produce higher physiological load than intermittent (1min on/1min off). '
 'Full-court 28×15m, man-to-man defense. Excellent for aerobic development.',
 '2v2 · 3×4min · 2min rest',
 28, 15, 4, '3×4min, 2min passive rest', 4.0,
 null, null, 87.1, null, null,
 null, null, null, null, null,
 true,
 'Conte et al. 2016', '10.1016/j.jsams.2015.07.013',
 array['conditioning','continuous','high_intensity','aerobic','ssg']),

-- 7. Conte 4v4 Continuous
('basketball', 'conditioning', '4v4 Continuous SSG',
 'Continuous 4v4 format from Conte et al. 2016. ~84.5% HRmax. '
 'Lower physiological load than 2v2 but more tactical complexity. '
 'Good balance of conditioning and game-like decision making.',
 '4v4 · 3×4min · 2min rest',
 28, 15, 8, '3×4min, 2min passive rest', 4.0,
 null, null, 84.5, null, null,
 null, null, null, null, null,
 true,
 'Conte et al. 2016', '10.1016/j.jsams.2015.07.013',
 array['conditioning','continuous','moderate_high','ssg']),

-- ── Half-Court Offense drills ───────────────────────────────────────────────

-- 8. Conte No-Dribble Game Drill 4v4
('basketball', 'half_court_offense', '4v4 No-Dribble Game',
 'No-dribble constraint from Conte et al. 2015. ~92% HRmax (significantly higher than regular). '
 'Forces passing, off-ball movement, and screening. Increases interceptions and passes per possession. '
 'Develops team offense and communication under high physiological load.',
 '4v4 · 3×4min · 2min rest',
 28, 15, 8, '3×4min, 2min passive rest', 4.0,
 null, null, 92.0, null, 8.5,
 null, null, null, null, null,
 true,
 'Conte et al. 2015', '10.1080/02640414.2014.951873',
 array['half_court_offense','no_dribble','passing','high_intensity','ssg']),

-- 9. Vazquez-Guerrero Half-Court 5v5
('basketball', 'half_court_offense', '5v5 Half-Court SSG',
 'FC Barcelona protocol from Vazquez-Guerrero et al. 2018. Half-court 5v5 on ~14×15m. '
 'Lowest external load of the three court sizes (dist ~43.9 m/min, PL ~0.7/min, peak speed 15.2 km/h). '
 'Focus on half-court sets, pick-and-roll, post play. Good for tactical work with lower physical stress.',
 '5v5 · half-court',
 14, 15, 10, '3-4 bouts, variable duration', null,
 null, 0.70, null, null, null,
 null, null, null, null, null,
 false,
 'Vazquez-Guerrero et al. 2018', '10.1123/ijspp.2018-0103',
 array['half_court_offense','tactical','low_load','ssg']),

-- 10. Vazquez-Guerrero Half-Court + Transition 5v5
('basketball', 'fast_break', '5v5 Half-Court + Transition SSG',
 'FC Barcelona protocol: transition variant. After a score/turnover, play transitions to opposite half. '
 'Higher external load than pure half-court (dist ~56.6 m/min, PL ~0.9/min, peak speed 20.0 km/h). '
 'Develops both half-court execution and transition offense/defense. Highest peak speed of all formats.',
 '5v5 · half-court → transition',
 28, 15, 10, '3-4 bouts, variable duration', null,
 null, 0.90, null, null, null,
 null, null, null, null, null,
 false,
 'Vazquez-Guerrero et al. 2018', '10.1123/ijspp.2018-0103',
 array['fast_break','transition','medium_high','ssg']),

-- 11. Vazquez-Guerrero Full-Court 5v5 (Highest load)
('basketball', 'fast_break', '5v5 Full-Court SSG',
 'FC Barcelona full-court 5v5 protocol. Highest external load: dist ~63.4 m/min, PL ~1.0/min, '
 'peak speed ~18.0 km/h. Combines transition and half-court play. '
 'Use for high-load conditioning sessions that also train fast-break decisions.',
 '5v5 · full-court',
 28, 15, 10, '3-4 bouts, variable duration', null,
 null, 1.00, null, null, null,
 null, null, null, null, null,
 true,
 'Vazquez-Guerrero et al. 2018', '10.1123/ijspp.2018-0103',
 array['fast_break','full_court','high_load','ssg']),

-- ── Defense drills ──────────────────────────────────────────────────────────

-- 12. Atli 3v3 Full-Court (Defensive conditioning)
('basketball', 'defense', '3v3 Full-Court Man-to-Man',
 'From Atli et al. 2013. Full-court 3v3 (28×15m). ~85.6% HRmax. '
 'Full-court games produce significantly higher HR than half-court (76.3% HRmax). '
 'Man-to-man defense required. Great for developing full-court press and transition defense.',
 '3v3 · 4×4min · 2min rest',
 28, 15, 6, '4×4min, 2min passive rest', 4.0,
 null, null, 85.6, null, null,
 null, null, null, null, null,
 true,
 'Atli et al. 2013', '10.1519/JSC.0b013e318260f536',
 array['defense','full_court','man_to_man','conditioning','ssg']),

-- 13. Atli 3v3 Half-Court (Technical focus)
('basketball', 'defense', '3v3 Half-Court Man-to-Man',
 'From Atli et al. 2013. Half-court 3v3 (14×15m). ~76.3% HRmax. '
 'Significantly more shots (18.4 vs 11.7), rebounds (10.4 vs 6.0), and passes (16.8 vs 11.3) '
 'compared to full-court. Ideal for technical repetition with moderate physiological load.',
 '3v3 · 4×4min · 2min rest',
 14, 15, 6, '4×4min, 2min passive rest', 4.0,
 null, null, 76.3, null, null,
 null, null, null, null, null,
 false,
 'Atli et al. 2013', '10.1519/JSC.0b013e318260f536',
 array['defense','half_court','man_to_man','technical','ssg']),

-- 14. Montgomery Defensive Drills (Practice)
('basketball', 'defense', 'Defensive Practice Drill (Close-out)',
 'Based on Montgomery et al. 2010 data. Defensive close-out drills: '
 'Acc Load ~58 AU/min, Mean HR ~152, Peak HR ~170, VO2 ~45 mL/kg/min. '
 'Similar physical demands to offensive drills. Develops defensive footwork, positioning, communication.',
 'Defensive drill sequences',
 null, null, null, null, null,
 null, null, null, null, 7.0,
 null, null, null, null, null,
 true,
 'Montgomery et al. 2010', '10.1123/ijspp.5.1.75',
 array['defense','close_out','footwork','practice']),

-- ── Shooting drills ─────────────────────────────────────────────────────────

-- 15. Delextrat 2v2 Shooting-Emphasis SSG
('basketball', 'shooting', '2v2 Half-Width Shooting SSG',
 'From Delextrat & Martinez 2013. 2v2 on 28×7.5m (half-width court). '
 'HR ~90.6% HRpeak. Over 6 weeks, improved shooting skills +7.4% and upper body power +7.9%. '
 'Progressive overload: start 2×(2×3min), build to 2×(3×4min). Man-to-man, no free throws, scoring = make-it-take-it.',
 '2v2 · progressive (2-3 bouts × 3-4min)',
 28, 7.5, 4, '2-3 bouts × 3-4min, active rest (jog 15s)', 3.5,
 null, null, 90.6, null, null,
 null, null, null, null, null,
 true,
 'Delextrat & Martinez 2013', '10.1055/s-0033-1349107',
 array['shooting','progressive','conditioning','ssg']),

-- ── Warmup drills ───────────────────────────────────────────────────────────

-- 16. McCormick 3v3 Warm-up SSG
('basketball', 'warmup', '3v3 Light SSG (Warm-up)',
 'Adapted from McCormick et al. 2012 protocol. 3v3 short-duration games as extended warm-up. '
 'Mean HR ~166 bpm. Significantly more ball contacts per player (~26 OPB) than 5v5 (14 OPB). '
 'Use as 5-8min warm-up game to activate players with high ball involvement.',
 '3v3 · 1-2×4min',
 14, 15, 6, '1-2×4min, 1min rest', 4.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'McCormick et al. 2012', '10.1260/174795412X13462247010760',
 array['warmup','light','ball_contacts','ssg']),

-- 17. McCormick 5v5 Half-Court Warm-up
('basketball', 'warmup', '5v5 Half-Court Warm-up Scrimmage',
 'From McCormick et al. 2012. 5v5 half-court game as active warm-up. '
 'Mean HR ~165 bpm. Lower individual ball contacts than 3v3 but more game-realistic. '
 'Good option before match day or as final activation in warm-up.',
 '5v5 · 1×8min',
 14, 15, 10, '1×8min', 8.0,
 null, null, null, null, null,
 false,
 'McCormick et al. 2012', '10.1260/174795412X13462247010760',
 array['warmup','match_prep','ssg']),

-- ── Other / Special drills ──────────────────────────────────────────────────

-- 18. Conte 2v2 Intermittent (Recovery-friendly)
('basketball', 'other', '2v2 Intermittent SSG',
 'Intermittent 2v2 from Conte et al. 2016. 3×7min with 1min play / 1min rest within each bout. '
 'Lower physiological load than continuous format. '
 'Useful for recovery days or early-season introduction to SSG conditioning.',
 '2v2 · 3×7min (1min on / 1min off) · 2min rest',
 28, 15, 4, '3×7min (intermittent 1:1), 2min rest', 7.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Conte et al. 2016', '10.1016/j.jsams.2015.07.013',
 array['recovery','intermittent','low_intensity','ssg']),

-- 19. Montgomery 5v5 Half-Court Scrimmage (Practice)
('basketball', 'other', '5v5 Half-Court Scrimmage (Practice)',
 'Based on Montgomery et al. 2010. Standard 5v5 half-court scrimmage used in AIS basketball. '
 'Acc Load ~171 AU/min, Mean HR ~147, Peak HR ~171, VO2 ~40 mL/kg/min, RPE 9/10. '
 'Lower physical demands than live game play (30% less physical load). '
 'Good for tactical installation with controlled physiological stress.',
 '5v5 · 8-10min · half-court',
 14, 15, 10, '2-3 bouts × 8-10min', 9.0,
 null, null, null, null, 9.0,
 null, null, null, null, null,
 false,
 'Montgomery et al. 2010', '10.1123/ijspp.5.1.75',
 array['tactical','half_court','scrimmage','practice']),

-- ── Sansone et al. 2018 — 3v3 Half-Court with Catapult PlayerLoad ───────────
-- Unique data: actual Catapult OptimEye S5 PlayerLoad values for structured
-- 3v3 half-court SSGs with offense/defense tasks × long/short regimes.
-- 12 semi-professional Lithuanian basketball players.

-- 20. Sansone 3v3 Offense – Long Intermittent
('basketball', 'half_court_offense', '3v3 Offense SSG – Long Intermittent',
 'From Sansone et al. 2018. 3v3 half-court (14×15m), offense task only: team keeps possession and tries to score. '
 'Long intermittent regime: 3×4min bouts, 2min passive rest. '
 'Catapult PL 148.0±16.8 AU, %HRmax 91.1±4.1, Edwards TL 56.6±4.4 AU. '
 'Offense produces significantly higher PL and HR than defense. Highest overall workload of the four conditions.',
 '3v3 · 3×4min · 2min rest · offense only',
 14, 15, 6, '3×4min, 2min passive rest', 4.0,
 148.0, null, 91.1, null, null,
 null, null, null, null, null,
 false,
 'Sansone et al. 2018', '10.1519/JSC.0000000000002420',
 array['half_court_offense','offense','catapult','player_load','long_intermittent','ssg']),

-- 21. Sansone 3v3 Offense – Short Intermittent
('basketball', 'half_court_offense', '3v3 Offense SSG – Short Intermittent',
 'From Sansone et al. 2018. 3v3 half-court (14×15m), offense task only. '
 'Short intermittent regime: 6×2min bouts, 1min passive rest. '
 'Catapult PL 147.0±18.2 AU, %HRmax 90.0±5.6, Edwards TL 52.7±6.1 AU. '
 'Similar PL to long format but slightly lower HR and internal load. '
 'Short bouts with frequent rest allow higher work-rate per bout.',
 '3v3 · 6×2min · 1min rest · offense only',
 14, 15, 6, '6×2min, 1min passive rest', 2.0,
 147.0, null, 90.0, null, null,
 null, null, null, null, null,
 false,
 'Sansone et al. 2018', '10.1519/JSC.0000000000002420',
 array['half_court_offense','offense','catapult','player_load','short_intermittent','ssg']),

-- 22. Sansone 3v3 Defense – Long Intermittent
('basketball', 'defense', '3v3 Defense SSG – Long Intermittent',
 'From Sansone et al. 2018. 3v3 half-court (14×15m), defense task only: team defends and tries to regain possession. '
 'Long intermittent regime: 3×4min bouts, 2min passive rest. '
 'Catapult PL 137.1±15.5 AU, %HRmax 89.4±4.2, Edwards TL 52.9±5.9 AU. '
 'Defense produces lower PL than offense but still high cardiovascular demand. '
 'Develops defensive effort, communication, and help defense under fatigue.',
 '3v3 · 3×4min · 2min rest · defense only',
 14, 15, 6, '3×4min, 2min passive rest', 4.0,
 137.1, null, 89.4, null, null,
 null, null, null, null, null,
 false,
 'Sansone et al. 2018', '10.1519/JSC.0000000000002420',
 array['defense','catapult','player_load','long_intermittent','ssg']),

-- 23. Sansone 3v3 Defense – Short Intermittent
('basketball', 'defense', '3v3 Defense SSG – Short Intermittent',
 'From Sansone et al. 2018. 3v3 half-court (14×15m), defense task only. '
 'Short intermittent regime: 6×2min bouts, 1min passive rest. '
 'Catapult PL 137.9±14.6 AU, %HRmax 89.8±4.2, Edwards TL 53.3±5.3 AU. '
 'Virtually identical PL and HR to long regime for defense. '
 'Short bouts useful when targeting high-intensity defensive reps with recovery.',
 '3v3 · 6×2min · 1min rest · defense only',
 14, 15, 6, '6×2min, 1min passive rest', 2.0,
 137.9, null, 89.8, null, null,
 null, null, null, null, null,
 false,
 'Sansone et al. 2018', '10.1519/JSC.0000000000002420',
 array['defense','catapult','player_load','short_intermittent','ssg']),

-- ── Krause, Meyer & Meyer 2008 — Basketball Skills & Drills (3rd Ed.) ─────
-- Coaching protocol drills with no physiological metrics.
-- Metrics can be added later when teams have IMA (Catapult) data blocks.
-- Source: Krause J, Meyer D, Meyer J. Basketball Skills & Drills.
--         3rd ed. Champaign, IL: Human Kinetics; 2008.

-- ── Ballhandling & Passing ────────────────────────────────────────────────────

-- 24. Ballhandling Drills (Figure-Eight & Blur)
('basketball', 'warmup', 'Ballhandling Drills – Figure-Eight & Blur',
 'Individual ball-control warm-up from Krause et al. 2008, Ch.3. '
 'Figure-eight speed dribble in and out between legs (goal: 20 reps in 1 min). '
 'Blur drill: flip ball between hands front-to-back for 30s (Excellent ≥81 reps). '
 'Develops hand speed, feel, and confidence with the ball. Use as daily warm-up.',
 'Individual · 30s each variation',
 null, null, 1, '5-8 variations × 30s each', 5.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.3 pp.68-70', null,
 array['ballhandling','warmup','individual','ball_control']),

-- 25. Line Drill: Passing and Catching
('basketball', 'other', 'Line Drill – Passing and Catching',
 'Team passing fundamentals drill from Krause et al. 2008, Ch.3. '
 'Four lines behind baseline, coach at top of key directs. '
 'Progressive passes: chest (air/bounce), push/flick (right/left), overhead, baseball. '
 'Emphasizes proper footwork, follow-through, and catching with two hands.',
 'Team lines · 4 lines × half court',
 14, 15, 12, 'Continuous, 8-10min', 10.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.3 p.69', null,
 array['passing','catching','fundamentals','team']),

-- 26. 2-on-1 Keepaway Passing
('basketball', 'other', '2-on-1 Keepaway Passing Drill',
 'From Krause et al. 2008, Ch.3. Groups of three: two offense 15-18 ft apart, '
 'one defender between. Rotate defender every 30s or on interception. '
 'Progression: stationary defender → close/away positioning → live defense. '
 'Teaches quick, accurate passing under pressure with vertical fakes.',
 '2v1 · groups of 3 · 15-18ft spacing',
 null, null, 3, 'Rotate every 30s, 5-8min total', 6.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.3 p.70', null,
 array['passing','pressure','decision_making','small_group']),

-- ── Shooting ──────────────────────────────────────────────────────────────────

-- 27. Field-Goal Progression (Daily)
('basketball', 'shooting', 'Field-Goal Progression (Daily Warm-Up)',
 'Self-teaching shooting warm-up from Krause et al. 2008, Ch.4. '
 'Sequential progression: ball slaps, form shots, soft touch at 5 spots, '
 'shooting from pass (3pt arc CW/CCW), shooting from dribble. '
 'Five reps each option. Use daily to groove technique before practice.',
 'Individual · 1 ball per player · half court',
 14, 15, 1, '5 reps per option, ~15-20min', 18.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.4 pp.105-108', null,
 array['shooting','warmup','technique','daily','progression']),

-- 28. Soft Touch / Killer Shooting
('basketball', 'shooting', 'Soft Touch (Killer) Shooting Drill',
 'Close-range shooting mechanics drill from Krause et al. 2008, Ch.4. '
 'Five shots at five spots inside free-throw lane. '
 'Beginners: make 1 per spot; Intermediate: 2-3; Advanced: swish only. '
 'Focus: full focus, sit into shot, full follow-through. Recommended as daily warm-up.',
 'Individual · 5 spots × 5 shots · inside FT lane',
 null, null, 1, '25 shots total, ~5-8min', 7.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.4 pp.106-107', null,
 array['shooting','close_range','technique','warmup']),

-- 29. Groove It Shooting
('basketball', 'shooting', 'Groove It Shooting Drill',
 'Shot consistency drill from Krause et al. 2008, Ch.4. '
 'At each of 5+ spots, make minimum 5/10 (preferably 7/10) before moving on. '
 'Start inside arc, then move to five 3pt locations. '
 'Builds range and confidence through volume repetition at each spot.',
 'Individual · 5+ spots · half court',
 14, 15, 1, '50-70 shots total, ~10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.4 p.107', null,
 array['shooting','spot_shooting','range','volume']),

-- 30. Layup Progression Shooting
('basketball', 'shooting', 'Layup Progression Drill',
 'Progressive layup development from Krause et al. 2008, Ch.4. '
 'Stages: line drill no ball → carry ball → one-line dribble layups → '
 'two-line layups → dribble chase layups → two-minute team layups. '
 'Emphasizes opposition (jumping foot + shooting hand), high jump, early target, use backboard.',
 'Team · 1 ball per player (when possible)',
 28, 15, 12, 'Progressive stages, 10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.4 pp.103-105', null,
 array['shooting','layups','progression','conditioning','team']),

-- 31. Timed Layups
('basketball', 'shooting', 'Timed Layups (V-Layups & Reverse-V)',
 'Competitive layup drill from Krause et al. 2008, Ch.5. '
 'V-layups: start right elbow, drive right layup, grab ball, dribble left past FT line, '
 'left-hand layup, repeat 30-60s. Record makes. '
 'Reverse-V: cross rim to other side layup. Develops ballhandling, finishing, and conditioning.',
 'Individual · FT lane · timed 30-60s',
 null, null, 1, '30-60s per set, 2-3 sets', 5.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.5 p.131', null,
 array['shooting','layups','timed','conditioning','competitive']),

-- 32. Perimeter Game (13 Moves)
('basketball', 'shooting', 'Perimeter Game – 13 Moves (Score 64)',
 'Comprehensive perimeter skills competition from Krause et al. 2008, Ch.5. '
 'From 3 or 5 spots: 13 moves including field goals, drives to rim/pull-up, '
 'quick-stop power shots, hop-back shots, jab steps, and free throws. '
 'Swish rules: swish/net = +1, rim hit = 0, miss = -1. Top score = 64. '
 'Complete individual workout covering all perimeter offensive skills.',
 'Individual · 3-5 spots · half court',
 14, 15, 1, '~20-30min per player', 25.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.5 pp.131-132', null,
 array['shooting','perimeter','complete_workout','competitive','scoring']),

-- ── Post Play ─────────────────────────────────────────────────────────────────

-- 33. Mikan Drill
('basketball', 'shooting', 'Mikan Drill (Post Layups)',
 'Classic post finishing drill from Krause et al. 2008, Ch.6. '
 'Named after George Mikan. Alternating layups from both sides of the basket '
 'using proper footwork. Develops touch, coordination, and ambidexterity close to the rim. '
 'Progression: basic alternating → with shot fake → reverse layups → hook shots.',
 'Individual · under basket',
 null, null, 1, 'Continuous, 2-3min per set', 3.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.6 p.152', null,
 array['shooting','post','layups','footwork','mikan']),

-- 34. Post Progression Drill
('basketball', 'half_court_offense', 'Post Progression Drill',
 'Offensive post moves development from Krause et al. 2008, Ch.6. '
 'Progressive sequence of inside scoring moves: drop step baseline, '
 'drop step middle, jump hook, up-and-under, turnaround jumper. '
 'All levels. Develops complete post scoring repertoire from low/medium post.',
 'Individual or pairs · low/medium post',
 null, null, 2, '5 reps each move, ~10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.6 p.149', null,
 array['post','offense','inside_moves','progression']),

-- 35. 1-on-1 Post Cutthroat
('basketball', 'half_court_offense', '1-on-1 Post Cutthroat',
 'Competitive post play drill from Krause et al. 2008, Ch.6. '
 'Live 1-on-1 from the post: offense works to score, defense works to stop. '
 'Loser stays on defense. Develops post moves under real defensive pressure, '
 'sealing, reading the defender, and finishing through contact.',
 '1v1 · live · post area',
 null, null, 3, 'Continuous rotation, 8-12min', 10.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.6 p.154', null,
 array['post','1v1','competitive','live_play','cutthroat']),

-- ── Individual Defense ────────────────────────────────────────────────────────

-- 36. Stance and Steps Progression
('basketball', 'defense', 'Defensive Stance & Steps Progression',
 'Foundational defensive footwork from Krause et al. 2008, Ch.7. '
 'Teaches defensive quick stance and push-step (step-slide) technique. '
 'Progression: stance holds → lateral slides → diagonal slides → '
 'zigzag with direction changes. ATTACK acronym: Attitude, Teamwork, Tools, '
 'Anticipation, Concentration, Keep in stance.',
 'Individual line drill · full court',
 28, 15, null, 'Progressive, 8-12min', 10.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.7 pp.147-155', null,
 array['defense','footwork','stance','slides','fundamental']),

-- 37. Closeout Drills 1v1 → 4v4
('basketball', 'defense', 'Closeout Drills – 1v1 to 4v4 Progression',
 'Progressive closeout drill from Krause et al. 2008, Ch.7. '
 'Start 1v1: defender closes out on off-ball player receiving pass. '
 'Progress to 2v2, 3v3, 4v4 with all perimeter outside moves. '
 'Develops closing speed, balance on arrival, and on-ball technique after closeout.',
 'Progressive 1v1 → 4v4 · half court',
 14, 15, 8, 'Progressive, 10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.7 p.181', null,
 array['defense','closeout','progression','perimeter','live_play']),

-- 38. On-Ball / Off-Ball 2-on-2 Drill
('basketball', 'defense', 'On-Ball & Off-Ball 2-on-2 Defense',
 'Help-and-recover defensive drill from Krause et al. 2008, Ch.7. '
 'Two offensive, two defensive players. Quick adjustment between on-ball '
 'and off-ball positions while defending penetration (help and decide situations). '
 'Teaches ball-defender-player positioning, open/closed stances, and communication.',
 '2v2 · half court',
 14, 15, 4, 'Continuous rotation, 8-10min', 9.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.7 p.179', null,
 array['defense','help_defense','2v2','on_ball','off_ball']),

-- 39. Defensive Slide Drill
('basketball', 'defense', 'Defensive Slide Drill',
 'Individual defensive movement drill from Krause et al. 2008, Ch.7. '
 'Players practice lateral push-step slides maintaining defensive stance. '
 'Three explosive push steps to prevent dribble penetration in one direction, '
 'then run-to-recover and repeat. Verbal cue: push step and slide, low and wide.',
 'Individual · sideline to sideline',
 null, 15, null, '6-8 reps × 30s, rest 30s', 6.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.7 p.181', null,
 array['defense','slides','footwork','conditioning','individual']),

-- ── Rebounding ────────────────────────────────────────────────────────────────

-- 40. 2-and-2 Capture and Chin Rebound
('basketball', 'other', '2-and-2 Capture & Chin Rebound Drill',
 'Basic rebounding technique drill from Krause et al. 2008, Ch.8. '
 'Two-foot jump, two-hand grab (2-and-2). Capture the ball at peak of jump, '
 'immediately chin it (elbows out, fingers up) for protection. '
 'Players toss ball off backboard, jump to grab at highest point, chinit on landing. '
 'Develops timing, jumping technique, and ball protection after rebound.',
 'Individual or pairs · under basket',
 null, null, 2, 'Continuous, 5-8min', 6.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.8 pp.180-182', null,
 array['rebounding','technique','chinit','individual']),

-- 41. Closeout and Blockout Drill
('basketball', 'other', 'Closeout & Blockout Rebounding Drill',
 'Team rebounding competition from Krause et al. 2008, Ch.8. '
 '1v1, 2v2, 3v3 rebounding situations with on-ball and off-ball blockouts. '
 'Defender must closeout, make contact (front or rear turn), box out, '
 'then pursue the ball. Develops the full defensive rebounding sequence.',
 'Progressive 1v1 → 3v3 · basket area',
 null, null, 6, 'Progressive, 10-12min', 11.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.8 p.206', null,
 array['rebounding','blockout','closeout','competitive','progression']),

-- 42. Cutthroat Rebounding 3v3 / 4v4
('basketball', 'other', 'Cutthroat Rebounding 3v3 / 4v4',
 'Competitive rebounding game from Krause et al. 2008, Ch.8. '
 'Offense and defense fight for rebounds. Offense tries to score on putbacks, '
 'defense tries to secure and outlet. Continuous play with rotation. '
 'Develops aggressiveness, positioning, and physicality on the boards.',
 '3v3 or 4v4 · basket area',
 null, null, 8, 'Continuous, 8-10min', 9.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.8 p.209', null,
 array['rebounding','competitive','cutthroat','physicality','live_play']),

-- 43. Rebound and Outlet Drill
('basketball', 'fast_break', 'Rebound & Outlet Pass Drill',
 'Transition initiation drill from Krause et al. 2008, Ch.8. '
 'Defender takes defensive rebound off backboard, makes outlet pass to guard '
 'positioned between FT line and half court on the rebound side. '
 'Guard receives and pushes ball up court. Develops the defensive-rebound-to-fast-break connection.',
 'Groups of 3-4 · full court',
 28, 15, 4, 'Continuous rotation, 8-10min', 9.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.8 p.205', null,
 array['rebounding','outlet_pass','transition','fast_break']),

-- ── Team Offense ──────────────────────────────────────────────────────────────

-- 44. Skeleton Offense 5-on-0
('basketball', 'half_court_offense', 'Skeleton Offense Drill – 5-on-0',
 'Team offensive formation drill from Krause et al. 2008, Ch.9. '
 'Five players practice formations, plays, movements, and individual assignments '
 'with no defenders. Initiated from backcourt, frontcourt, out-of-bounds, and free throws. '
 'Complete each possession with a score, rebound each shot, and transition to half court.',
 '5v0 · half court',
 14, 15, 5, 'Continuous, 10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 false,
 'Krause, Meyer & Meyer 2008, Ch.9 p.229', null,
 array['team_offense','formation','walkthrough','5v0']),

-- 45. Team Offense-Defense 5-on-5
('basketball', 'other', 'Team Offense-Defense Drill – 5-on-5',
 'Progressive team play drill from Krause et al. 2008, Ch.9. '
 'Full 5v5 practice progressing from dummy defense → no-hands defense → '
 'game-like with all defensive tactics. '
 'Play continues until offense transitions to other end (half to full court). '
 'Options: half court only, make-it-take-it, half-to-full transitions.',
 '5v5 · half court or full court',
 28, 15, 10, 'Continuous, 15-20min', 18.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.9 p.229', null,
 array['team_offense','team_defense','5v5','scrimmage','progressive']),

-- 46. Blitz Fast-Break Drill
('basketball', 'fast_break', 'Blitz Fast-Break Drill (2v1 / 3v2)',
 'Continuous fast-break drill from Krause et al. 2008, Ch.9. '
 'Two teams at half court. 2-on-1: ball crosses half, defender plays outnumbered, '
 'helper sprints from center circle. After score/stop, defenders fast-break other way. '
 'Progress to 3-on-2 three-lane break. Drill runs until one team reaches 10 baskets.',
 '2v1 → 3v2 · full court · two teams',
 28, 15, 12, 'Continuous to 10 baskets, ~10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.9 pp.230-231', null,
 array['fast_break','transition','2v1','3v2','competitive','conditioning']),

-- 47. Transition Fast-Break Drill
('basketball', 'fast_break', 'Transition Fast-Break Drill',
 'Structured-start transition drill from Krause et al. 2008, Ch.9. '
 'Coach passes to any offensive player and calls 1-2 names as defenders. '
 'Called players touch baseline before sprinting to defend, creating outnumbered break. '
 'Offensive team attacks for 1-3 transitions. Develops reading the break and defensive recovery.',
 '5v5 · full court · coach initiated',
 28, 15, 10, '1-3 transitions per rep, 10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.9 p.232', null,
 array['fast_break','transition','outnumbered','decision_making']),

-- ── Team Defense ──────────────────────────────────────────────────────────────

-- 48. Shell Drill 3v3 / 4v4
('basketball', 'defense', 'Shell Drill – 3v3 / 4v4',
 'Foundational team defense drill from Krause et al. 2008, Ch.10. '
 'Three or four offensive players pass and cut while defenders practice '
 'on-ball, denial, help, and rotation principles. '
 'The key team defense drill for teaching two-person and three-person defensive play.',
 '3v3 or 4v4 · half court',
 14, 15, 8, 'Continuous, 10-15min', 12.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.10 p.243', null,
 array['defense','team_defense','shell','help_defense','rotation']),

-- 49. Half-Court to Full-Court Defense 3v3 → 5v5
('basketball', 'defense', 'Half-Court to Full-Court Defense Drill',
 'Progressive team defense drill from Krause et al. 2008, Ch.10. '
 'Starts as half-court defense, then adds transition to offense and back. '
 'Progresses from 3v3 → 4v4 → 5v5. Develops half-court defensive principles '
 'combined with offensive-to-defensive transition in a continuous flow.',
 '3v3 → 5v5 · half court to full court',
 28, 15, 10, 'Progressive, 12-15min', 14.0,
 null, null, null, null, null,
 null, null, null, null, null,
 true,
 'Krause, Meyer & Meyer 2008, Ch.10 p.244', null,
 array['defense','team_defense','transition','progression','full_court']);

-- Mark existing football templates as football (safe: they already default to 'football')
update public.drill_library_public
  set sport = 'football'
  where sport is null or sport = '';

-- 6) Sport-aware RLS policy for drill_library_public SELECT
-- Football drills: visible to all authenticated users
-- Basketball drills: visible to staff (admin) OR coaches on a basketball team
drop policy if exists drill_library_public_select on public.drill_library_public;

create policy drill_library_public_select on public.drill_library_public
  for select
  using (
    case sport
      when 'football' then
        auth.role() = 'authenticated'
      when 'basketball' then
        exists (select 1 from staff_users su where su.user_id = auth.uid())
        or
        exists (
          select 1
          from coach_teams ct
          join teams t on t.id = ct.team_id
          where ct.coach_id = auth.uid()
            and t.sport = 'basketball'
        )
      else
        auth.role() = 'authenticated'
    end
  );
