"use client";

/**
 * TitanMovementIntelligence — the Titan (indoor IMU) variant of IMA Intelligence.
 *
 * The Catapult IMA page is built on GPS/Free-Running strides + CoD L/R asymmetry, none of which a
 * Titan indoor-IMU team produces. This renders the equivalent "what did today's session deliver,
 * biomechanically?" read from the variables Titan genuinely reports: the IMU Load Index, jumps,
 * impacts and the Movement-Profile time-in-intensity (settled / low / mid / high) — each read against
 * the player's OWN recent norm (28-day training-day mean), the same personal-norm philosophy as the
 * Catapult page. Descriptive and motivating; never a readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Lang } from "@/lib/lang";
import VerdictBanner, { type VerdictDriver } from "@/components/coach/VerdictBanner";
import ShowDetails from "@/components/common/ShowDetails";

type DayRow = {
  date: string;
  loadIndex: number | null;
  jumps: number | null;
  impacts: number | null;
  settled: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
};

type PlayerDay = {
  playerId: string;
  name: string;
  today: DayRow | null;
  /** 28-day training-day means (value > 0) for each metric, or null when too few days. */
  norm: { loadIndex: number | null; jumps: number | null; impacts: number | null; high: number | null };
  baselineDays: number;
};

const WINDOW_DAYS = 34;

