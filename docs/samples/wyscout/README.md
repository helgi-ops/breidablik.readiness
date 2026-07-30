# Wyscout export — parser spec for Adapter A (Phase 2)

Real Advanced Search **player-list** exports from Hudl Wyscout (Breiðablik, Emil's login), captured 2026-07-30. Build the xlsx parser against THESE files. Two shapes are provided; the parser must be tolerant of column count/order and read the long tail into `metrics` jsonb.

## Files

- `wyscout-advanced-search-GENERAL-16col.xlsx` — default DISPLAY=General (16 cols).
- `wyscout-advanced-search-ALLCOLUMNS-115col.xlsx` — DISPLAY column picker → **All columns** (115 cols). This is the target rich export.

Both: **one sheet named `Search results (55)`**, row 0 = headers, 55 data rows (senior + U19/U17 mixed).

## Row shape & filtering

- `Player` = abbreviated `"<Initial>. <Surname>"` (e.g. `"A. Bjarnason"`, `"G. Snær Hallsson"`). NOT the full name.
- `Team` = `"Breidablik"` for the senior squad; youth rows have `"Breidablik U19"` / `"Breidablik U17"` / `"Breidablik II U19"`. **Filter Team == "Breidablik" for the senior side** (32 rows here).
- `Position` uses Wyscout codes (LAMF, RB, RCMF…), not MicroPulse's (LB, CM…).

## Player name matching (proven — 22/22 senior mapped)

Normalise both sides (`ð→d`, `þ→th`, `æ→ae`, strip remaining diacritics, lowercase), then match on **(first-initial, last token)** against `players.full_name` for the team. Exact key hit → auto-map. This mapped all 22 senior players with football minutes; the 10 unmatched were youth / 0-minute (e.g. `Þ. Andersen Willumsson`, `B. Freyr Ágústsson`). Surface fuzzy/ambiguous for review; keep unmatched with `player_id = null` (never guess). Persist mappings (brief's `stat_player_mapping`).

## Target table (ALREADY EXISTS — do not recreate)

`public.player_season_stats` is already live with this shape: `team_id, player_id, season, competition, minutes, goals, assists, shots, shots_on_target, passes, pass_accuracy_pct, key_passes, duels_won, xg, rating, metrics jsonb, source, source_ref, source_player_ref, wyscout_player_name, synced_at`. Unique key: **(team_id, season, source, source_player_ref)** — use it for idempotent upsert. `source='wyscout_excel'`, `source_ref`=file name, `source_player_ref`=stable per-player ref.

### Column→schema mapping notes (caveats that bit me)

- Promote: `Minutes played→minutes`, `Goals→goals`, `Assists→assists`, `xG→xg`, `Shots→shots`, `Accurate passes, %→pass_accuracy_pct`. Derive `shots_on_target = round(Shots × 'Shots on target, %'/100)`.
- **Per-90 vs totals:** this export gives `Passes per 90`, `Key passes per 90` etc. as PER-90, not totals — so leave the `passes`/`key_passes` TOTAL columns null (or multiply by minutes/90 if you want an estimate) and keep the per-90 values in `metrics`. `Shots` IS a total.
- Everything else → `metrics` jsonb keyed by the exact Wyscout header string.

## Already done (so you can skip / build on it)

- **Phase 1 (schema): DONE** — table exists (above).
- **Seed loaded:** I already upserted **21 senior players** from the 115-col file into `player_season_stats` (source='wyscout_excel', source_ref='Search results (1).xlsx') with core columns + ~11 headline metrics in `metrics`. Verified it joins cleanly to `players` and sits beside GPS/IMA. Your parser should reproduce/extend this to the full 115 metrics and add the upload UI + mapping-review tray + tests.
- **Phase 4 (Wyscout API): pending** — needs the club's Wyscout Data API docs + `WYSCOUT_API_*` Supabase secret.

## Full 115-column header list (ALLCOLUMNS file)

0. `Player`
1. `Team`
2. `Team within selected timeframe`
3. `Position`
4. `Age`
5. `Market value`
6. `Contract expires`
7. `Matches played`
8. `Minutes played`
9. `Goals`
10. `xG`
11. `Assists`
12. `xA`
13. `Duels per 90`
14. `Duels won, %`
15. `Birth country`
16. `Passport country`
17. `Foot`
18. `Height`
19. `Weight`
20. `On loan`
21. `Successful defensive actions per 90`
22. `Defensive duels per 90`
23. `Defensive duels won, %`
24. `Aerial duels per 90`
25. `Aerial duels won, %`
26. `Sliding tackles per 90`
27. `PAdj Sliding tackles`
28. `Shots blocked per 90`
29. `Interceptions per 90`
30. `PAdj Interceptions`
31. `Fouls per 90`
32. `Yellow cards`
33. `Yellow cards per 90`
34. `Red cards`
35. `Red cards per 90`
36. `Successful attacking actions per 90`
37. `Goals per 90`
38. `Non-penalty goals`
39. `Non-penalty goals per 90`
40. `xG per 90`
41. `Head goals`
42. `Head goals per 90`
43. `Shots`
44. `Shots per 90`
45. `Shots on target, %`
46. `Goal conversion, %`
47. `Assists per 90`
48. `Crosses per 90`
49. `Accurate crosses, %`
50. `Crosses from left flank per 90`
51. `Accurate crosses from left flank, %`
52. `Crosses from right flank per 90`
53. `Accurate crosses from right flank, %`
54. `Crosses to goalie box per 90`
55. `Dribbles per 90`
56. `Successful dribbles, %`
57. `Offensive duels per 90`
58. `Offensive duels won, %`
59. `Touches in box per 90`
60. `Progressive runs per 90`
61. `Accelerations per 90`
62. `Received passes per 90`
63. `Received long passes per 90`
64. `Fouls suffered per 90`
65. `Passes per 90`
66. `Accurate passes, %`
67. `Forward passes per 90`
68. `Accurate forward passes, %`
69. `Back passes per 90`
70. `Accurate back passes, %`
71. `Lateral passes per 90`
72. `Accurate lateral passes, %`
73. `Short / medium passes per 90`
74. `Accurate short / medium passes, %`
75. `Long passes per 90`
76. `Accurate long passes, %`
77. `Average pass length, m`
78. `Average long pass length, m`
79. `xA per 90`
80. `Shot assists per 90`
81. `Second assists per 90`
82. `Third assists per 90`
83. `Smart passes per 90`
84. `Accurate smart passes, %`
85. `Key passes per 90`
86. `Passes to final third per 90`
87. `Accurate passes to final third, %`
88. `Passes to penalty area per 90`
89. `Accurate passes to penalty area, %`
90. `Through passes per 90`
91. `Accurate through passes, %`
92. `Deep completions per 90`
93. `Deep completed crosses per 90`
94. `Progressive passes per 90`
95. `Accurate progressive passes, %`
96. `Conceded goals`
97. `Conceded goals per 90`
98. `Shots against`
99. `Shots against per 90`
100. `Clean sheets`
101. `Save rate, %`
102. `xG against`
103. `xG against per 90`
104. `Prevented goals`
105. `Prevented goals per 90`
106. `Back passes received as GK per 90`
107. `Exits per 90`
108. `Aerial duels per 90`
109. `Free kicks per 90`
110. `Direct free kicks per 90`
111. `Direct free kicks on target, %`
112. `Corners per 90`
113. `Penalties taken`
114. `Penalty conversion, %`
