"use client";

/**
 * MdHsrComparisonCard — periodization helper showing per-player HSR
 * exposure this week vs that player's personal match-day demand.
 *
 * Why it matters: Buchheit 2018 ("Players need to be exposed to the
 * speeds they'll be required to run at on match day, repeatedly, in
 * training") + Stares 2018 (chronic high-speed exposure protects
 * against acute injury). Standard periodization rule:
 *
 *   ≥95% of MD HSR reached by MD-1 → ready for the match
 *   <80% over the cycle             → injury risk on match day
 *
 * Two MD-baseline strategies, picked automatically:
 *
 *   STRATEGY A — match-derived (preferred)
 *     If the player has appeared in ≥1 match in the last 90 days
 *     (match_player_minutes), the baseline is the median HSR distance
 *     they ran on those dates. This is the canonical Buchheit/Stares
 *     reference because it's what the match actually demanded of them.
 *
 *   STRATEGY B — synthetic top-decile (fallback)
 *     Pre-season, no matches played yet. Use the top 10% of the player's
 *     own session HSR distances as a proxy MD demand. Less accurate but
 *     keeps the card useful from day 1 of pre-season instead of going
 *     dark for 6 weeks until first match. Header badge surfaces which
 *     strategy was used so the coach knows.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

type Strategy = "match" | "synthetic";

type Row = {
  id: string;
  name: string;
  position: string;
  weekHsr: number;        // 7-day sum
  mdBaseline: number;     // per-match HSR (m)
  pct: number | null;     // weekHsr / mdBaseline × 100
  matchSamples: number;   // for strategy=match: how many matches in the window
  synthSamples: number;   // for strategy=synthetic: # sessions used
  strategy: Strategy;
  flag: "under" | "watch" | "ready" | "over" | "insufficient";
};

const I18N = {
  title:    { EN: "MD Comparison — HSR exposure",      IS: "MD Samanburður — HSR exposure" },
  citation: { EN: "Buchheit 2018 · Stares 2018",       IS: "Buchheit 2018 · Stares 2018" },
  subtitle: {
    EN: "Per-player high-speed running this week vs personal match-day demand. The 95% rule (Buchheit): players who reach ≥95% of their MD HSR by MD-1 enter the match prepared. <80% across the cycle = high acute-injury risk.",
    IS: "Eftir-leikmanns high-speed running þessa viku miðað við persónulega kröfu á leikdegi. 95%-reglan (Buchheit): leikmenn sem ná ≥95% af leikdags-HSR sínu fyrir MD-1 mæta tilbúnir í leikinn. <80% yfir hringinn = há acute-injury áhætta.",
  },
  strategyMatch:     { EN: "Match-derived baseline",    IS: "Baseline úr leikjum" },
  strategySynthetic: { EN: "Synthetic baseline (top 10% sessions)", IS: "Synthetic baseline (top 10% æfingar)" },
  player:    { EN: "Player",                IS: "Leikmaður" },
  weekHsr:   { EN: "HSR 7d (m)",            IS: "HSR 7d (m)" },
  mdBase:    { EN: "MD baseline (m)",       IS: "MD baseline (m)" },
  pct:       { EN: "% of MD",               IS: "% af MD" },
  samples:   { EN: "Samples",               IS: "Sýni" },
  status:    { EN: "Status",                IS: "Staða" },
  weekHsrTip: {
    EN: "Total high-speed running distance (>19.8 km/h, GPS V5+V6) accumulated by this player across the last 7 days of training + matches. Includes today. The numerator of the % of MD ratio.",
    IS: "Heildar high-speed running vegalengd (>19.8 km/h, GPS V5+V6) sem leikmaðurinn safnaði yfir síðustu 7 daga (æfingar + leikir). Inniheldur daginn í dag. Teljarinn í % af MD hlutfallinu.",
  },
  mdBaseTip: {
    EN: "Player's personal match-day demand — median HSR distance from their own matches (≥30 min played, DNPs excluded). When the player has ≥1 such match in the last 90 days, uses their own match median. Otherwise we fall back to a synthetic baseline from the player's top 10% training sessions (Buchheit 2018 method).",
    IS: "Persónuleg leikdags-krafa leikmannsins — miðgildi HSR vegalengdar úr hans eigin leikjum (≥30 mín spilaðar, DNP undanskilin). Þegar leikmaðurinn á ≥1 slíkan leik síðustu 90 daga notar kerfið hans eigin leik-miðgildi. Annars föllum við aftur á synthetic baseline úr top 10% æfinga (Buchheit 2018 aðferð).",
  },
  pctTip: {
    EN: "HSR 7d ÷ MD baseline × 100. Buchheit 95% rule: players who reach ≥95% of their match-day demand by MD-1 enter the match prepared. Sustained <80% across the cycle = acute injury risk. >110% = consider easing MD-1 to avoid pre-match fatigue.",
    IS: "HSR 7d ÷ MD baseline × 100. Buchheit 95% reglan: leikmenn sem ná ≥95% af leikdags-kröfu fyrir MD-1 mæta tilbúnir. Viðvarandi <80% yfir hringinn = acute injury risk. >110% = íhuga mýkri MD-1 til að forðast pre-match fatigue.",
  },
  statusTip: {
    EN: "READY 95-110% sweet spot. WATCH 80-95% top up in MD-1. UNDER <80% high injury risk — consider reduced minutes or longer warm-up. OVER >110% modify last session to avoid pre-match fatigue. Status is informational — the coach decides whether to act.",
    IS: "READY 95-110% sweet spot. WATCH 80-95% bæta við í MD-1. UNDER <80% há meiðsla-áhætta — íhuga færri mínútur eða lengri upphitun. OVER >110% breyta síðustu æfingu til að forðast pre-match fatigue. Staða er informational — þjálfari ákveður hvort hann bregst við.",
  },
  flagUnder:        { EN: "UNDER",  IS: "UNDIR" },
  flagWatch:        { EN: "WATCH",  IS: "FYLGJAST MEÐ" },
  flagReady:        { EN: "READY",  IS: "TILBÚIÐ" },
  flagOver:         { EN: "OVER",   IS: "OFAN" },
  flagInsufficient: { EN: "—",      IS: "—" },
  noData:    { EN: "No HSR data in the last 7 days for any player. Sync Catapult or upload CSV.",
               IS: "Engin HSR gögn síðustu 7 daga. Sync-aðu Catapult eða hladdu upp CSV." },
  loading:   { EN: "Loading…", IS: "Hleður…" },
  helpHeader:{ EN: "How to read", IS: "Hvernig á að lesa" },
  help: {
    EN: "READY (95-110%) means the player has matched their typical MD demand this week. OVER (>110%) — last session should be modified to avoid pre-match fatigue. WATCH (80-95%) — top up HSR in MD-1 session. UNDER (<80%) — high injury risk on match day, consider reducing match minutes or extending warm-up.",
    IS: "TILBÚIÐ (95-110%) þýðir að leikmaðurinn hefur náð sínum hefðbundnu MD-kröfum þessa viku. OFAN (>110%) — síðasta æfing ætti að vera mýkri til að forðast pre-match fatigue. FYLGJAST MEÐ (80-95%) — bæta HSR í MD-1 æfingu. UNDIR (<80%) — há meiðsla-áhætta á leikdegi, íhuga að minnka leikmínútur eða lengja upphitun.",
  },
} as const;

function tt<K extends keyof typeof I18N>(k: K, lang: "EN" | "IS"): string {
  return lang === "EN" ? I18N[k].EN : I18N[k].IS;
}

// Reusable info-icon for column headers. Renders a small (i) chip with
// the tooltip text on hover. Same visual style as the Foster Monotony
// + Strain card and Decel Intelligence info icons — keeps the UI
// consistent across all MicroPulse analytical surfaces.
function InfoIcon({ tip }: { tip: string }) {
  return (
    <span
      title={tip}
      aria-label={tip}
      className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700"
    >
      i
    </span>
  );
}

function dateMinusDays(refIso: string, n: number): string {
  const d = new Date(`${refIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Top-decile = mean of the top 10% of the array. Captures "match-like"
 *  hard sessions for the synthetic baseline. Falls back to overall max
 *  if there are fewer than 10 samples. */
