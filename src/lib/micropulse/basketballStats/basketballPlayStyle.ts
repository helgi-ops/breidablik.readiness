/**
 * basketballPlayStyle — the "how they play" axis for Total Player Analysis, from the InStat
 * play-type columns (the second axis beside the box-score production read). Pure, no IO.
 *
 * Offensive STYLE = the mix of how a player generates offense (pick-&-roll, catch-&-shoot,
 * drives, post-ups, …) by attempt share, with the efficiency of each. DEFENCE = how opponents
 * shot against them. Only InStat games carry play types, so this covers the InStat-tracked
 * games only (KKÍ box has no play types). Descriptive — never a readiness or training signal.
 */

export type PlaytypeKey = "pnrHandler" | "pnrRoller" | "iso" | "post" | "cut" | "handoff" | "pnp" | "screenOff" | "transition" | "catchShoot" | "catchDrive";

export const PLAYTYPE_LABELS: Record<PlaytypeKey, { en: string; is: string }> = {
  pnrHandler: { en: "Pick & roll (handler)", is: "Skýling (leikstjóri)" },
  pnrRoller: { en: "Pick & roll (roller)", is: "Skýling (rúllandi)" },
  iso: { en: "Isolation", is: "Einn á einn" },
  post: { en: "Post-up", is: "Undir körfu" },
  cut: { en: "Cut", is: "Skurður" },
  handoff: { en: "Hand-off", is: "Afhending" },
  pnp: { en: "Pick-n-pop", is: "Skýling & popp" },
  screenOff: { en: "Off-screen", is: "Skýling frá" },
  transition: { en: "Transition", is: "Hraðaupphlaup" },
  catchShoot: { en: "Catch & shoot", is: "Grípa & skjóta" },
  catchDrive: { en: "Catch & drive", is: "Grípa & drífa" },
};

const PT_COLS: Record<PlaytypeKey, { made: string; att: string }> = {
  pnrHandler: { made: "PnR Handlers made", att: "PnR Handlers attempted" },
  pnrRoller: { made: "PnR Rollers made", att: "PnR Rollers attempted" },
  iso: { made: "Isolations made", att: "Isolations attempted" },
  post: { made: "Posts up made", att: "Posts up attempted" },
  cut: { made: "Cuts made", att: "Cuts attempted" },
  handoff: { made: "Hand off made", att: "Hand off attempted" },
  pnp: { made: "PnP made", att: "PnP attempted" },
  screenOff: { made: "Screens off made", att: "Screens off attempted" },
  transition: { made: "Transitions made", att: "Transitions attempted" },
  catchShoot: { made: "Catch and shoot made", att: "Catch and shoot attempted" },
  catchDrive: { made: "Catch and drive made", att: "Catch and drive attempted" },
};

const PLAYTYPES = Object.keys(PT_COLS) as PlaytypeKey[];

