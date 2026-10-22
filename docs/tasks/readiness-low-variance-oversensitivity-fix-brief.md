# Fix: low-variance responders flag red on sub-noise wellness dips

> **STATUS (31 Aug): SUPERSEDED — already fixed in production.** The colour engine
> `mp_set_baseline_z_before_pi` already floors the SD: `z = (total − mean) / greatest(sd, 1.5)`, with
> bands green > -0.5 / yellow > -1.0 / else red (live ~30 Aug). And `mp_apply_performance_intelligence`
> already gates `pi_sustained_low` on a -3-point absolute floor. Anton Logi's reds are pre-floor history
> (`baseline_sd_floor: null` on his rows); post-floor, total 20 → z ≈ -0.81 → yellow. No code change
> needed. The analysis below is kept for reference; the SD-floor recommendation it makes is what shipped.

## The problem (grounded)
Players who self-report very consistently get flagged red/yellow for tiny, objectively-fine dips —
because the personal-norm z-score divides by a personal SD that is too small to be meaningful.

**Worked example — Anton Logi Luðvíksson (Breiðablik, CM).** Over 60 days: total_score **mean 20.83,
SD 0.91** (range 19–23 out of 25). Yet **10 red + 10 yellow of 59 days (34%)**. His wellness is
objectively good; the reds are days he scored 19–20 (≈1–2 SD below his own tight norm).

## Root cause (exact)
The live color + `flag_reason` are written by the Postgres function
**`public.mp_apply_performance_intelligence`** (produces `pi_acute_drop`, `pi_sustained_low`, etc.).
Its thresholds:

- `t_drop_z := -1.25` (acute drop, z) **OR** `t_drop_delta_pts := -4` (acute drop, absolute points) —
  acute drop already has an **absolute-points floor**. Good.
- `t_sustain_avg_z := -0.75` — **sustained low = 3-day avg z ≤ -0.75, purely z-based, with NO SD floor
  and NO absolute-points floor.** ← the culprit.

With SD = 0.91, a 3-day mean of ~20 gives avg z ≈ (20 − 20.83)/0.91 ≈ **-0.9 < -0.75** → `pi_sustained_low`
→ red, even though the drop is under 1 point on a 25-point scale. The parallel TS engine
`src/lib/micropulse/baselines/index.ts` (`flagAgainstBaseline`, yellow at 1.0 SD / red at 2.0 SD) has the
same gap: it only guards `sd === 0`, not "sd tiny".

## The fix — an SD floor + an absolute-change floor on sustained-low
Mirror the discipline already used for acute-drop (relative OR absolute) and for the CMJ/HRex work
(a change must clear BOTH a relative threshold AND a smallest-worthwhile-change). Apply to the
z-computation so a tight personal norm can't manufacture large z:

1. **SD floor (both engines).** Use `sd_eff = greatest(sd, v_sd_floor)` in every z. For the 25-point
   `total_score`, `v_sd_floor ≈ 1.25–1.5` points (~half a wellness question). This alone pulls Anton's
   -0.9 toward ≈ -0.55, below the flag.
2. **Absolute-change floor on sustained-low** (add to the existing z gate as AND): require the 3-day
   avg to be at least `t_sustain_delta_pts` below the personal mean — e.g. **-2 to -3 points** — in
   addition to `avg_z ≤ -0.75`. Directly stops "1-point wobble = sustained low", exactly as
   `t_drop_delta_pts := -4` protects acute-drop.

Either fixes Anton; do **both** for robustness. Add the new constants at the top of the function next
to the existing `t_*` thresholds, and pass an SD floor into `flagAgainstBaseline` in the TS lib for
parity (dashboards vs live flag must agree — CLAUDE.md principle #1).

## Also: a low-variability data-quality signal (recommended)
Anton's entries are near-identical day to day (SD 0.91, many repeated rows). That is often a sign of
**auto-filled / low-effort check-ins** — which makes any deviation look large. Add a soft signal when
a player's 28-day check-in SD is below a floor (e.g. < 1.0): surface a quiet "low check-in variability
— norm may be unreliable" note (data-quality, `dataQuality.ts`), and optionally widen the flag band
further for that player. Never punish the player; just flag the norm's reliability. This is honest and
prevents trusting a norm the player didn't really vary.

## Guardrails
- **Still catch genuine drops.** A real 22→16 (≈-6 pts, ~z far below) must still flag — the floors only
  suppress sub-noise wobble, not real declines. Keep the acute-drop -4pt path intact.
- **Never touch the canonical color contract** beyond this threshold change — same engine, same
  `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`, just less trigger-happy.
- **Migration discipline:** ship as a new migration that `create or replace`s
  `mp_apply_performance_intelligence`; save the `.sql` under `supabase/migrations/` with a timestamp.
- **Validate squad-wide flag-rate** before/after (mirror the over-sensitive-yellow work, task #16):
  red+yellow rate should drop for tight-norm players without masking real drops for others. Spot-check
  a genuinely fatigued player still flags.

## Immediate coach-side note (no code)
For Anton specifically today: his self-reports have drifted from steady 22s to 20s over ~2 weeks — a
**mild** relative dip, not poor wellness (still 20/25). If real, a quick word on sleep/stress confirms
it; if he's auto-filling, it's noise. A logged coach override is the interim lever until the floor
ships.

Ref: `mp_apply_performance_intelligence` (DB fn — `t_sustain_avg_z`, `t_drop_*`),
`src/lib/micropulse/baselines/index.ts` (`flagAgainstBaseline`), `dataQuality.ts`, task #16
(over-sensitive yellow), CLAUDE.md (canonical color = one source).
