"use client";

/**
 * Coach quadrant view (Gabbett 2017 / Vanrenterghem 2017).
 *
 * Shows every athlete on a 2x2 chart of external load (X = avg distance)
 * vs internal cost (Y = avg sRPE). Quadrants identify:
 *
 *   - INJURY RISK (high external + high internal)
 *   - DECOUPLED   (low external + high internal — early-warning fatigue)
 *   - PEAK FITNESS (high external + low internal)
 *   - UNDER-STIMULATED (low external + low internal)
 *
 * Time window is selectable (7 / 14 / 28 days). Default 7 days = current
 * micro-cycle, the most actionable view for week planning.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { QuadrantChart, type QuadrantPoint } from "@/components/coach/QuadrantChart";
import SquadLoadTable, { type SquadLoadPlayer } from "@/components/coach/SquadLoadTable";
import VerdictBanner from "@/components/coach/VerdictBanner";
import { useLang, type Lang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";

type Window = 7 | 14 | 28;

// ── Bilingual UI strings ─────────────────────────────────────────────────
const QUAD_I18N = {
  pageTitle: { EN: "Quadrant view", IS: "Quadrant view" },
  subtitleA: {
    EN: "External load (avg distance) × internal cost (avg sRPE). Quadrant lines at team median.",
    IS: "External load (avg distance) × internal cost (avg sRPE). Quadrant-línur á team median.",
  },
  updated: { EN: "updated", IS: "uppfært" },
  notSignedIn: { EN: "Not signed in", IS: "Ekki innskráður" },
  noTeam: { EN: "Not connected to a team", IS: "Ekki tengdur við lið" },
  errorFetch: { EN: "Failed to fetch data", IS: "Villa við að sækja gögn" },
  loadingData: { EN: "Loading data…", IS: "Hleð gögn…" },
  noDataInWindow: {
    EN: "No data in this window. Upload GPS / RPE first.",
    IS: "Engin gögn fyrir þennan glugga. Hladdu upp GPS / RPE fyrst.",
  },
  injuryRisk: { EN: "Injury risk", IS: "Injury risk" },
  decoupled: { EN: "Decoupled", IS: "Decoupled" },
  peakFitness: { EN: "Peak fitness", IS: "Peak fitness" },
  underStimulated: { EN: "Under-stimulated", IS: "Under-stimulated" },
  howToRead: { EN: "How to read this:", IS: "Hvernig á að lesa þetta:" },
  riskExplain: {
    EN: "(top-right): players who both run a lot and pay a high internal cost. Highest injury risk — consider reducing load in the next session.",
    IS: "(efst-hægri): leikmenn sem bæði keyra mikið og borga mikið innra. Mest meiðslaáhætta — íhuga reduced load í næstu session.",
  },
  decoupledExplain: {
    EN: "(top-left): players running little but paying a lot internally. Classic early-warning fatigue or illness signal — Halson 2014.",
    IS: "(efst-vinstri): leikmenn sem keyra lítið en borga mikið. Klassískt early-warning fatigue eða illness merki — Halson 2014.",
  },
  peakExplain: {
    EN: "(bottom-right): lots of work, low cost. Well trained — at peak form.",
    IS: "(neðst-hægri): mikið work, lítill cost. Vel þjálfaðir — komnir á topp form.",
  },
  underExplain: {
    EN: "(bottom-left): minimal load. No injury risk — but maybe not getting enough stimulus either.",
    IS: "(neðst-vinstri): minimal load. Ekki meiðslaáhætta — en kannski ekki að fá nóg álag heldur.",
  },
  dotSizeHint: {
    EN: "Dot size reflects ACWR — larger dot = ratio above 1.3 (acute work outpaces chronic).",
    IS: "Punktastærð endurspeglar ACWR — stærri punktur = ratio hærri en 1.3 (acute work outpaces chronic).",
  },
  backToDashboard: { EN: "← Back to dashboard", IS: "← Til baka á dashboard" },
  addGpsRpe: { EN: "Add GPS / RPE data →", IS: "Bæta við GPS / RPE gögnum →" },
  xLabel: {
    EN: "External load — avg distance (m / day, last",
    IS: "External load — avg distance (m / day, last",
  },
  yLabel: {
    EN: "Internal cost — avg sRPE (AU / day, last",
    IS: "Internal cost — avg sRPE (AU / day, last",
  },
} as const;
function qt(key: keyof typeof QUAD_I18N, lang: Lang): string {
  return lang === "IS" ? QUAD_I18N[key].IS : QUAD_I18N[key].EN;
}

type RawPlayer = {
  id: string;
  full_name: string | null;
  team_id: string | null;
};

type Aggregate = {
  player_id: string;
  external_load: number;     // avg total_distance over window (m / day)
  internal_cost: number;     // avg RPE × duration over window (AU / day)
  ext_days: number;          // days with external data
  rpe_days: number;          // days with RPE data
  acute_int: number;         // 7-day avg internal
  chronic_int: number;       // 28-day avg internal
  edi_sum: number;           // sum of edi values across window (di Prampero 2015)
  edi_n: number;             // count of days with edi data
};

export default function CoachQuadrantPage() {
  const [lang] = useLang();
  const [loading, setLoading]   = React.useState(true);
  const [error, setError]       = React.useState<string | null>(null);
  const [windowDays, setWindow] = React.useState<Window>(7);
  const [points, setPoints]     = React.useState<QuadrantPoint[]>([]);
  const [teamLabel, setTeamLabel] = React.useState<string>("");
  const [computedAt, setComputedAt] = React.useState<string>("");

  // Squad Load table data — moved here from the GPS Data tab. Quadrant
  // IS the acute/chronic story so this is the natural companion to the
  // 2x2 chart above.
  const [squadLoadPlayers, setSquadLoadPlayers] = React.useState<SquadLoadPlayer[]>([]);
  const [squadLoadDate, setSquadLoadDate] = React.useState<string>("");
  const [teamSport, setTeamSport] = React.useState<string | null>(null);

  // Catapult data tier — drives the Gabbett 2016 (volume axis, Lite) vs
  // Gabbett 2017 (volume + B2-3 axis, Full) variant selection. Volume axis
  // works on every Catapult plan; B2-3 axis adds explosive-effort
  // discrimination for clubs on Premium plans. Defaults to 'lite' until
  // detection completes — same conservative default as CoachShell.
  const [catapultDataTier, setCatapultDataTier] = React.useState<"full" | "lite">("lite");

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  // Squad Load full-history fetch — runs once, independent of the
  // 7/14/28 slider above (the table always shows 7d acute / 28d
  // chronic / ACWR per metric, slider doesn't apply).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb
        .from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const teamId = profile?.team_id as string | undefined;
      if (!teamId || !alive) return;

      // Detect Catapult data tier so SquadLoadTable can hide B2-3 columns
      // for Lite teams (those columns will all be NULL → empty cells).
      try {
        const { data: tierData } = await sb.rpc("get_catapult_data_tier", { p_team_id: teamId });
        if (alive) {
          const t = String(tierData ?? "").toLowerCase();
          setCatapultDataTier(t === "full" ? "full" : "lite");
        }
      } catch { /* keep default 'lite' */ }

      const today = new Date().toISOString().slice(0, 10);
      setSquadLoadDate(today);
      const startDate = (() => {
        const d = new Date(`${today}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - 35);
        return d.toISOString().slice(0, 10);
      })();
      const { data: roster } = await sb
        .from("players")
        .select("id, full_name, position")
        .eq("team_id", teamId)
        .eq("is_active", true)
        .order("full_name");
      if (!alive || !roster?.length) { setSquadLoadPlayers([]); return; }
      const playerIds = (roster as Array<{ id: string }>).map((r) => String(r.id));
      const { data: loadData } = await sb
        .from("player_external_load_daily")
        .select("player_id, date, total_distance, high_speed_distance, sprint_distance, high_metabolic_load_distance_m, velocity_band5_total_distance, velocity_band6_total_distance, velocity_band6_total_efforts_gen2, accel_b2_3_tot_effs_gen2, tot_as, decel_b2_3_tot_effs_gen2, tot_ds, total_player_load, player_load_per_minute, max_vel, ima_accel, ima_decel, ima_cod")
        .in("source", ["catapult", "manual"])
        .in("player_id", playerIds)
        .gte("date", startDate)
        .lte("date", today)
        .order("date");
      if (!alive) return;
      const byPlayer = new Map<string, Array<Record<string, unknown>>>();
      for (const row of (loadData ?? []) as Array<Record<string, unknown>>) {
        const pid = String(row.player_id);
        const list = byPlayer.get(pid) ?? [];
        list.push(row);
        byPlayer.set(pid, list);
      }
      const result = (roster as Array<{ id: string; full_name?: string; position?: string }>)
        .filter((p) => (byPlayer.get(String(p.id)) ?? []).length > 0)
        .map((p) => ({
          id: String(p.id),
          name: String(p.full_name ?? ""),
          position: String(p.position ?? "—"),
          history: byPlayer.get(String(p.id)) ?? [],
        }));
      if (alive) setSquadLoadPlayers(result);
    })();
    return () => { alive = false; };
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError(qt("notSignedIn", lang)); return; }

      // Resolve coach's team
      const { data: profile } = await sb
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const teamId = profile?.team_id as string | undefined;
      if (!teamId) { setError(qt("noTeam", lang)); return; }

      const { data: team } = await sb
        .from("teams")
        .select("name, club_short_name, sport")
        .eq("id", teamId)
        .maybeSingle();
      setTeamLabel((team?.club_short_name || team?.name) ?? "");
      setTeamSport((team?.sport as string | null) ?? null);

      // Roster
      const { data: roster, error: rosterErr } = await sb
        .from("players")
        .select("id, full_name, team_id")
        .eq("team_id", teamId);
      if (rosterErr) throw rosterErr;
      const players = (roster ?? []) as RawPlayer[];
      if (players.length === 0) { setPoints([]); return; }
      const playerIds = players.map(p => p.id);

      // Date window — UTC midnight
      const today = new Date();
      const winStart = new Date(today);
      winStart.setUTCDate(today.getUTCDate() - windowDays);
      const chronicStart = new Date(today);
      chronicStart.setUTCDate(today.getUTCDate() - 28);
      const winStartIso = winStart.toISOString().slice(0, 10);
      const chronicStartIso = chronicStart.toISOString().slice(0, 10);

      // External load — last `windowDays` — also pull EDI (di Prampero 2015)
      const { data: extRows, error: extErr } = await sb
        .from("player_external_load_daily")
        .select("player_id, date, total_distance, edi")
        .in("player_id", playerIds)
        .gte("date", winStartIso);
      if (extErr) throw extErr;

      // RPE — last 28 days (need both window window and chronic for ACWR)
      const { data: rpeRows, error: rpeErr } = await sb
        .from("session_rpe_entries")
        .select("player_id, session_date, rpe, duration_minutes, session_load")
        .in("player_id", playerIds)
        .gte("session_date", chronicStartIso);
      if (rpeErr) throw rpeErr;

      // Aggregate
      const agg = new Map<string, Aggregate>();
      for (const p of players) {
        agg.set(p.id, {
          player_id: p.id,
          external_load: 0, internal_cost: 0,
          ext_days: 0, rpe_days: 0,
          acute_int: 0, chronic_int: 0,
          edi_sum: 0, edi_n: 0,
        });
      }

      // External — sum then divide by # days. Also accumulate EDI separately,
      // since some rows have distance but no EDI (when HMLD is missing).
      for (const r of (extRows ?? [])) {
        const a = agg.get((r as any).player_id);
        if (!a) continue;
        const v = Number((r as any).total_distance);
        if (Number.isFinite(v) && v > 0) {
          a.external_load += v;
          a.ext_days += 1;
        }
        const e = Number((r as any).edi);
        if (Number.isFinite(e) && e > 1.0) {  // EDI of exactly 1.0 means no HMLD signal
          a.edi_sum += e;
          a.edi_n += 1;
        }
      }

      // RPE — split between window (acute) and full 28d (chronic)
      const winStartTime = new Date(winStartIso).getTime();
      const acuteSum = new Map<string, { sum: number; n: number }>();
      const chronicSum = new Map<string, { sum: number; n: number }>();
      for (const r of (rpeRows ?? [])) {
        const pid = (r as any).player_id as string;
        const d = (r as any).session_date as string;
        const rpe = Number((r as any).rpe);
        const dur = Number((r as any).duration_minutes ?? 60);
        const sLoad = Number.isFinite((r as any).session_load) ? Number((r as any).session_load) : (rpe * dur);
        if (!Number.isFinite(sLoad) || sLoad <= 0) continue;

        // chronic always
        const c = chronicSum.get(pid) ?? { sum: 0, n: 0 };
        c.sum += sLoad; c.n += 1;
        chronicSum.set(pid, c);

        // acute if in window
        if (new Date(d).getTime() >= winStartTime) {
          const ac = acuteSum.get(pid) ?? { sum: 0, n: 0 };
          ac.sum += sLoad; ac.n += 1;
          acuteSum.set(pid, ac);
        }
      }

      // Convert to averages
      for (const [pid, a] of agg) {
        a.external_load = a.ext_days > 0 ? a.external_load / a.ext_days : 0;
        const ac = acuteSum.get(pid);
        const ch = chronicSum.get(pid);
        a.internal_cost = ac && ac.n > 0 ? ac.sum / ac.n : 0;
        a.rpe_days = ac?.n ?? 0;
        a.acute_int = a.internal_cost;
        a.chronic_int = ch && ch.n > 0 ? ch.sum / ch.n : 0;
      }

      // Build chart points (skip athletes with no data at all)
      const out: QuadrantPoint[] = [];
      for (const p of players) {
        const a = agg.get(p.id);
        if (!a) continue;
        if (a.external_load === 0 && a.internal_cost === 0) continue;
        const acwr = a.chronic_int > 0 ? a.acute_int / a.chronic_int : null;
        let flag: QuadrantPoint["flag"] = "green";
        if (acwr != null) {
          if (acwr >= 1.5) flag = "red";
          else if (acwr >= 1.3) flag = "yellow";
        }
        const avgEdi = a.edi_n > 0 ? a.edi_sum / a.edi_n : null;
        out.push({
          playerId: p.id,
          name: (p.full_name ?? "—").trim(),
          externalLoad: a.external_load,
          internalCost: a.internal_cost,
          acwr,
          edi: avgEdi,
          flag,
        });
      }

      setPoints(out);
      setComputedAt(new Date().toLocaleTimeString(lang === "IS" ? "is-IS" : "en-GB", {
        hour: "2-digit", minute: "2-digit",
      }));
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? qt("errorFetch", lang));
    } finally {
      setLoading(false);
    }
  }

  // Quadrant counts for the summary bar
  const counts = React.useMemo(() => {
    if (points.length === 0) return { risk: 0, decoupled: 0, peak: 0, low: 0 };
    const xs = points.map(p => p.externalLoad).sort((a, b) => a - b);
    const ys = points.map(p => p.internalCost).sort((a, b) => a - b);
    const xMed = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
    const yMed = ys.length % 2 ? ys[(ys.length - 1) / 2] : (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2;
    let risk = 0, decoupled = 0, peak = 0, low = 0;
    for (const p of points) {
      const hi_x = p.externalLoad >= xMed;
      const hi_y = p.internalCost >= yMed;
      if (hi_x && hi_y) risk++;
      else if (!hi_x && hi_y) decoupled++;
      else if (hi_x && !hi_y) peak++;
      else low++;
    }
    return { risk, decoupled, peak, low };
  }, [points]);

  // ── Plain-language verdict inputs (rules, not AI; principle #1) ──────────
  // Recompute the injury-risk + under-stimulated players (with names) so the
  // banner can call them out by name. Same median split as `counts` above —
  // top-right quadrant = high external load + high internal cost.
  const verdict = React.useMemo(() => {
    if (points.length === 0) {
      return { riskPlayers: [] as QuadrantPoint[], lowCount: 0, anyAcwr: false };
    }
    const xs = points.map(p => p.externalLoad).sort((a, b) => a - b);
    const ys = points.map(p => p.internalCost).sort((a, b) => a - b);
    const xMed = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
    const yMed = ys.length % 2 ? ys[(ys.length - 1) / 2] : (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2;
    const riskPlayers: QuadrantPoint[] = [];
    let lowCount = 0;
    let anyAcwr = false;
    for (const p of points) {
      if (p.acwr != null) anyAcwr = true;
      const hi_x = p.externalLoad >= xMed;
      const hi_y = p.internalCost >= yMed;
      if (hi_x && hi_y) riskPlayers.push(p);
      else if (!hi_x && !hi_y) lowCount++;
    }
    // Within the injury-risk zone, surface the highest acute:chronic ratio first
    // (the player whose recent work most outpaces their baseline).
    riskPlayers.sort((a, b) => (b.acwr ?? 0) - (a.acwr ?? 0));
    return { riskPlayers, lowCount, anyAcwr };
  }, [points]);

  // First name only for compact, readable driver chips / sentence.
  const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

  // Build the one-sentence verdict + tone + confidence + drivers.
  // Tone is driven by the injury-risk count (top-right quadrant).
  const banner = React.useMemo(() => {
    const IS = lang === "IS";
    const risk = verdict.riskPlayers;
    const riskN = risk.length;
    const lowN = verdict.lowCount;
    const total = points.length;

    // Confidence: thin rosters or no ACWR baseline → low; otherwise scale by
    // how many players actually have an acute:chronic baseline.
    const acwrCoverage = points.filter(p => p.acwr != null).length;
    const confLevel: "high" | "moderate" | "low" =
      total < 4 ? "low" : acwrCoverage >= Math.ceil(total * 0.6) ? "high" : "moderate";
    const confNote = IS
      ? `${total} leikmenn · ${acwrCoverage} með ${windowDays}d/28d grunnlínu`
      : `${total} players · ${acwrCoverage} with ${windowDays}d/28d baseline`;

    const tone: "good" | "watch" | "concern" =
      riskN >= 3 ? "concern" : riskN >= 1 ? "watch" : "good";

    const riskNames = risk.map(p => firstName(p.name)).filter(Boolean);
    const namesList = riskNames.length > 0
      ? riskNames.slice(0, 4).join(", ") + (riskNames.length > 4 ? (IS ? " o.fl." : ", others") : "")
      : "";

    // One plain sentence — no raw jargon in the headline.
    let sentence: { EN: string; IS: string };
    if (riskN === 0 && lowN === 0) {
      sentence = {
        EN: "Everyone sits in a balanced zone right now — no one is overloaded or coasting.",
        IS: "Allir eru í jafnvægi núna — enginn í ofálagi eða að slóra.",
      };
    } else if (riskN === 0) {
      sentence = {
        EN: `No one is in the injury-risk zone${lowN > 0 ? `; ${lowN} look under-stimulated and could take more` : ""}.`,
        IS: `Enginn er í meiðslahættu-svæðinu${lowN > 0 ? `; ${lowN} virðast undirálagðir og þola meira` : ""}.`,
      };
    } else {
      const playerWord = riskN === 1 ? (IS ? "leikmaður er" : "player sits") : (IS ? "leikmenn eru" : "players sit");
      sentence = {
        EN: `${riskN} ${riskN === 1 ? "player sits" : "players sit"} in the injury-risk zone — working hard and paying a high internal cost${namesList ? ` (${namesList})` : ""}${lowN > 0 ? `; ${lowN} look under-stimulated` : ""}.`,
        IS: `${riskN} ${playerWord} í meiðslahættu-svæðinu — vinna mikið og borga háan innri kostnað${namesList ? ` (${namesList})` : ""}${lowN > 0 ? `; ${lowN} virðast undirálagðir` : ""}.`,
      };
    }

    const subtitle = {
      EN: "Each player is placed by how much they run (external load) against how hard it feels (internal cost). Top-right = lots of both, the zone to watch.",
      IS: "Hver leikmaður er staðsettur eftir því hve mikið hann hleypur (ytra álag) á móti því hve erfitt það er (innri kostnaður). Efst-hægri = mikið af báðu, svæðið til að fylgjast með.",
    };

    // Drivers = the named injury-risk players. Jargon (ACWR) + Gabbett 2017
    // citation lives in each chip's tooltip, never the visible sentence.
    const drivers = risk.slice(0, 6).map(p => {
      const acwrTxt = p.acwr != null ? p.acwr.toFixed(2) : "—";
      return {
        label: firstName(p.name),
        detail: (IS ? "ofálag" : "high load") as string,
        tone: "concern" as const,
        tip: {
          EN: `High external load + high internal cost. Acute:chronic workload ratio (ACWR) ${acwrTxt} — above ~1.3 means recent work is outpacing the player's 28-day baseline (Gabbett 2017).`,
          IS: `Hátt ytra álag + hár innri kostnaður. Bráða:krónísk álagshlutfall (ACWR) ${acwrTxt} — yfir ~1.3 þýðir að nýlegt álag fer fram úr 28-daga grunnlínu leikmanns (Gabbett 2017).`,
        },
      };
    });

    return { tone, sentence, subtitle, drivers, confidence: { level: confLevel, note: confNote } };
  }, [verdict, points, lang, windowDays]);

  const isLite = catapultDataTier !== "full";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {/* ── Plain-language verdict banner (explainability-first) ──────────
          Rules, not AI: tone + sentence + named injury-risk players come from
          the same median-split quadrant logic the count grid + scatter use
          below. Jargon (ACWR + Gabbett 2017) lives in driver tooltips. Gated
          exactly like the chart content: loaded, no error, non-empty. */}
      {!loading && !error && points.length > 0 && (
        <VerdictBanner
          lang={lang === "IS" ? "IS" : "EN"}
          kicker={{ EN: "Quadrant Intelligence", IS: "Quadrant Intelligence" }}
          tone={banner.tone}
          sentence={banner.sentence}
          subtitle={banner.subtitle}
          confidence={banner.confidence}
          drivers={banner.drivers}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900">{qt("pageTitle", lang)}</h1>
            {/* Citation badge — Gabbett 2016 (volume axis only, works on any
                Catapult plan) on Lite, Gabbett 2017 (volume + B2-3 axis,
                higher fidelity) on Full. Both papers are co-authored by
                Tim Gabbett — the 2016 BJSM piece introduced ACWR using
                total distance + sRPE; the 2017 follow-up added explosive-
                effort axes for more granular discrimination. */}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              isLite
                ? "bg-blue-100 text-blue-700"
                : "bg-emerald-100 text-emerald-700"
            }`}>
              {isLite ? "Gabbett 2016 · Volume axis" : "Gabbett 2017 · Full axis"}
            </span>
            {/* Concept credit, distinct from the axis math above: the quadrant
                idea of reading load against response ("data everywhere, insight
                nowhere") is Buchheit 2025. Our axes are ACWR (Gabbett); the
                tooltip keeps that distinction honest rather than implying we
                reproduce that paper's exact load-vs-response axes. */}
            <span
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600"
              title={lang === "IS"
                ? "Quadrant-vöktunaraðferðin (álag lesið á móti svörun) er Buchheit o.fl. 2025. Ásarnir hér eru ACWR (Gabbett); við endurgerum ekki nákvæmu ásana úr þeirri grein."
                : "The quadrant monitoring approach (reading load against response) is Buchheit et al. 2025. The axes here are ACWR (Gabbett); we do not reproduce that paper's exact load-vs-response axes."}
            >
              Buchheit 2025 · Quadrant model
            </span>
          </div>
          <PagePurpose
            en="spot who is in a high-load / low-fitness risk zone at a glance"
            is="sjá hverjir eru í hááálags / lág-forms áhættureit í fljótu bragði"
          />
          <p className="text-sm text-muted-foreground">
            {qt("subtitleA", lang)}
            {teamLabel && <> · {teamLabel}</>}
            {computedAt && <> · {qt("updated", lang)} {computedAt}</>}
          </p>
        </div>
        <div className="flex gap-1">
          {([7, 14, 28] as Window[]).map((d) => (
            <button
              key={d}
              onClick={() => setWindow(d)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                windowDays === d
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d} d
            </button>
          ))}
        </div>
      </div>

      {/* Quadrant counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountCard label={qt("injuryRisk", lang)}      n={counts.risk}      tone="red" />
        <CountCard label={qt("decoupled", lang)}       n={counts.decoupled} tone="yellow" />
        <CountCard label={qt("peakFitness", lang)}     n={counts.peak}      tone="green" />
        <CountCard label={qt("underStimulated", lang)} n={counts.low}       tone="gray" />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {loading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {qt("loadingData", lang)}
          </div>
        )}
        {!loading && error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && !error && points.length === 0 && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {qt("noDataInWindow", lang)}
          </div>
        )}
        {!loading && !error && points.length > 0 && (
          <QuadrantChart
            points={points}
            xLabel={`${qt("xLabel", lang)} ${windowDays}d) →`}
            yLabel={`${qt("yLabel", lang)} ${windowDays}d)`}
          />
        )}
      </div>

      {/* Squad Load — 7d / 28d / ACWR per player per metric. Moved here
          from the GPS Data tab where it was crammed alongside the raw
          daily numbers; this page is the natural home since the
          Quadrant chart above already tells the acute/chronic story
          visually. */}
      {squadLoadPlayers.length > 0 && (
        <SquadLoadTable
          players={squadLoadPlayers}
          date={squadLoadDate || new Date().toISOString().slice(0, 10)}
          sport={teamSport}
          lang={lang === "EN" ? "EN" : "IS"}
          catapultDataTier={catapultDataTier}
        />
      )}

      {/* Helper text below chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-900">{qt("howToRead", lang)}</p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <strong>{qt("injuryRisk", lang)}</strong> {qt("riskExplain", lang)}
          </li>
          <li>
            <strong>{qt("decoupled", lang)}</strong> {qt("decoupledExplain", lang)}
          </li>
          <li>
            <strong>{qt("peakFitness", lang)}</strong> {qt("peakExplain", lang)}
          </li>
          <li>
            <strong>{qt("underStimulated", lang)}</strong> {qt("underExplain", lang)}
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {qt("dotSizeHint", lang)}
        </p>
      </div>

      {/* Quick navigation back */}
      <div className="flex justify-between text-sm">
        <Link href="/coach" className="text-emerald-700 hover:underline">
          {qt("backToDashboard", lang)}
        </Link>
        <Link href="/coach/integrations" className="text-slate-500 hover:underline">
          {qt("addGpsRpe", lang)}
        </Link>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────

function CountCard({ label, n, tone }: { label: string; n: number; tone: "red" | "yellow" | "green" | "gray" }) {
  const palette = {
    red:    { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     num: "text-red-600" },
    yellow: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   num: "text-amber-600" },
    green:  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", num: "text-emerald-600" },
    gray:   { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   num: "text-slate-500" },
  }[tone];
  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} px-4 py-3`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${palette.text}`}>{label}</div>
      <div className={`text-2xl font-bold ${palette.num}`}>{n}</div>
    </div>
  );
}
