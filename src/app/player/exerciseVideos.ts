"use client";

/**
 * Exercise demo videos for the player's Today session.
 *
 * The curated demo links live in the DB (`exercise_library.video_url`, ~130
 * global exercises) — the single source of truth, editable without a deploy.
 * `/api/player/exercise-videos` serves that catalog; this module fetches it ONCE
 * per page load (module-cached, lazy — it never blocks the session render) and
 * resolves a displayed exercise line to its video by NAME.
 *
 * Matching is name-based because the player's rendered exercise is a localized
 * string (the id is flattened away before render). We normalize both sides
 * (drop parentheticals, fold diacritics, keep alphanumerics) and match against
 * the DB English + Icelandic names. The MD engine's own names differ from the DB
 * names for some exercises (e.g. "Barbell bench press" vs "Bench Press"), so a
 * small alias table bridges the engine library's names (EN + IS) to the DB name
 * that carries the video. Unmatched lines simply show no video (graceful).
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

/** Fold a name to a match key: drop "(...)", strip diacritics, keep a–z0–9.
 *  Exported as `normalizeExerciseName` for tests / catalog-key building. */
export function norm(s: string): string {
  return (s || "")
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * MD-engine exercise name (English or Icelandic, as authored in
 * `strengthProgramming/exerciseLibrary.ts`) → the DB `exercise_library.name`
 * that holds the matching demo video. Only confident equivalences are listed;
 * variants with no good demo (e.g. belt squat, FFE split squat) are omitted so
 * the player is never shown a misleading clip. Direct DB-name matches don't need
 * an entry here — this only covers names that differ between the two libraries.
 */
const ENGINE_ALIAS_PAIRS: Array<[engineName: string, dbName: string]> = [
  ["Pogo bouncing (warm-up)", "Pogo Jump"], ["Pogo (hitun)", "Pogo Jump"],
  ["Pogo hops", "Pogo Jump"], ["Pogo-hopp", "Pogo Jump"],
  ["Mid-thigh pull (dynamic)", "Mid-Thigh Pull"], ["Mid-thigh pull (dýnamískt)", "Mid-Thigh Pull"],
  ["Hurdle hops", "Hurdle Hop"], ["Grindahopp", "Hurdle Hop"],
  ["Trap-bar jump squat", "Trap-Bar Jump"], ["Trap-bar stökk-hnébeygja", "Trap-Bar Jump"],
  ["Kettlebell swing (heavy)", "Kettlebell Swing"], ["Þung kettlebell sveifla", "Kettlebell Swing"],
  ["Med-ball rotational throw", "Medicine Ball Rotational Throw"], ["Med-ball snúningskast", "Medicine Ball Rotational Throw"],
  ["Med-ball overhead slam", "Med Ball Slam"], ["Med-ball gólfslamm", "Med Ball Slam"],
  ["Med-ball chest pass (explosive)", "Medicine Ball Chest Pass"], ["Med-ball brjóstkast (sprengi)", "Medicine Ball Chest Pass"],
  ["Trap-bar deadlift", "Trap Bar Deadlift"],
  ["Back squat", "Back Squat"], ["Bak-hnébeygja", "Back Squat"],
  ["Front squat", "Front Squat"], ["Fram-hnébeygja", "Front Squat"],
  ["Hip thrust (barbell)", "Hip Thrust"], ["Mjaðmaspark (stöng)", "Hip Thrust"],
  ["Barbell deadlift", "Deadlift"], ["Réttstöðulyfta", "Deadlift"],
  ["Weighted step-up", "Step-Up"], ["Hlaðið step-up", "Step-Up"],
  ["Walking lunge", "Walking Lunge"], ["Gönguskref (lunge)", "Walking Lunge"],
  ["Reverse lunge", "Reverse Lunge"], ["Afturábak step", "Reverse Lunge"],
  ["Nordic hamstring curl", "Nordic Hamstring Curl"], ["Nordic hamstring", "Nordic Hamstring Curl"],
  ["Romanian deadlift (RDL)", "Romanian Deadlift"], ["Rómversk dauðalyfta (RDL)", "Romanian Deadlift"],
  ["Copenhagen adduction", "Copenhagen Adductor"],
  ["IMTP (Isometric Mid-Thigh Pull)", "ISO Mid-Thigh Pull"], ["IMTP (kyrrstöðu mid-thigh)", "ISO Mid-Thigh Pull"],
  ["Iso squat hold at 90° knee", "ISO Squat (overcoming)"], ["Kyrr-hnébeygja 90°", "ISO Squat (overcoming)"],
  ["Iso split-stance hold", "ISO Split Squat Hold"], ["Kyrr-split-stance hold", "ISO Split Squat Hold"],
  ["Long iso hamstring bridge (single-leg)", "Hamstring ISO"], ["Lang ham-bridge (einfætt)", "Hamstring ISO"],
  ["Isometric calf-raise hold", "ISO Calf Raise Hold (Single-Leg)"], ["Ísómetrískt kálfalyftu-hald", "ISO Calf Raise Hold (Single-Leg)"],
  ["Heavy calf raise", "Calf Raise"], ["Þung kálfa-lyfta", "Calf Raise"],
  ["DB bench / floor press", "Dumbbell Bench Press"], ["Handlóðabekkpressa", "Dumbbell Bench Press"],
  ["Chin-up / lat pulldown", "Chin-Up"], ["Upphífing / niðurtog", "Chin-Up"],
  ["Single-arm DB row", "Single-Arm Dumbbell Row"], ["Einhenda róður (handlóð)", "Single-Arm Dumbbell Row"],
  ["Weighted push-up", "Push-Up"], ["Armbeygja með álagi", "Push-Up"],
  ["Barbell bench press", "Bench Press"], ["Bekkpressa (stöng)", "Bench Press"],
  ["Barbell bent-over row", "Bent-Over Row"], ["Róður í fráhalla (stöng)", "Bent-Over Row"],
  ["DB shoulder press", "Dumbbell Shoulder Press"], ["Axlapressa (handlóð)", "Dumbbell Shoulder Press"],
  ["Incline DB press", "Incline Bench Press"], ["Hallabekkpressa (handlóð)", "Incline Bench Press"],
  ["DB push press", "Push Press"], ["Axlahnykkur (handlóð)", "Push Press"],
  ["Barbell push press", "Push Press"], ["Axlahnykkur (stöng)", "Push Press"],
  ["Plyometric push-up", "Plyo Push-Up"], ["Sprengi-armbeygja", "Plyo Push-Up"],
  ["Pull-up", "Pull-Up"], ["Upptog (pronað grip)", "Pull-Up"],
  ["Barbell overhead press", "Overhead Press"], ["Axlapressa (stöng)", "Overhead Press"],
  ["DB snatch", "DB Snatch"], ["Handlóð snatch", "DB Snatch"],
  ["Box jump", "Box Jump"], ["Boxstökk", "Box Jump"],
  ["Broad jump", "Broad Jump"], ["Lengdarstökk", "Broad Jump"],
  ["Lateral bound", "Lateral Bound"], ["Hliðarstökk", "Lateral Bound"],
  ["Jump shrug (stökk-axlalyfta)", "Jump Shrug"],
  ["Single-leg RDL", "Single-Leg RDL"], ["Einfætta RDL", "Single-Leg RDL"],
  ["Bulgarian split squat", "Bulgarian Split Squat"],
];

const ENGINE_ALIASES: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [engine, db] of ENGINE_ALIAS_PAIRS) m[norm(engine)] = db;
  return m;
})();

