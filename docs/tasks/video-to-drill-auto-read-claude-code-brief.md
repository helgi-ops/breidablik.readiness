# Claude Code brief — video → auto drill read (auto-tag + description + diagram)

Goal: when a coach adds a **drill video**, let the system **read the drill from the footage** — propose a
name, category, format (e.g. "6v3"), a plain description of the structure, and a **tactical diagram** — as
an **AI-labelled DRAFT the coach confirms/edits**. It turns "here's a clip" into a filled drill card.
**Physical demand numbers still come from GPS, never from video** (see scope). Descriptive; coach owns.

Verified feasible: from 5 sampled frames of a real clip the model read *"6v3 possession in a coned grid
with two mini-goals, transitioning to a finish on the full goal past a mannequin, GK live — small-sided,
high tempo."* That is exactly the level this feature ships.

## Honest scope (put in the UI)

- **AI DRAFT, not truth:** everything the video-read produces is a suggestion the coach confirms/edits;
  label it as AI (manifesto: AI is labelled and cites its basis — here, the frames).
- **No physical metrics from video:** HSR / accel-decel / PlayerLoad / distances require GPS/tracking. A
  handheld/tactical camera can't give calibrated speeds. The drill's demand profile stays GPS-sourced
  (`drill_library` metrics, filled when players wear units during the drill). The video read fills the
  **qualitative/tactical** fields only; counts (players, area) are estimates.
- **Privacy:** frames may show players (incl. minors). Keep the pipeline private; the model describes the
  DRILL (structure/tactics), not the players — **no player identification**. Treat frames as data; consent
  posture as in movement-screen video. Prefer opt-in; don't expose frames publicly.

## Reuse (don't rebuild)

- **Coaching Library brief** — `coach_media` (video) + `drill_library.video_url`; the video lives here.
- **`drill_library`** — target fields: `drill_name`, `category` (possession/ssg/transition/finishing/
  running/warmup/other), `drill_format`, `total_players`, `field_*`, `description`, `diagram_url`.
- **`micropulse-drill-diagram` skill** — already generates an SVG tactical diagram and writes
  `diagram_url` + a description; feed it the AI-read structure to draw the diagram.
- **AI plumbing** — the app already calls Claude (askClaude / AI-narrative libs) with the "label as AI +
  cite" pattern; reuse it for the multimodal call.

## Pipeline

1. **Frame extraction:** sample ~5–8 keyframes across the clip (ffmpeg `fps=1/N`, downscale ~960px).
   Serverless ffmpeg is heavy — implement as a lightweight worker/edge job or client-side extraction; note
   the choice. Store only frames needed for the read (not a frame archive).
2. **Vision read (multimodal Claude):** send the frames with a structured prompt → strict JSON:
   ```ts
   interface DrillVideoRead {
     suggestedName: string;                 // "6v3 possession + finish"
     category: "possession"|"ssg"|"transition"|"finishing"|"running"|"warmup"|"other";
     format: string|null;                   // "6v3", "8v8+2", …
     playersEst: number|null; areaType: "small"|"medium"|"large"|null;
     phases: string[];                      // ["possession in grid","transition","finish on goal"]
     equipment: string[];                   // ["mini-goals","mannequin","cones"]
     description: Bi;                        // plain coach-readable
     intensityEst: "low"|"moderate"|"high"|null;
     confidence: "high"|"moderate"|"low"; caveat: Bi;  // "AI read from N frames — confirm"
   }
   ```
   Strict schema; the model must not invent physical metrics — the prompt forbids speed/distance/load numbers.
3. **Draft the drill card:** prefill the create/edit form (`/api/coach/drill-library` POST) with the read;
   the coach reviews and saves. `source` marks it AI-drafted.
4. **Diagram (optional):** pass `phases` + `format` + `equipment` to the drill-diagram skill → SVG →
   `diagram_url`.

## Surface

- On a drill's video (Coaching Library / drill card): a **"Read this drill (AI)"** action → shows the
  draft (name/category/format/phases/description) with an AI chip + confidence + "confirm/edit". Saving
  writes the drill; a "Generate diagram" button runs the diagram skill.

## Guardrails / tests

- The read is a DRAFT; nothing auto-saves without coach confirm. AI-labelled; cites "from N frames".
- **Never** writes `player_load`/`vel_b*`/`accel/decel`/distances from the video (schema + prompt forbid;
  a test asserts these stay null/GPS-only). No player names produced.
- Boundary: the read never touches the readiness colour or the daily decision.
- Tests: JSON-schema validation of the model output (reject numbers-as-metrics); category ∈ enum;
  confidence set; the create-draft prefill maps fields correctly; privacy test (no player-name field);
  diagram call receives phases/format.

`npx eslint` + tests; lint-clean. Frame-extraction infra + any storage/config saved appropriately.

## Acceptance
- [ ] Drill video → AI draft (name/category/format/phases/description/intensity) with confidence + AI label.
- [ ] Coach confirms/edits → saved to `drill_library`; optional diagram via the drill-diagram skill.
- [ ] No physical metrics or player identities produced from video (GPS stays the source of demand); test proves it.
- [ ] Frames handled privately (minors); opt-in; descriptive-only boundary test passes; eslint+tests clean.

## Notes
Automatic *physical* drill analysis from a single handheld clip is not reliable — that's a calibrated
multi-camera / GPS problem (SkillCorner/Second Spectrum/Catapult Vision). This feature deliberately scopes
to the **qualitative/tactical** read a multimodal model does well, and leaves the numbers to GPS.
