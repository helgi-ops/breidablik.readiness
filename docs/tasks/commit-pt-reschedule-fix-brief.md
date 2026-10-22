# Commit the PT session-reschedule fix

**For:** Claude Code (runs in the real repo, so it can do git reliably — the Cowork
sandbox cannot; its earlier attempt left the stale lock referenced below).

**Goal:** commit ONE already-made change — nothing else in the working tree.

## The change to commit

One modified file, already written and verified (tsc clean; the only eslint warning
is a pre-existing unused `env`, not from this change):

```
src/app/api/trainer/client/[id]/session-reschedule/route.ts
```

**What it does:** a trainer can now reschedule a session to a date *after* the plan's
current `end_date`. The old guard rejected it as "outside the plan" (this is what
Helena hit trying to push a combo pull/push lift into next week). The trainer path now
extends the plan's `end_date` to cover the new day. Moving *before* the plan start is
still refused, and the **client self-service route is unchanged** — extending a plan is
a coach decision, not the athlete's. That asymmetry is intentional.

## Steps

1. **Clear the stale git lock if present** (the sandbox created it and could not remove
   it — "Operation not permitted"). Only remove it after confirming no git process /
   open commit editor is actually running:

   ```
   rm -f .git/index.lock
   ```

2. **Stage ONLY this file** — never `git add -A`. The working tree has ~137 other
   uncommitted changes (the day's Catapult ingestion fixes, RTT Gabbett-2020 citation,
   the data-quality / provisional-baseline / match-minutes / stride-length engines).
   Those are a separate decision and must NOT be swept into this commit:

   ```
   git add "src/app/api/trainer/client/[id]/session-reschedule/route.ts"
   ```

3. **Verify the staged diff is exactly one file** before committing:

   ```
   git status --short
   git diff --cached --stat
   ```

   Expect a single file. If anything else is staged, unstage it (`git restore --staged <f>`).

4. **Commit** with this message (end with the Co-Authored-By line):

   ```
   Fix: trainer can reschedule a session past the plan end

   Moving a session later than the plan currently runs is a normal coach
   decision (e.g. pushing a combo lift into next week). The old guard
   rejected it as "outside the plan". The trainer path now extends the
   plan's end_date to cover the new day; moving before the plan start is
   still refused, and the client self-service route keeps its guard, since
   extending a plan is a coach decision, not the athlete's.

   Reported by Helena (PT).

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```

## Guardrails

- We are on `main`. Do not amend, do not force-push. A plain commit is fine here since
  the change is small, isolated, and reviewed; if the repo convention is to branch for
  fixes, branch first — confirm with Helgi before pushing.
- Do NOT commit the other 137 changes. If Helgi wants those, that is a separate,
  deliberate pass.
- After committing: the change is not live for Helena until the app is redeployed /
  the dev server restarted. A commit alone does not unblock her.
