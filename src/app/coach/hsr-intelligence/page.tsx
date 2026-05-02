"use client";

/**
 * Coach view — HSR Intelligence (Malone 2017 + Buchheit 2014).
 *
 * The McBurnie-equivalent page for clubs on Lite Catapult plans (no B2-3
 * efforts exposed). Built on three independently-validated sport-science
 * findings that work on the metrics every Catapult tier exposes:
 *
 *   1. Malone et al. 2017 (BJSM) — High-speed running + sprint distance
 *      per week predict soft-tissue (esp. hamstring) injuries. ACWR
 *      thresholds: >1.5 high risk, <0.8 high risk (under-training paradox).
 *
 *   2. Buchheit & Mendez-Villanueva 2014 — Players who reach ≥95% of their
 *      personal maximum velocity regularly have FEWER hamstring strains.
 *      Players who never approach MaxV are at higher risk of acute injury
 *      when they're forced to (e.g. competitive match).
 *
 *   3. Bowen et al. 2017 — Combining HSR ACWR with chronic load magnitude
 *      improves prediction over either alone. High-chronic / low-acute
 *      players are protected; high-chronic / high-acute = highest risk.
 *
 * Not shown to FULL Catapult teams — they have /coach/decel-intelligence
 * (McBurnie 2022 4-dimension framework on B2-3 efforts) instead, which
 * is higher-fidelity for clubs paying for Premium reporting.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLang } from "@/lib/lang";

type Flag = "green" | "yellow" | "red" | "insufficient";

type PlayerHsrSnapshot = {
  id: string;
  name: string;
  position: string;

  // Volume — past 7 days vs past 28 days
  hsr_7d_total: number;
  hsr_28d_avg_per_day: number;
  hsr_acwr: number | null;            // null when chronic = 0
  hsr_flag: Flag;

  // Sprint
  sprint_dist_7d: number;
  sprint_efforts_7d: number;
  sprint_efforts_28d_avg: number;
  sprint_acwr: number | null;
  sprint_flag: Flag;

  // Max-V exposure (Buchheit & Mendez-Villanueva 2014)
  personal_max_v: number | null;      // all-time max in player's history
  recent_max_v: number | null;        // best max_vel in last 28 days
  pct_max_v: number | null;           // recent / personal × 100
  max_v_flag: Flag;
  high_max_v_sessions_28d: number;    // count of sessions where max_vel ≥ 95% personal max

  // Days with data in the windows (for compliance display)
  days_7d: number;
  days_28d: number;

  // Combined verdict — worst of the three flags drives this
  overall_flag: Flag;
};

const HSR_I18N = {
  pageTitle:    { EN: "HSR Intelligence",                IS: "HSR Intelligence" },
  citation:     { EN: "Malone 2017 · Buchheit 2014",     IS: "Malone 2017 · Buchheit 2014" },
  subtitle:     {
    EN: "Per-player hamstring/soft-tissue injury monitoring built on the metrics every Catapult plan exposes. The Lite-tier equivalent of Decel Intelligence — same evidence quality (BJSM-published), different inputs.",
    IS: "Eftir-leikmanns greining á hamstring og soft-tissue meiðsla-áhættu byggð á gögnum sem öll Catapult plön exposa. Lite-jafngildi Decel Intelligence — sama vísindagrunnur (BJSM), önnur input.",
  },

  player:       { EN: "Player",                  IS: "Leikmaður" },
  hsr7d:        { EN: "HSR 7d (m)",              IS: "HSR 7d (m)" },
  hsrAcwr:      { EN: "HSR ACWR",                IS: "HSR ACWR" },
  sprint7d:     { EN: "Sprint 7d (m)",           IS: "Sprint 7d (m)" },
  sprintEffs:   { EN: "Sprint efforts 7d (#)",   IS: "Sprint efforts 7d (#)" },
  sprintAcwr:   { EN: "Sprint ACWR",             IS: "Sprint ACWR" },
  pctMaxV:      { EN: "%MaxV (28d)",             IS: "%MaxV (28d)" },
  maxVSessions: { EN: "≥95% MaxV sessions",      IS: "≥95% MaxV sessions" },
  status:       { EN: "Status",                  IS: "Staða" },
  days:         { EN: "Days 7/28",               IS: "Dagar 7/28" },

  noData: {
    EN: "No GPS data in the last 28 days. Sync Catapult or upload a CSV first.",
    IS: "Engin GPS gögn síðustu 28 daga. Sync-aðu Catapult eða hladdu upp CSV.",
  },
  loading: { EN: "Loading…", IS: "Hleður…" },

  helpHeader: { EN: "How to read this", IS: "Hvernig á að lesa þetta" },
  help: {
    EN: "HSR ACWR >1.5 → soft-tissue injury risk +200% (Malone 2017). HSR ACWR <0.8 with high chronic load → de-training paradox, +130% risk. %MaxV <90% over 28d → max-velocity under-exposure, raises hamstring risk on next acute sprint demand (Buchheit 2014). The combined verdict picks the worst of three flags.",
    IS: "HSR ACWR >1.5 → soft-tissue meiðsla-áhætta +200% (Malone 2017). HSR ACWR <0.8 með háan chronic load → de-training paradox, +130% áhætta. %MaxV <90% yfir 28d → max-velocity under-exposure, hækkar hamstring-áhættu í næstu acute sprint kröfu (Buchheit 2014). Combined verdict tekur versta af þremur fánum.",
  },

  flagGreen:        { EN: "Healthy",      IS: "Heilbrigt" },
  flagYellow:       { EN: "Watch",        IS: "Fylgjast með" },
  flagRed:          { EN: "High risk",    IS: "Há áhætta" },
  flagInsufficient: { EN: "Need more data", IS: "Þarf meiri gögn" },

  reasonHsrSpike:   { EN: "HSR spike (acute >>chronic)",       IS: "HSR spike (acute >>chronic)" },
  reasonHsrCrash:   { EN: "HSR crash (de-training risk)",      IS: "HSR crash (de-training áhætta)" },
  reasonSprintSpike:{ EN: "Sprint spike",                      IS: "Sprint spike" },
  reasonMaxVUnder:  { EN: "Max-V under-exposure",              IS: "Max-V under-exposure" },

  notSignedIn: { EN: "Not signed in", IS: "Ekki innskráður" },
  noTeam:      { EN: "Not connected to a team", IS: "Ekki tengdur við lið" },
  back:        { EN: "← Back to dashboard", IS: "← Til baka á dashboard" },
} as const;

function tt<K extends keyof typeof HSR_I18N>(k: K, lang: "EN" | "IS"): string {
  return lang === "EN" ? HSR_I18N[k].EN : HSR_I18N[k].IS;
}

function dateMinusDays(refIso: string, n: number): string {
  const d = new Date(`${refIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Flag thresholds ────────────────────────────────────────────────────
// Direct from Malone 2017 (HSR/Sprint ACWR) + Buchheit 2014 (MaxV).

function hsrAcwrFlag(acwr: number | null, chronic_avg: number): Flag {
  if (acwr == null) return "insufficient";
  // Spike: acute >> chronic → injury risk
  if (acwr > 1.5) return "red";
  if (acwr > 1.3) return "yellow";
  // Crash: acute < chronic with HIGH chronic → de-training paradox
  // (low chronic with low acute is normal preseason — not flagged)
  if (acwr < 0.8 && chronic_avg > 200) return "yellow";
  return "green";
}

function sprintAcwrFlag(acwr: number | null): Flag {
  if (acwr == null) return "insufficient";
  if (acwr > 1.5) return "red";
  if (acwr > 1.3) return "yellow";
  // Sprint UNDER-load is less injury-relevant than HSR (sprints are
  // discrete events) — don't flag low ACWR.
  return "green";
}

function maxVFlag(pct: number | null, sessionCount: number, daysWithData: number): Flag {
  if (pct == null || daysWithData < 5) return "insufficient";
  // Buchheit: ≥1 session per week at ≥95% MaxV is the protective dose.
  // 28d window → ≥4 such sessions = protected; 0 = under-exposed.
  if (sessionCount === 0 && pct < 90) return "red";   // never close to MaxV
  if (sessionCount < 2 && pct < 92) return "yellow";  // rarely close to MaxV
  return "green";
}

// Pick the most severe flag across the three signals
function combinedFlag(...flags: Flag[]): Flag {
  if (flags.includes("red")) return "red";
  if (flags.includes("yellow")) return "yellow";
  if (flags.every((f) => f === "insufficient")) return "insufficient";
  return "green";
}

function flagStyle(f: Flag, lang: "EN" | "IS"): { label: string; bg: string; fg: string } {
  switch (f) {
    case "red":          return { label: tt("flagRed", lang),          bg: "bg-rose-100",   fg: "text-rose-800 font-semibold" };
    case "yellow":       return { label: tt("flagYellow", lang),       bg: "bg-amber-100",  fg: "text-amber-800 font-semibold" };
    case "green":        return { label: tt("flagGreen", lang),        bg: "bg-emerald-50", fg: "text-emerald-800" };
    case "insufficient": return { label: tt("flagInsufficient", lang), bg: "bg-slate-100",  fg: "text-slate-600" };
  }
}

// Tiny inline value-cell helper that color-codes a metric based on its flag
function valueCell(value: string, flag: Flag) {
  const cls = flag === "red"
    ? "text-rose-700 font-semibold"
    : flag === "yellow"
    ? "text-amber-700 font-semibold"
    : flag === "insufficient"
    ? "text-slate-400"
    : "text-slate-900";
  return <span className={`tabular-nums ${cls}`}>{value}</span>;
}

type RawRow = {
  player_id: string;
  date: string;
  high_speed_distance: number | null;
  sprint_distance: number | null;
  velocity_band6_total_efforts_gen2: number | null;
  max_vel: number | null;
};

export default function HsrIntelligencePage() {
  const [lang] = useLang();
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [rows, setRows]       = React.useState<PlayerHsrSnapshot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError]     = React.useState<string | null>(null);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const win28Start = React.useMemo(() => dateMinusDays(today, 27), [today]);
  const win7Start  = React.useMemo(() => dateMinusDays(today, 6),  [today]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError(tt("notSignedIn", lang)); return; }

        const { data: profile } = await supabase
          .from("profiles").select("team_id").eq("id", user.id).maybeSingle();
        const teamId = (profile as { team_id?: string | null } | null)?.team_id ?? null;
        if (!teamId) { setError(tt("noTeam", lang)); return; }

        // Roster
        const { data: rosterData } = await supabase
          .from("players")
          .select("id, full_name, position")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");
        if (!alive) return;
        const roster = (rosterData ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
        if (roster.length === 0) { setRows([]); return; }
        const playerIds = roster.map((p) => p.id);

        // 28-day load history (covers both 7d acute + 28d chronic windows)
        const { data: loadData } = await supabase
          .from("player_external_load_daily")
          .select("player_id, date, high_speed_distance, sprint_distance, velocity_band6_total_efforts_gen2, max_vel")
          .eq("team_id", teamId)
          .in("source", ["catapult", "manual"])
          .in("player_id", playerIds)
          .gte("date", win28Start)
          .lte("date", today);
        const histRows = (loadData ?? []) as RawRow[];

        // Personal all-time MaxV per player — the personal-baseline anchor
        // for the Buchheit %MaxV metric. 365-day lookback is enough; if a
        // player has older history their max comes back via aggregate.
        const yearAgo = dateMinusDays(today, 365);
        const { data: yearData } = await supabase
          .from("player_external_load_daily")
          .select("player_id, max_vel")
          .eq("team_id", teamId)
          .in("source", ["catapult", "manual"])
          .in("player_id", playerIds)
          .gte("date", yearAgo)
          .gt("max_vel", 0);
        const personalMaxV = new Map<string, number>();
        for (const r of (yearData ?? []) as Array<{ player_id: string; max_vel: number | null }>) {
          const v = Number(r.max_vel ?? 0);
          if (!Number.isFinite(v) || v <= 0) continue;
          const cur = personalMaxV.get(r.player_id) ?? 0;
          if (v > cur) personalMaxV.set(r.player_id, v);
        }

        // Bucket histRows by player
        const byPlayer = new Map<string, RawRow[]>();
        for (const r of histRows) {
          const list = byPlayer.get(r.player_id) ?? [];
          list.push(r);
          byPlayer.set(r.player_id, list);
        }

        const computed: PlayerHsrSnapshot[] = roster.map((p) => {
          const hist = byPlayer.get(p.id) ?? [];

          // 7d window
          const last7 = hist.filter((r) => r.date >= win7Start && r.date <= today);
          const days_7d = new Set(last7.map((r) => r.date)).size;
          const hsr_7d_total      = last7.reduce((s, r) => s + Number(r.high_speed_distance ?? 0), 0);
          const sprint_dist_7d    = last7.reduce((s, r) => s + Number(r.sprint_distance ?? 0), 0);
          const sprint_efforts_7d = last7.reduce((s, r) => s + Number(r.velocity_band6_total_efforts_gen2 ?? 0), 0);

          // 28d window (full history we fetched is 28d)
          const days_28d = new Set(hist.map((r) => r.date)).size;
          const hsr_28d_total       = hist.reduce((s, r) => s + Number(r.high_speed_distance ?? 0), 0);
          const sprint_efforts_28d  = hist.reduce((s, r) => s + Number(r.velocity_band6_total_efforts_gen2 ?? 0), 0);

          const hsr_28d_avg_per_day = days_28d > 0 ? hsr_28d_total / 28 : 0;
          const hsr_7d_avg_per_day  = days_7d  > 0 ? hsr_7d_total / 7  : 0;
          const sprint_efforts_28d_avg = days_28d > 0 ? sprint_efforts_28d / 28 : 0;
          const sprint_efforts_7d_avg  = days_7d  > 0 ? sprint_efforts_7d  / 7  : 0;

          const hsr_acwr    = hsr_28d_avg_per_day    > 0 ? hsr_7d_avg_per_day    / hsr_28d_avg_per_day    : null;
          const sprint_acwr = sprint_efforts_28d_avg > 0 ? sprint_efforts_7d_avg / sprint_efforts_28d_avg : null;

          // %MaxV (Buchheit). Recent best in the 28d window vs personal
          // all-time best from the 365d lookback.
          const recent_max_v = hist.reduce((m, r) => {
            const v = Number(r.max_vel ?? 0);
            return v > m ? v : m;
          }, 0);
          const personal = personalMaxV.get(p.id) ?? recent_max_v;  // fall back to recent if no longer history
          const pct_max_v = personal > 0 ? (recent_max_v / personal) * 100 : null;
          const high_max_v_sessions_28d = hist.filter((r) => {
            const v = Number(r.max_vel ?? 0);
            return personal > 0 && v >= personal * 0.95;
          }).length;

          const hsr_flag    = hsrAcwrFlag(hsr_acwr, hsr_28d_avg_per_day);
          const sprint_flag = sprintAcwrFlag(sprint_acwr);
          const max_v_flag  = maxVFlag(pct_max_v, high_max_v_sessions_28d, days_28d);
          const overall_flag = combinedFlag(hsr_flag, sprint_flag, max_v_flag);

          return {
            id: p.id,
            name: String(p.full_name ?? ""),
            position: String(p.position ?? "—"),
            hsr_7d_total: Math.round(hsr_7d_total),
            hsr_28d_avg_per_day: Math.round(hsr_28d_avg_per_day),
            hsr_acwr,
            hsr_flag,
            sprint_dist_7d: Math.round(sprint_dist_7d),
            sprint_efforts_7d: Math.round(sprint_efforts_7d),
            sprint_efforts_28d_avg: Math.round(sprint_efforts_28d_avg * 10) / 10,
            sprint_acwr,
            sprint_flag,
            personal_max_v: personal > 0 ? Math.round(personal * 10) / 10 : null,
            recent_max_v: recent_max_v > 0 ? Math.round(recent_max_v * 10) / 10 : null,
            pct_max_v: pct_max_v != null ? Math.round(pct_max_v * 10) / 10 : null,
            max_v_flag,
            high_max_v_sessions_28d,
            days_7d,
            days_28d,
            overall_flag,
          };
        });

        // Filter out players who have NO data in the 28d window — they're
        // not actively training so flagging them is noise.
        const withData = computed.filter((r) => r.days_28d >= 1);

        // Sort by overall flag severity, then alphabetical
        const order: Record<Flag, number> = { red: 0, yellow: 1, green: 2, insufficient: 3 };
        withData.sort((a, b) => order[a.overall_flag] - order[b.overall_flag] || a.name.localeCompare(b.name));

        if (alive) setRows(withData);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase, today, win28Start, win7Start, lang]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900">{tt("pageTitle", lang)}</h1>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
              {tt("citation", lang)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1">
            {tt("subtitle", lang)}
          </p>
        </div>
        <Link href="/coach" className="text-sm text-slate-500 hover:text-slate-700">
          {tt("back", lang)}
        </Link>
      </div>

      {/* Error / loading / empty states */}
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
      )}
      {loading && !error && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">{tt("loading", lang)}</div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">{tt("noData", lang)}</div>
      )}

      {/* Per-player table */}
      {!loading && !error && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {lang === "EN" ? "Squad — HSR / Sprint / MaxV exposure" : "Lið — HSR / Sprint / MaxV exposure"}
            </CardTitle>
            <CardDescription className="text-xs">
              {lang === "EN"
                ? "Sorted by risk severity (red → green). Each value is color-coded by its individual sub-flag; the rightmost column is the worst-of-three combined verdict."
                : "Raðað eftir áhættustigi (rautt → grænt). Hvert gildi er litakóðað eftir sínum eigin sub-flagi; síðasti dálkurinn er versta-af-þremur combined verdict."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">{tt("player", lang)}</th>
                    <th className="px-3 py-2 text-right font-medium">{tt("days", lang)}</th>
                    <th className="px-3 py-2 text-right font-medium">{tt("hsr7d", lang)}</th>
                    <th className="px-3 py-2 text-right font-medium">{tt("hsrAcwr", lang)}</th>
                    <th className="px-3 py-2 text-right font-medium">{tt("sprint7d", lang)}</th>
                    <th className="px-3 py-2 text-right font-medium">{tt("sprintAcwr", lang)}</th>
                    <th className="px-3 py-2 text-right font-medium">{tt("pctMaxV", lang)}</th>
                    <th className="px-3 py-2 text-right font-medium">{tt("maxVSessions", lang)}</th>
                    <th className="px-4 py-2 text-center font-medium">{tt("status", lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const overall = flagStyle(r.overall_flag, lang);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-900">{r.name || "—"}</div>
                          <div className="text-[11px] text-slate-500">{r.position}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {r.days_7d}/{r.days_28d}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {valueCell(r.hsr_7d_total.toLocaleString(), r.hsr_flag)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {valueCell(r.hsr_acwr == null ? "—" : r.hsr_acwr.toFixed(2), r.hsr_flag)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {valueCell(r.sprint_dist_7d.toLocaleString(), r.sprint_flag)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {valueCell(r.sprint_acwr == null ? "—" : r.sprint_acwr.toFixed(2), r.sprint_flag)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {valueCell(r.pct_max_v == null ? "—" : `${r.pct_max_v.toFixed(0)}%`, r.max_v_flag)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {valueCell(`${r.high_max_v_sessions_28d}`, r.max_v_flag)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${overall.bg} ${overall.fg}`}>
                            {overall.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Help footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700">{tt("helpHeader", lang)}</div>
              <p className="mt-1">{tt("help", lang)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