/** Parse an InStat cell to a number (handles "-", "", "45%", numbers). */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s || s === "-" || s === "—") return 0;
  const n = Number(s.replace(/%$/, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
const r1 = (x: number): number => Math.round(x * 10) / 10;
const pctOf = (m: number, a: number): number | null => (a > 0 ? r1((m / a) * 100) : null);

export type StyleSlice = { key: PlaytypeKey; label: { en: string; is: string }; attempts: number; made: number; share: number; pct: number | null };
export type PlayStyle = {
  games: number; totalAttempts: number;
  mix: StyleSlice[];
  defense: { oppFgPct: number | null; oppFga: number; possessions: number } | null;
};

/** Sum the play-type columns across a player's InStat game rows → the style mix + defence. */
export function buildPlayStyle(statRows: Array<Record<string, unknown>>): PlayStyle | null {
  if (!statRows.length) return null;
  const made: Record<PlaytypeKey, number> = Object.fromEntries(PLAYTYPES.map((k) => [k, 0])) as Record<PlaytypeKey, number>;
  const att: Record<PlaytypeKey, number> = Object.fromEntries(PLAYTYPES.map((k) => [k, 0])) as Record<PlaytypeKey, number>;
  let oppMade = 0, oppFga = 0, poss = 0;
  for (const s of statRows) {
    for (const k of PLAYTYPES) { made[k] += num(s[PT_COLS[k].made]); att[k] += num(s[PT_COLS[k].att]); }
    oppMade += num(s["Opponent's field goals made"]);
    oppFga += num(s["Opponent's field goals attempted"]);
    poss += num(s["Opponent possessions played"]);
  }
  const totalAttempts = PLAYTYPES.reduce((a, k) => a + att[k], 0);
  const mix: StyleSlice[] = PLAYTYPES
    .map((k) => ({ key: k, label: PLAYTYPE_LABELS[k], attempts: att[k], made: made[k], share: totalAttempts > 0 ? Math.round((att[k] / totalAttempts) * 1000) / 10 : 0, pct: pctOf(made[k], att[k]) }))
    .filter((s) => s.attempts > 0)
    .sort((a, b) => b.share - a.share);
  return {
    games: statRows.length, totalAttempts, mix,
    defense: oppFga > 0 ? { oppFgPct: pctOf(oppMade, oppFga), oppFga, possessions: poss } : null,
  };
}

// ── Archetype — a plain label from the production percentiles + the style mix ──────────────
export type Archetype = { key: string; label: { en: string; is: string }; why: { en: string; is: string } };

type ProductionLite = {
  role?: { key: string } | null;
  percentileOf: Partial<Record<"ppg" | "apg" | "rpg" | "spg" | "bpg" | "tpPct" | "tsPct", number | null>>;
};

const shareOf = (style: PlayStyle | null, keys: PlaytypeKey[]): number =>
  (style?.mix ?? []).filter((s) => keys.includes(s.key)).reduce((a, s) => a + s.share, 0);

/** Derive a basketball archetype. Style (how they score) leads; production percentiles confirm. */
export function archetype(production: ProductionLite, style: PlayStyle | null): Archetype {
  const p = production.percentileOf;
  const hi = (v: number | null | undefined) => (v ?? 0) >= 65;
  const pnrH = shareOf(style, ["pnrHandler"]);
  const shoot = shareOf(style, ["catchShoot", "pnp", "screenOff"]);
  const slash = shareOf(style, ["iso", "catchDrive"]);
  const inside = shareOf(style, ["post", "pnrRoller", "cut"]);
  const trans = shareOf(style, ["transition"]);

  const FG = { key: "floor_general", label: { en: "Floor general", is: "Leikstjórnandi" }, why: { en: "Runs pick-&-roll and creates for others.", is: "Keyrir skýlingar og skapar fyrir aðra." } };
  const SHOOT = { key: "shooter", label: { en: "Spot-up shooter", is: "Skytta" }, why: { en: "Scores off the catch — catch-&-shoot and off screens.", is: "Skorar af grip — grípa-og-skjóta og af skýlingum." } };
  const INT = { key: "interior", label: { en: "Interior / finisher", is: "Undir körfu / klárari" }, why: { en: "Scores near the rim (post / roll / cut) and works the glass.", is: "Skorar nálægt körfu (post / rúll / skurður) og vinnur fráköstin." } };
  const SLASH = { key: "slasher", label: { en: "Slasher / shot creator", is: "Sóknarmaður / skapari" }, why: { en: "Creates with isolation and drives off the catch.", is: "Skapar einn á einn og drífur af gripi." } };
  const TRANS = { key: "transition", label: { en: "Transition & disruption", is: "Hraðaupphlaup & truflun" }, why: { en: "Scores in transition and forces turnovers.", is: "Skorar í hraðaupphlaupi og neyðir fram tapanir." } };
  const BAL = { key: "balanced", label: { en: "Balanced contributor", is: "Fjölhæfur" }, why: { en: "No single dominant play type — a balanced profile.", is: "Engin ein ráðandi sóknartegund — jafnt prófíl." } };

  // STYLE leads when there's enough of it to read (the dominant bucket, most distinctive first).
  if ((style?.totalAttempts ?? 0) >= 5) {
    if (shoot >= 30) return SHOOT;
    if (inside >= 30) return INT;
    if (slash >= 25) return SLASH;
    if (pnrH >= 25) return FG;
    if (trans >= 20) return TRANS;
  }
  // Production fallback — no / unclear style (box-score percentiles only, so rougher).
  if ((p.apg ?? 0) >= 70) return FG;
  if (hi(p.tpPct) && hi(p.tsPct)) return SHOOT;
  if (hi(p.rpg) || hi(p.bpg)) return INT;
  if (hi(p.spg)) return TRANS;
  return BAL;
}
