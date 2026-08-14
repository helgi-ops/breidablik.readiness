/**
 * Bilingual (EN/IS) coach-facing labels for the InStat shot-type keys — FG
 * playtypes (pt_*), offensive-efficiency types (eff_*) and court zones (zone_*).
 * Shared by the season and single-game basketball surfaces so the wording is
 * identical. Presentation only — no data logic.
 */

export type Lang = "EN" | "IS";

export const SHOT_TYPE_LABELS: Record<string, { EN: string; IS: string }> = {
  pnrHandler: { EN: "Pick & roll — handler", IS: "Skýling — leikstjóri" },
  pnrRoller: { EN: "Pick & roll — roller", IS: "Skýling — rúllandi" },
  catchShoot: { EN: "Catch & shoot", IS: "Grípa og skjóta" },
  catchDrive: { EN: "Catch & drive", IS: "Grípa og drífa" },
  screenOff: { EN: "Off-screen", IS: "Skýling frá" },
  postUp: { EN: "Post-up", IS: "Undir körfu (post)" },
  transition: { EN: "Transition", IS: "Hraðaupphlaup" },
  iso: { EN: "Isolation", IS: "Einn á einn" },
  handOff: { EN: "Hand-off", IS: "Handafhending" },
  cut: { EN: "Cut", IS: "Skurður" },
  putback: { EN: "Putback", IS: "Endurstig" },
  uncontestedFg: { EN: "Uncontested FG", IS: "Óvarið skot" },
  contestedFg: { EN: "Contested FG", IS: "Varið skot" },
  positional: { EN: "Positional attack", IS: "Uppstillt sókn" },
  transitionShot: { EN: "Transition", IS: "Hraðaupphlaup" },
  blob: { EN: "Baseline out-of-bounds", IS: "Endalínu-innkast" },
  slob: { EN: "Sideline out-of-bounds", IS: "Hliðarlínu-innkast" },
};
export const shotLabel = (key: string, lang: Lang): string => SHOT_TYPE_LABELS[key]?.[lang] ?? key;

export const ZONE_LABELS: Record<string, { EN: string; IS: string }> = {
  paint: { EN: "In paint", IS: "Í teig" },
  fg_lt2m: { EN: "FG < 2m", IS: "Skot < 2m" },
  fg_lt4m: { EN: "FG < 4m", IS: "Skot < 4m" },
  under_3pt_line: { EN: "Inside the arc", IS: "Innan þriggja línu" },
  "3pt_lt8m": { EN: "3PT < 8m", IS: "Þristur < 8m" },
  "3pt_gt8m": { EN: "3PT > 8m", IS: "Þristur > 8m" },
};
export const zoneLabel = (key: string, lang: Lang): string => ZONE_LABELS[key]?.[lang] ?? key;