function topDecileMean(xs: number[]): number {
  if (xs.length === 0) return 0;
  if (xs.length < 10) return Math.max(...xs);
  const sorted = [...xs].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.1)));
  return top.reduce((s, v) => s + v, 0) / top.length;
}

function flagFromPct(pct: number | null): Row["flag"] {
  if (pct == null) return "insufficient";
  if (pct < 80)   return "under";
  if (pct < 95)   return "watch";
  if (pct <= 110) return "ready";
  return "over";
}

function flagStyle(f: Row["flag"], lang: "EN" | "IS"): { label: string; bg: string; fg: string } {
  switch (f) {
    case "under":         return { label: tt("flagUnder", lang),        bg: "bg-rose-100",   fg: "text-rose-800 font-semibold" };
    case "watch":         return { label: tt("flagWatch", lang),        bg: "bg-amber-100",  fg: "text-amber-800 font-semibold" };
    case "ready":         return { label: tt("flagReady", lang),        bg: "bg-emerald-100",fg: "text-emerald-800 font-semibold" };
    case "over":          return { label: tt("flagOver", lang),         bg: "bg-amber-100",  fg: "text-amber-800 font-semibold" };
    case "insufficient":  return { label: tt("flagInsufficient", lang), bg: "bg-slate-50",   fg: "text-slate-400" };
  }
}

