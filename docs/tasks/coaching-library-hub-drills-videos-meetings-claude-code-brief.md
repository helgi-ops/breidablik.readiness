# Claude Code brief — Coaching Library hub (drills + videos + meetings)

Goal: let a coach keep his whole coaching knowledge base in MicroPulse — **drills** (exists), **videos**
(extend), and **meetings** (new) — in one searchable place, with videos and drills attachable to
meetings and sessions. This is a content/knowledge surface adjacent to the analytics core; it's a strong
retention feature (a coach whose whole library lives here doesn't churn). **Descriptive — none of it
touches the readiness colour or the daily decision.**

## What exists (reuse — don't rebuild)

- **`drill_library`** (`20260405120000`, ownership `20260415080000`): team/coach/public ownership
  (`owner_type` ∈ coach|team|public, `owner_coach_id`, `team_id`, RLS via `coach_teams`/`staff_users`),
  categories (possession/ssg/transition/running/finishing/warmup/other), `description`, `drill_format`,
  field dims, GPS metrics, **`diagram_url`** (`20260413170000`), `source`, soft-delete (`deleted_at`),
  plus `drill_library_public` for shared templates. **Drills are already a proper library.**
- **Video links** already used: `exercise_library.video_url` (YouTube demos on 37+ lifts),
  `individual_training_system.video_url`.
- **Private video storage already works:** `sb.storage.from("movement-screen-videos").createSignedUrl(
  path, 3600)` — the signed-URL bucket pattern to mirror.
- Surfaces: `programme-library`, `my-exercises`, `templates`, `custom-templates`, Session Builder.

## Phase 1 — Video library (cheap, high value; the plumbing exists)

### Drills carry video
- Migration: `ALTER TABLE drill_library ADD COLUMN IF NOT EXISTS video_url text;` (external link:
  YouTube/Vimeo) and `ADD COLUMN IF NOT EXISTS media jsonb` (list of `{kind, url|path, title}` for extra
  clips/images). No RLS change — inherits the drill's row policy.

### A general coach media table + private bucket
- New bucket **`coach-library-media`** (private), signed URLs like movement-screen. Player-identifiable
  video = a minor → **private only, signed URLs, never a public bucket** (see Privacy).
- New table **`coach_media`**, RLS mirroring `drill_library` ownership:
```
id uuid pk, owner_type text (coach|team), owner_coach_id uuid, team_id uuid,
title text not null, kind text (video|image|doc) not null,
external_url text,            -- YouTube/Vimeo/link
storage_path text,            -- coach-library-media object (uploaded)
tags text[] default '{}',
drill_id uuid null references drill_library(id) on delete set null,
duration_s numeric null, bytes bigint null,   -- for the library's size/footprint view + caps
note text, created_by uuid, created_at timestamptz default now(), deleted_at timestamptz
check (external_url is not null or storage_path is not null)
```
- Read path resolves `storage_path` → signed URL (mirror `movementScreen/loader.ts`); `external_url`
  passes through.

### Surface
- A **Videos** view (in the library hub below): searchable/filterable grid (by tag, kind, linked drill),
  add-by-link and (Phase 1b) upload; open the drill a clip is attached to. Reuse the existing
  drill picker to attach media to a drill.

### Video ingestion — transcode on upload + caps (do this in Phase 1)

Raw phone clips are ~1 MB/sec at 1080p (a real example: a 55-s 1080p clip = **60 MB**, ~9 Mbps). At scale
that is the one line that grows storage + egress. Two rules keep it cheap without the coach noticing:

1. **External link is the default** (YouTube/Vimeo unlisted) → zero storage + zero egress. Upload is the
   opt-in path.
2. **Transcode every upload before storing.** Target **720p, H.264 CRF ~26, AAC 96k** — verified to take
   the 60 MB example down to **~5.7 MB (≈10× smaller)** with quality that is fine for coaching (tactics /
   drill / technique) clips.
   - Prefer **client-side** transcode/downscale before upload (saves the coach's mobile data + upload
     time on a pitch-side connection); fall back to a **server/edge transcode** on ingest if client-side
     isn't feasible. Store only the transcoded file; keep the original only if the coach opts in.
3. **Caps:** reject uploads over a size/duration limit (defaults **~200 MB / ~3 min**, team-tunable) with
   a clear message ("compress or paste a link"). Store `duration_s` and `bytes` on `coach_media` so the
   library can show size and the team can see its storage footprint.

These are the honest levers behind the storage-cost note above — bake them into the uploader, not a
later optimisation.

## Phase 2 — Meetings (new)

- **`coach_meetings`** (RLS mirrors drill_library ownership):
```
id uuid pk, owner_type text, owner_coach_id uuid, team_id uuid,
title text not null, meeting_date date not null, meeting_type text null,  -- staff|team|1to1|video-review|other
agenda text, minutes text, attendees text, created_by uuid,
created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
```
- **`coach_meeting_attachments`** — link drills / media / files to a meeting:
```
id uuid pk, meeting_id uuid not null references coach_meetings(id) on delete cascade,
kind text (drill|media|file|note) not null,
drill_id uuid null references drill_library(id) on delete set null,
media_id uuid null references coach_media(id) on delete set null,
external_url text, note text, position int default 0
```
- Surface: meetings list (by date) + detail (agenda, minutes, attendees, attached drills/videos/files).
  A meeting can pull a drill from the library or a clip from the video view.

## Unified hub — `/coach/library` (or extend `programme-library`)

One destination with tabs: **Drills · Videos · Meetings** (+ existing templates). This is the coach's
knowledge base in one place — consistent with the consolidation direction (one destination, not three
scattered pages). Search across all three by tag/name.

## Privacy & cost (must be in the build)

- **Player-identifiable video = minors.** Keep uploaded video in the **private** bucket with signed URLs
  only; **never** the public bucket / `owner_type='public'`. Public sharing is for **drills + diagrams**
  (no player faces), not player clips. Reuse the movement-screen consent posture; record consent where a
  player is identifiable.
- **Storage cost:** uploaded video is the one line that grows the cloud bill (ties to the 2027
  cost model's cloud line). Prefer external links (YouTube/Vimeo) as the default; treat direct upload as
  opt-in, and note size limits + a retention policy in settings.
- Soft-delete everywhere (`deleted_at`), strict RLS (team/coach scoped), descriptive — no readiness coupling.

## Implementation order

1. Migration: `drill_library.video_url` + `media`; `coach_media` table + `coach-library-media` bucket + RLS.
2. Media read lib (`src/lib/micropulse/library/media.ts`): resolve storage_path → signed URL, list/filter,
   attach-to-drill (pure where possible; I/O in a loader).
3. `/coach/library` hub: Drills (reuse existing) + Videos tab. Add-by-link first; upload second.
4. Migration + surface for `coach_meetings` + `coach_meeting_attachments`.
5. Wire attachments (drill picker + media picker) into the meeting detail.

## Guardrails / tests

- RLS: a coach sees only his own + his teams' library rows (mirror `drill_library` policies exactly);
  add a test that a foreign team's media/meetings are not returned.
- Signed URLs expire (3600 s) and are never logged; `check` constraint prevents a media row with neither
  a link nor a path.
- `npx eslint` clean; migrations saved under `supabase/migrations/`.
- Boundary: library/meetings never read or write the readiness verdict, load target, or daily decision.

## Acceptance

- [ ] Drills carry `video_url` + `media`; a coach can attach clips to any drill.
- [ ] `coach_media` + private bucket + signed URLs; add-by-link and upload; searchable Videos view.
- [ ] Uploads transcoded to 720p/CRF~26 (≈10× smaller) with size/duration caps; external link is default.
- [ ] `coach_meetings` + attachments; agenda/minutes/attendees; drills & videos attachable to a meeting.
- [ ] One `/coach/library` hub with Drills · Videos · Meetings tabs; search across all.
- [ ] Player video stays private (signed URLs, consent); public sharing limited to drills/diagrams.
- [ ] RLS-isolation test passes; eslint clean; migrations saved; no readiness coupling.

## Note
This is a content/knowledge surface, not analytics — scope it as such (no signals, no readiness). Its
value is completeness + retention: the coach's meetings, drills and videos living in one place.