/** Pure resolver (exported for tests): displayed name → video URL via the
 *  catalog map (DB EN/IS names, pre-normalized keys) + the engine alias table. */
export function resolveVideoUrl(map: Map<string, string>, name: string): string | null {
  const k = norm(name);
  if (!k) return null;
  const direct = map.get(k);
  if (direct) return direct;
  const aliasDb = ENGINE_ALIASES[k];
  return aliasDb ? map.get(norm(aliasDb)) ?? null : null;
}

type VideoRow = { name: string; name_is: string | null; video_url: string };

// Fetched once per page load and shared across every exercise row.
let catalogPromise: Promise<Map<string, string>> | null = null;

async function fetchCatalog(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
    const res = await fetch("/api/player/exercise-videos", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "force-cache",
    });
    const j = (await res.json()) as { videos?: VideoRow[] };
    for (const v of j.videos ?? []) {
      if (!v.video_url) continue;
      map.set(norm(v.name), v.video_url);
      if (v.name_is) map.set(norm(v.name_is), v.video_url);
    }
  } catch {
    /* no catalog → no video links (graceful) */
  }
  return map;
}

/**
 * Returns `lookup(exerciseName)` → demo video URL (or null). The catalog loads
 * lazily after mount, so links appear a moment after the session renders and
 * never delay it. Safe to call for every exercise row.
 */
export function useExerciseVideoLookup(): (name: string) => string | null {
  const [map, setMap] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    if (!catalogPromise) catalogPromise = fetchCatalog();
    catalogPromise.then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return useCallback((name: string): string | null => (map ? resolveVideoUrl(map, name) : null), [map]);
}
