# Claude Code brief — Admin page: upload drills (incl. video) into another coach's library

## Goal
As an **admin** (`helgasport@helgasport.is`, `profiles.role='ADMIN'`), upload drills — **mostly videos** —
**into a specific coach's library** so that coach gets a usable library. First real use: **Emil Pálsson**
(coach, `profiles.id = ea7a371e-e4d7-46c7-aca7-5581c4cdc532`, team **Breiðablik `94b52a06-…`**). These are
**Emil's own drills** (do NOT copy from Helgasport or any other team).

The admin UX must be a **separate admin page** that works **exactly like the existing "+ New drill" form** —
same fields on screen, same video handling — plus a picker for *which coach/team* the drill is created for.

## What already exists (reuse it — this is a thin feature)
- **The "+ New drill" form** lives in `src/components/coach/CoachDrillLibrary.tsx`. Fields on screen:
  category, drill_name, description, drill_format, field_length_m, field_width_m, total_players, reps,
  duration_min, **video link (YouTube/Vimeo)** OR **upload a video file (private, max 200 MB)**, **"Generate
  description with AI" from the video**, cup_principle, stimulus_type. Mirror these exactly.
- **Create route** `POST /api/coach/drill-library` already accepts every field above, stamps `sport` from the
  team, normalises the drill name, and sets `owner_type` ('coach' | 'team').
- **Video file upload**: staged in the form, then uploaded to the **private bucket + `coach_media`** table
  (linked by `drill_id`, signed URLs) **after** the drill is saved — route
  `src/app/api/coach/library/media/upload/route.ts` (+ `library/media/route.ts` to list/sign). Video **links**
  go in `drill_library.video_url`; `drill-library/vimeo-thumb` makes thumbnails.
- Admin role is already understood server-side (`role='ADMIN'` checks in
  `src/lib/session-rpe/server.ts` `requireCoachAccessForTeam`).

## The gap (what to build)
The create route resolves the owner from the **caller**: `getCoachTeam` only allows a non-primary target
team if the caller is in `coach_teams`, and it sets `owner_coach_id = auth.userId` (the caller). So an admin
cannot currently create a drill **owned by Emil**. Build:

1. **Admin-only page** — a new separate page (e.g. `/admin/drills` or `/coach/admin/drill-upload`), gated so
   only `role='ADMIN'` can open it (redirect others). It renders the **same drill form component** as
   "+ New drill".
   - **Factor the form out** of `CoachDrillLibrary.tsx` into a shared `<DrillForm>` component (same fields,
     same video link + file-upload + AI-from-video behaviour) and use it in both places, so the two screens
     can never drift. If extraction is too invasive, replicate the exact field set, but shared is preferred.

2. **Target picker** at the top of the admin page:
   - Pick a **coach** (list coaches; default to Emil for this first run) → resolve their `team_id`.
   - Ownership toggle, default **"Coach's own library"** (`owner_type='coach'`,
     `owner_coach_id = <target coach id>`) so they're Emil's personal drills that follow him (matches the
     `scope=my` semantics in the GET route). Allow "Team library" (`owner_type='team'`,
     `team_id=<target team>`) as the alternative.

3. **Admin create path** — either extend the existing route or add `POST /api/admin/drill-library`:
   - Gate strictly on `role='ADMIN'`.
   - Accept `target_coach_id` and/or `target_team_id`; set `owner_coach_id` / `team_id` to the **target**
     (not the admin). Stamp `sport` from the target team (`resolveTeamSport`). Keep `normalizeDrillName`.
   - Tag `source='admin_upload'` for traceability (so these are identifiable and removable, and excluded
     from "team's own measured drills" logic the same way `source` is used elsewhere).
   - Reuse the **same insert shape** as the current POST (all the optional load columns stay null unless
     provided — see note below).

4. **Video after save** — after creating the drill for the target, run the **same** `coach_media` upload the
   normal form uses (upload file → private bucket → `coach_media` row with the new `drill_id` → signed URL),
   or store the link in `video_url`. The admin page must attach media to the drill it just created **for the
   target coach**, not for the admin.

## Load metrics (honesty)
Emil's drills are mostly videos — leave the measured load columns (distance, player_load, accel/decel,
metabolic) **null**. The system fills real load per drill from that team's own GPS over time (drill-load
profile engine). Only store load if Emil provides measured values; never fabricate.

## Guardrails / tests
- **Admin-only:** non-admin opening the page or calling the admin route → 403 / redirect.
- Drill created with `owner_coach_id = Emil` (default) appears in **Emil's** library (`scope=my`), sport =
  his team's sport; not in any other coach's library.
- Video **link** → stored in `video_url`, thumbnail resolves; video **file** → lands in `coach_media` with
  the new `drill_id`, plays back via signed URL.
- "Generate description with AI from video" works the same as in `CoachDrillLibrary`.
- `normalizeDrillName` applied (no date prefixes); re-uploading the same drill name for the same owner
  upserts/dedupes rather than duplicating.
- `source='admin_upload'` set; **boundary:** drills are descriptive — nothing here touches
  `readiness_entries.color` / `v_coach_readiness_today_v8`.
- `npx eslint` on changed files; typecheck; any schema/policy change saved as a migration under
  `supabase/migrations/`.

## Flow (core requirement — this must feel fast for bulk video entry)
Emil has many drills, mostly videos, so the admin will add them one after another in one sitting. The flow
is a first-class part of the deliverable, not a nice-to-have. Build it so adding 20+ drills is smooth:

- **Lock the target once.** Pick the coach (Emil) + ownership at the top; it **stays selected** for the
  whole session. A persistent header shows "Adding drills for: **Emil Pálsson** · Breiðablik" so it's always
  clear where drills are going. Changing target is one click but never required between drills.
- **Save & add another is the default.** After save, the form **clears the per-drill fields and keeps focus**
  (cursor back in drill_name), target intact, ready for the next drill. Offer "Save & close" as the
  secondary action. No full-page reload between saves.
- **Running list + count.** Show a live "Added this session (N)" list (drill name + ✓ + a thumbnail once the
  video resolves), with an **Undo/remove** on each in case of a mistake — so the admin can see progress and
  correct without leaving the page.
- **Fast video entry.** Accept a pasted YouTube/Vimeo **link** (auto-thumbnail) OR **drag-and-drop / pick a
  file**; show an upload **progress bar** and let the admin start filling the next fields while the file
  uploads in the background (don't block the form on the upload). Validate type/size (≤200 MB) inline.
- **AI description one tap.** Keep the existing "Generate description with AI from the video" action; if a
  link/file is present, it can auto-draft on save (admin can edit first). Minimise typing.
- **Low-friction fields.** Only `drill_name` + `category` are required; everything else optional. Remember
  the last-used `category` and `drill_format` as the default for the next drill (coaches add in clusters).
  Keyboard-friendly: Enter/⌘-Enter saves and advances.
- **Resilience.** Autosave the in-progress drill to local draft so a refresh/disconnect mid-session doesn't
  lose the current entry; a failed save keeps the form populated with a clear retry (never silently drop a
  drill + its uploaded video).
