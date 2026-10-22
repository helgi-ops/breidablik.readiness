# Deploy brief — Single Match Analysis: own-team perspective fix

## What was wrong

In **Single Match Analysis**, when a club uploaded a match-report PDF, the AI briefing
centred on the **home / first-named** team as "our team" and labelled the coach's own
team the **opponent**. Reproduction: HK uploaded `Völsungur - HK 3-2.pdf` (title
`Völsungur V HK`) and got *"The opponent — HK started the game controlling the ball…"* —
i.e. it treated Völsungur as "us" and HK as the opponent.

Root cause: `POST /api/coach/match-report-read` never told the model **which club is the
coach's own team**, so the model defaulted to the report's first-named side.

## The fix (already applied in the working tree)

One file changed — no schema change, no migration:

- **`src/app/api/coach/match-report-read/route.ts`**
  1. `getCoachTeam()` now also fetches the coach's club name from `teams`
     (`select("name, club_short_name")` by `team_id`) — the same query
     `sb-match-summary/upload` already uses.
  2. The user message to the model now states the own club by name and instructs it to
     **centre the briefing on that team, match it to the home or away side by name, and
     label the other team the opponent** (never assume first-named = own).
  3. The `SYSTEM` prompt gains a hard "PERSPECTIVE" rule and `wentWell` is scoped to the
     coach's own team.

Falls back to neutral wording if the club name isn't set or isn't found in the report.

## Verification done

- `npx eslint src/app/api/coach/match-report-read/route.ts` → clean.
- `npx tsc --noEmit` → no errors referencing the file.
- The `teams.name` / `teams.club_short_name` query is identical to the one already live in
  `sb-match-summary/upload/route.ts`, so the columns are known-valid.

## Deploy steps

1. Stage **only** the changed file (repo convention: never `git add -A`):
   ```
   git add src/app/api/coach/match-report-read/route.ts
   git commit -m "fix(match-analysis): centre single-match briefing on the coach's own team, not the first-named side"
   ```
2. Push to `main` (branch checkpoints are managed in your VS Code terminal; do not amend or
   force-push main). Vercel auto-deploys via `vercel.json`; CI runs vitest.
3. No migration to apply (no DB change).

## Post-deploy — refresh the already-saved briefing

Briefings are cached per `(team_id, match_date)` in `match_report_reads`, so HK's existing
wrong briefing stays until regenerated. After deploy: **HK re-uploads the same match-report
PDF** (or re-runs the read) for that match — it overwrites the saved read with the corrected,
HK-centred version.

## Acceptance check

Signed in as **HK**, upload `Völsungur - HK 3-2.pdf` in Single Match Analysis →
- headline / summary / "went well" / "to improve" / key players are about **HK**;
- the **opponent** section is about **Völsungur**;
- works whether the own club is the home or the away side.

## Follow-up (optional, not blocking)

Confirm the same name-based own-team resolution is used everywhere a single match is
summarised. The **CSV** path (`sb-match-summary/upload`) already resolves own-vs-opponent by
name and is correct; this fix brings the **PDF** briefing path in line with it.