type Props = { teamId: string; refDate?: string; lang?: "EN" | "IS" };

export default function MdHsrComparisonCard({ teamId, refDate, lang = "EN" }: Props) {
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const today = refDate ?? new Date().toISOString().slice(0, 10);
  const win7Start  = React.useMemo(() => dateMinusDays(today, 6),  [today]);
  const win90Start = React.useMemo(() => dateMinusDays(today, 89), [today]);

  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [strategyUsed, setStrategyUsed] = React.useState<Strategy>("synthetic");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        const { data: roster } = await supabase
          .from("players")
          .select("id, full_name, position")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");
        if (!alive) return;
        const players = (roster ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
        if (players.length === 0) { setRows([]); setLoading(false); return; }
        const playerIds = players.map((p) => p.id);

        // 90-day load history (covers both 7d acute window + match-baseline lookup)
        const { data: loadData } = await supabase
          .from("player_external_load_daily")
          .select("player_id, date, high_speed_distance")
          .eq("team_id", teamId)
          .in("source", ["catapult", "manual"])
          .in("player_id", playerIds)
          .gte("date", win90Start)
          .lte("date", today)
          .gt("high_speed_distance", 0);
        const loadRows = (loadData ?? []) as Array<{ player_id: string; date: string; high_speed_distance: number | null }>;

        // Match dates per player from match_player_minutes (only count
        // matches where player actually played — DNPs excluded).
        const { data: matchData } = await supabase
          .from("match_player_minutes")
          .select("player_id, match_date, minutes_played, is_dnp")
          .eq("team_id", teamId)
          .in("player_id", playerIds)
          .gte("match_date", win90Start)
          .lte("match_date", today);
        const matchRows = (matchData ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>;

        const matchDatesByPlayer = new Map<string, Set<string>>();
        for (const m of matchRows) {
          if (m.is_dnp) continue;
          if ((m.minutes_played ?? 0) < 30) continue;  // need meaningful match exposure
          const set = matchDatesByPlayer.get(m.player_id) ?? new Set<string>();
          set.add(m.match_date);
          matchDatesByPlayer.set(m.player_id, set);
        }

        // Decide strategy at the team level: if ANY player has ≥1 match
        // in the window, prefer match-derived. Otherwise everyone falls
        // back to synthetic.
        const anyMatchSamples = Array.from(matchDatesByPlayer.values()).some((s) => s.size >= 1);
        const teamStrategy: Strategy = anyMatchSamples ? "match" : "synthetic";
        if (alive) setStrategyUsed(teamStrategy);

        // Bucket load by player
        const loadByPlayer = new Map<string, Array<{ date: string; hsr: number }>>();
        for (const r of loadRows) {
          const list = loadByPlayer.get(r.player_id) ?? [];
          list.push({ date: r.date, hsr: Number(r.high_speed_distance ?? 0) });
          loadByPlayer.set(r.player_id, list);
        }

        const computed: Row[] = players.map((p) => {
          const hist = loadByPlayer.get(p.id) ?? [];
          const week = hist.filter((r) => r.date >= win7Start);
          const weekHsr = week.reduce((s, r) => s + r.hsr, 0);

          // Per-player baseline. Always TRY match-derived first (a player
          // with their own match samples uses them even if team strategy
          // is synthetic for the rest).
          const matchDates = matchDatesByPlayer.get(p.id) ?? new Set<string>();
          const matchHsrs = hist.filter((r) => matchDates.has(r.date)).map((r) => r.hsr);
          let mdBaseline = 0;
          let strategy: Strategy = "synthetic";
          let matchSamples = 0;
          let synthSamples = 0;
          if (matchHsrs.length >= 1) {
            mdBaseline = median(matchHsrs);
            strategy = "match";
            matchSamples = matchHsrs.length;
          } else {
            const sessionHsrs = hist.map((r) => r.hsr);
            mdBaseline = topDecileMean(sessionHsrs);
            synthSamples = sessionHsrs.length;
          }

          const pct = mdBaseline > 0 ? (weekHsr / 7) * 7 / mdBaseline * 100 : null;
          // ↑ weekHsr/7 × 7 = weekHsr (kept formula explicit so it's
          // obvious we mean total-week HSR / per-match baseline). The
          // result is "you ran X% of one match's HSR over the past
          // 7 days" — Buchheit's preferred framing.

          return {
            id: p.id,
            name: String(p.full_name ?? ""),
            position: String(p.position ?? "—"),
            weekHsr: Math.round(weekHsr),
            mdBaseline: Math.round(mdBaseline),
            pct: pct != null ? Math.round(pct) : null,
            matchSamples,
            synthSamples,
            strategy,
            flag: flagFromPct(pct),
          };
        }).filter((r) => r.weekHsr > 0 || r.mdBaseline > 0);

        // Sort: under-exposed first (highest injury risk on next MD)
        const order: Record<Row["flag"], number> = { under: 0, watch: 1, over: 2, ready: 3, insufficient: 4 };
        computed.sort((a, b) => order[a.flag] - order[b.flag] || a.name.localeCompare(b.name));

        if (alive) setRows(computed);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase, teamId, today, win7Start, win90Start]);

  const strategyBadge = strategyUsed === "match"
    ? { label: tt("strategyMatch", lang), cls: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    : { label: tt("strategySynthetic", lang), cls: "bg-blue-100 text-blue-800 border-blue-300" };

  // Answer-first: one plain sentence a coach reads before the table. Leads with
  // the most actionable case — UNDER (below match-day HSR = high acute risk on
  // the next MD, needs a top-up), then OVER, else all-clear.
  const mdVerdict: string | null = (() => {
    if (loading || rows.length === 0) return null;
    const under = rows.filter((r) => r.flag === "under");
    const over = rows.filter((r) => r.flag === "over");
    const names = (arr: Row[]) =>
      arr.slice(0, 3).map((r) => r.name.split(" ")[0]).join(", ") + (arr.length > 3 ? ` +${arr.length - 3}` : "");
    if (under.length > 0) {
      return lang === "EN"
        ? `${under.length} ${under.length === 1 ? "player is" : "players are"} under their match-day HSR baseline — top up in the MD-1 session: ${names(under)}.`
        : `${under.length} ${under.length === 1 ? "leikmaður er" : "leikmenn eru"} undir sínu leikdags-HSR viðmiði — fylltu í MD-1 æfingunni: ${names(under)}.`;
    }
    if (over.length > 0) {
      return lang === "EN"
        ? `${over.length} ${over.length === 1 ? "player is" : "players are"} over their match-day HSR demand — ease their last session before the game.`
        : `${over.length} ${over.length === 1 ? "leikmaður er" : "leikmenn eru"} yfir sínu leikdags-HSR viðmiði — léttu síðustu æfingu fyrir leik.`;
    }
    return lang === "EN"
      ? "Everyone is at or near their match-day HSR demand this week — no top-ups needed."
      : "Allir eru við eða nálægt sínu leikdags-HSR viðmiði í vikunni — engar viðbætur þarf.";
  })();

  // Layer-1 supporting facts (visible without a click): the furthest-below player
  // and the squad split — the ~15-second read before the full table.
  const mdFacts: string | null = (() => {
    if (loading || rows.length === 0) return null;
    const under = rows.filter((r) => r.flag === "under");
    const watch = rows.filter((r) => r.flag === "watch");
    const ready = rows.filter((r) => r.flag === "ready");
    const over = rows.filter((r) => r.flag === "over");
    const worst = [...under].sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999))[0];
    const split = lang === "IS"
      ? `Staða: ${ready.length} tilbúnir · ${watch.length} að fylla · ${over.length} yfir`
      : `Squad: ${ready.length} ready · ${watch.length} to top up · ${over.length} over`;
    if (worst && worst.pct != null) {
      return lang === "IS"
        ? `Lengst undir: ${worst.name.split(" ")[0]} (${Math.round(worst.pct)}% af leikdags-HSR). ${split}.`
        : `Furthest below: ${worst.name.split(" ")[0]} at ${Math.round(worst.pct)}% of his match-day HSR. ${split}.`;
    }
    return `${split}.`;
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base flex-wrap">
              <span>{tt("title", lang)}</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
                {tt("citation", lang)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${strategyBadge.cls}`}>
                {strategyBadge.label}
              </span>
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-xs">
              {tt("subtitle", lang)}
            </CardDescription>
          </div>
          <CoachTutorialButton slug="md-hsr-comparison" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {mdVerdict && (
          <div className="border-b border-slate-100 px-6 py-3">
            <p className="text-sm font-medium text-slate-800">{mdVerdict}</p>
            {mdFacts && <p className="mt-0.5 text-xs text-slate-500">{mdFacts}</p>}
          </div>
        )}
        {loading && (
          <div className="px-6 py-10 text-center text-sm text-slate-400">{tt("loading", lang)}</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-slate-400">{tt("noData", lang)}</div>
        )}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{tt("player", lang)}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      {tt("weekHsr", lang)}
                      <InfoIcon tip={tt("weekHsrTip", lang)} />
                    </span>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      {tt("mdBase", lang)}
                      <InfoIcon tip={tt("mdBaseTip", lang)} />
                    </span>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      {tt("pct", lang)}
                      <InfoIcon tip={tt("pctTip", lang)} />
                    </span>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">{tt("samples", lang)}</th>
                  <th className="px-4 py-2 text-center font-medium">
                    <span className="inline-flex items-center justify-center gap-1">
                      {tt("status", lang)}
                      <InfoIcon tip={tt("statusTip", lang)} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const fs = flagStyle(r.flag, lang);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-900">{r.name || "—"}</div>
                        <div className="text-[11px] text-slate-500">{r.position}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-medium">
                        {r.weekHsr.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {r.mdBaseline > 0 ? r.mdBaseline.toLocaleString() : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${fs.fg}`}>
                        {r.pct == null ? "—" : `${r.pct}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[11px] text-slate-500">
                        {r.strategy === "match"
                          ? `${r.matchSamples} match`
                          : `${r.synthSamples} sess`}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${fs.bg} ${fs.fg}`}>
                          {fs.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="font-semibold text-slate-700">{tt("helpHeader", lang)}</div>
            <p className="mt-1">{tt("help", lang)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