function daysAgoIso(ref: string, n: number): string {
  const d = new Date(`${ref}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const mean = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x != null && x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pctOf = (today: number | null, norm: number | null): number | null =>
  today != null && norm != null && norm > 0 ? Math.round((today / norm) * 100) : null;

function toneClass(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct >= 150) return "text-rose-600 font-semibold";
  if (pct >= 130) return "text-amber-600 font-semibold";
  if (pct < 70) return "text-blue-600";
  return "text-slate-700";
}

export default function TitanMovementIntelligence({
  teamId,
  date,
  lang,
}: {
  teamId: string | null;
  date: string;
  lang: Lang;
}) {
  const isIS = lang === "IS";
  const [rows, setRows] = React.useState<PlayerDay[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      if (!teamId) { if (alive) { setRows([]); setLoading(false); } return; }
      try {
        const sb = getSupabaseClient();
        const { data: players } = await sb
          .from("players")
          .select("id, full_name")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");
        const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
        if (roster.length === 0) { if (alive) { setRows([]); setLoading(false); } return; }

        const since = daysAgoIso(date, WINDOW_DAYS);
        const { data: raw } = await sb
          .from("player_external_load_daily")
          .select("player_id, date, source, total_player_load, player_load, jumps, impacts, raw_payload_json")
          .in("player_id", roster.map((p) => p.id))
          .eq("source", "titan")
          .gte("date", since)
          .lte("date", date);

        const byPlayer = new Map<string, DayRow[]>();
        for (const r of (raw ?? []) as Array<Record<string, unknown>>) {
          const mp = (r.raw_payload_json as { movement_profile?: Record<string, number | null> } | null)?.movement_profile ?? null;
          const row: DayRow = {
            date: String(r.date),
            loadIndex: n(r.total_player_load) ?? n(r.player_load),
            jumps: n(r.jumps),
            impacts: n(r.impacts),
            settled: n(mp?.settled), low: n(mp?.low), mid: n(mp?.mid), high: n(mp?.high),
          };
          const list = byPlayer.get(String(r.player_id)) ?? [];
          list.push(row);
          byPlayer.set(String(r.player_id), list);
        }

        const out: PlayerDay[] = roster.map((p) => {
          const hist = (byPlayer.get(p.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1));
          const today = hist.find((h) => h.date === date) ?? null;
          const prior = hist.filter((h) => h.date < date);
          const baselineDays = prior.filter((h) => (h.loadIndex ?? 0) > 0 || (h.jumps ?? 0) > 0 || (h.impacts ?? 0) > 0).length;
          return {
            playerId: p.id,
            name: p.full_name ?? "—",
            today,
            norm: {
              loadIndex: mean(prior.map((h) => h.loadIndex)),
              jumps: mean(prior.map((h) => h.jumps)),
              impacts: mean(prior.map((h) => h.impacts)),
              high: mean(prior.map((h) => h.high)),
            },
            baselineDays,
          };
        });
        if (alive) { setRows(out); setLoading(false); }
      } catch {
        if (alive) { setRows([]); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [teamId, date]);

  const captured = rows.filter((r) => r.today && ((r.today.loadIndex ?? 0) > 0 || (r.today.jumps ?? 0) > 0 || (r.today.impacts ?? 0) > 0));

  // ── Verdict (rules, not AI): players whose Load Index today ran well above their own norm. ──
  const verdict = React.useMemo(() => {
    const withNorm = captured.filter((r) => r.norm.loadIndex != null);
    const spikes = withNorm
      .map((r) => ({ r, pct: pctOf(r.today!.loadIndex, r.norm.loadIndex) }))
      .filter((x): x is { r: PlayerDay; pct: number } => x.pct != null && x.pct >= 150)
      .sort((a, b) => b.pct - a.pct);
    const level: "high" | "moderate" | "low" =
      withNorm.length === 0 ? "low" : withNorm.length >= 6 ? "high" : "moderate";
    const drivers: VerdictDriver[] = spikes.map(({ r, pct }) => ({
      label: r.name,
      detail: { EN: `${pct}% of usual`, IS: `${pct}% af venju` },
      tone: "concern" as const,
      tip: {
        EN: `IMU Load Index ${pct}% of his recent training norm today — an acute spike. Spread high-load sessions across the week.`,
        IS: `IMU Álagsvísitala ${pct}% af nýlegri æfingaviðmiðun í dag — bráð toppur. Dreifðu háálags-æfingum yfir vikuna.`,
      },
    }));
    if (captured.length === 0) {
      return {
        tone: "neutral" as const,
        sentence: { EN: "No Titan movement data captured for this day yet.", IS: "Engin Titan-hreyfigögn skráð fyrir þennan dag enn." },
        confidence: { level: "low" as const, note: { EN: "no players captured", IS: "engir leikmenn með gögn" } },
        drivers: [] as VerdictDriver[],
      };
    }
    if (spikes.length === 0) {
      return {
        tone: "good" as const,
        sentence: { EN: "Every player's IMU load today was within their own normal range.", IS: "IMU-álag allra leikmanna í dag var innan þeirra eigin venju." },
        confidence: { level, note: { EN: `${withNorm.length} compared to their own norm`, IS: `${withNorm.length} bornir saman við eigin venju` } },
        drivers,
      };
    }
    const names = spikes.map((s) => s.r.name).join(", ");
    return {
      tone: "concern" as const,
      sentence: {
        EN: `${spikes.length} player${spikes.length === 1 ? "" : "s"} carried well above their own usual IMU load today — ${names}.`,
        IS: `${spikes.length} leikm${spikes.length === 1 ? "aður" : "enn"} báru langt yfir sína venju í IMU-álagi í dag — ${names}.`,
      },
      confidence: { level, note: { EN: `${withNorm.length} compared to their own norm`, IS: `${withNorm.length} bornir saman við eigin venju` } },
      drivers,
    };
  }, [captured]);

  const subtitle = {
    EN: "Titan indoor IMU — the IMU Load Index, jumps, impacts and time-in-intensity your pods capture. Each read against the player's own recent training norm.",
    IS: "Titan innidyra-IMU — IMU Álagsvísitala, stökk, impacts og tími-í-ákefð sem pod-arnir mæla. Hvert lesið á móti nýlegri æfingaviðmiðun leikmannsins.",
  };

  // Team KPI averages for the day + movement-profile band totals.
  const avg = (sel: (r: PlayerDay) => number | null) => mean(captured.map(sel));
  const tLoad = avg((r) => r.today!.loadIndex);
  const tJumps = avg((r) => r.today!.jumps);
  const tImpacts = avg((r) => r.today!.impacts);
  const bandTot = (sel: (d: DayRow) => number | null) => captured.reduce((a, r) => a + (sel(r.today!) ?? 0), 0);
  const settledT = bandTot((d) => d.settled), lowT = bandTot((d) => d.low), midT = bandTot((d) => d.mid), highT = bandTot((d) => d.high);
  const bandSum = settledT + lowT + midT + highT;
  const fmt = (v: number | null, digits = 0) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">{isIS ? "Hleð…" : "Loading…"}</div>;
  }

  return (
    <>
      <div className="mb-6">
        <VerdictBanner
          lang={lang}
          tone={verdict.tone}
          sentence={verdict.sentence}
          subtitle={subtitle}
          confidence={verdict.confidence}
          drivers={verdict.drivers}
          kicker={{ EN: "Movement intelligence", IS: "Hreyfigreining" }}
        />
      </div>

      {captured.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {isIS
            ? "Engin Titan-hreyfigögn fyrir þennan dag. Hladdu inn _synced_data skránni (Titan-síðan eða „í dag“ kortið) og þessi síða fyllist."
            : "No Titan movement data for this day. Upload the _synced_data export (the Titan page or the Today card) and this page fills in."}
        </div>
      ) : (
        <>
          {/* Team KPI strip */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">
              {isIS ? "Æfing dagsins — lið (meðaltal)" : "Today's session — team (average)"}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label={isIS ? "Álagsvísitala" : "Load Index"} value={fmt(tLoad, 1)} />
              <Kpi label={isIS ? "Stökk" : "Jumps"} value={fmt(tJumps)} />
              <Kpi label="Impacts" value={fmt(tImpacts)} />
              <Kpi label={isIS ? "Leikmenn með gögn" : "Players captured"} value={`${captured.length} / ${rows.length}`} />
            </div>

            {/* Movement-Profile band stripe (team time-in-intensity) */}
            {bandSum > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  {isIS ? "Hreyfiprófíll — tími í ákefð (lið)" : "Movement profile — time in intensity (team)"}
                </div>
                <div className="flex h-6 w-full overflow-hidden rounded-md border border-slate-300 bg-white">
                  {([
                    { v: settledT, cls: "bg-slate-300", label: isIS ? "Kyrr" : "Settled" },
                    { v: lowT, cls: "bg-sky-400", label: isIS ? "Lágt" : "Low" },
                    { v: midT, cls: "bg-amber-400", label: isIS ? "Miðlungs" : "Mid" },
                    { v: highT, cls: "bg-rose-500", label: isIS ? "Hátt" : "High" },
                  ] as const).map((b) => {
                    const w = (b.v / bandSum) * 100;
                    return w > 0 ? (
                      <div key={b.label} className={`${b.cls} flex items-center justify-center text-[10px] font-semibold text-white`} style={{ width: `${w}%` }} title={b.label}>
                        {w >= 8 ? `${Math.round(w)}%` : ""}
                      </div>
                    ) : null;
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                  <span>{isIS ? "Kyrr" : "Settled"}</span><span>{isIS ? "Lágt" : "Low"}</span>
                  <span>{isIS ? "Miðlungs" : "Mid"}</span><span>{isIS ? "Hátt" : "High"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Per-player table */}
          <ShowDetails
            label={{ EN: "Per-player breakdown", IS: "Sundurliðun per leikmann" }}
            hint={{ EN: `${captured.length} players`, IS: `${captured.length} leikmenn` }}
            className="mb-6 mt-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{isIS ? "Leikmaður" : "Player"}</th>
                    <th className="px-3 py-2 text-right font-semibold">{isIS ? "Álagsvísitala" : "Load Index"}</th>
                    <th className="px-3 py-2 text-right font-medium">{isIS ? "vs venja" : "vs norm"}</th>
                    <th className="px-3 py-2 text-right font-medium">{isIS ? "Stökk" : "Jumps"}</th>
                    <th className="px-3 py-2 text-right font-medium">Impacts</th>
                    <th className="px-3 py-2 text-right font-medium">{isIS ? "Kyrr" : "Settled"}</th>
                    <th className="px-3 py-2 text-right font-medium">{isIS ? "Lágt" : "Low"}</th>
                    <th className="px-3 py-2 text-right font-medium">{isIS ? "Miðl." : "Mid"}</th>
                    <th className="px-3 py-2 text-right font-medium">{isIS ? "Hátt" : "High"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = r.today;
                    const has = d && ((d.loadIndex ?? 0) > 0 || (d.jumps ?? 0) > 0 || (d.impacts ?? 0) > 0);
                    const pct = has ? pctOf(d!.loadIndex, r.norm.loadIndex) : null;
                    const thin = r.baselineDays <= 1;
                    return (
                      <tr key={r.playerId} className={`border-b border-slate-100 hover:bg-slate-50 ${pct != null && pct >= 150 ? "bg-rose-50/40" : ""}`}>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{has ? fmt(d!.loadIndex, 1) : "—"}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${toneClass(pct)} ${thin ? "italic" : ""}`} title={thin ? (isIS ? "Lítið öryggi — fá æfingadaga í viðmiðun" : "Low confidence — few training days in the baseline") : undefined}>
                          {pct == null ? "—" : `${pct}%${thin ? "*" : ""}`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{has ? fmt(d!.jumps) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{has ? fmt(d!.impacts) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{has ? fmt(d!.settled) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{has ? fmt(d!.low) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{has ? fmt(d!.mid) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{has ? fmt(d!.high) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ShowDetails>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">{isIS ? "Hvernig á að lesa þetta" : "How to read this"}</h2>
            <ul className="space-y-1.5">
              <li>• {isIS
                ? "Álagsvísitala, stökk og impacts eru heildarálag dagsins frá Titan innidyra-IMU. „vs venja“ ber daginn saman við 28-daga æfingaviðmiðun leikmannsins (100% = týpískur dagur, ≥150% = toppur)."
                : "Load Index, jumps and impacts are the day's whole-body load from the Titan indoor IMU. “vs norm” compares the day to the player's 28-day training baseline (100% = typical, ≥150% = a spike)."}</li>
              <li>• {isIS
                ? "Hreyfiprófíllinn (Kyrr/Lágt/Miðlungs/Hátt) er tími í hverri ákefð — einingar eins og Titan sendir þær."
                : "The movement profile (Settled/Low/Mid/High) is time spent in each intensity — units as Titan reports them."}</li>
              <li>• {isIS
                ? "Lesið á persónulegri viðmiðun, til hvatningar — ekki áhættueinkunn og aldrei readiness-litur."
                : "Read on personal norm, for motivation — not a risk score, and never a readiness colour."}</li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}
