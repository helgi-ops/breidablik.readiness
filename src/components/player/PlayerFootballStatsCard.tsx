"use client";

/**
 * PlayerFootballStatsCard — the player's OWN season football stats (Wyscout),
 * curated to the ~10-15 that describe HIS position. Self-scoped
 * (/api/player/football-stats — player_id from auth, never a param).
 *
 * Explainability-first: (0) a plain positive season headline; (1) the
 * position-tailored stat grid with jargon behind tap tooltips; (2) the full
 * on-pitch metric set + provenance behind "Show all stats". DESCRIPTIVE — this
 * never touches the readiness colour or any decision, and the footnote says so.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ShowDetails from "@/components/common/ShowDetails";
import {
  pickPlayerFootballStats,
  seasonHeadline,
  positionFamily,
  type FootballStatInput,
  type PositionFamily,
} from "@/lib/micropulse/playerFootballStats";

type Api = {
  available: boolean;
  season?: string;
  position?: string | null;
  family?: PositionFamily;
  playerName?: string | null;
  core?: FootballStatInput["core"];
  metrics?: Record<string, number | string | null>;
  allMetrics?: { key: string; value: number | string }[];
  confidence?: { matches: number; minutes: number };
  provenance?: { source?: string; sourceRef?: string | null; syncedAt?: string | null; competition?: string | null };
};

const FAMILY_LABEL: Record<PositionFamily, { EN: string; IS: string }> = {
  GK: { EN: "Goalkeeper", IS: "Markvörður" },
  CB: { EN: "Centre-back", IS: "Miðvörður" },
  FB: { EN: "Full-back", IS: "Bakvörður" },
  MID: { EN: "Midfielder", IS: "Miðjumaður" },
  WING: { EN: "Winger", IS: "Kantmaður" },
  FW: { EN: "Forward", IS: "Sóknarmaður" },
  OUTFIELD: { EN: "Outfield", IS: "Útileikmaður" },
};

export default function PlayerFootballStatsCard({ lang = "IS" }: { lang?: "IS" | "EN" }) {
  const isIS = lang === "IS";
  const [data, setData] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/player/football-stats`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
          cache: "no-store",
        });
        const j = (await res.json()) as Api;
        if (alive && res.ok) setData(j);
      } catch { /* card is optional — never break the tab */ } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => {
    if (!data?.available || !data.core || !data.metrics) return [];
    return pickPlayerFootballStats({ core: data.core, metrics: data.metrics }, data.position ?? null, lang);
  }, [data, lang]);

  const headline = useMemo(() => {
    if (!data?.available || !data.core || !data.metrics) return null;
    return seasonHeadline({ core: data.core, metrics: data.metrics }, data.position ?? null, lang);
  }, [data, lang]);

  // Don't render anything for players/teams without imported Wyscout data.
  if (loading || !data || !data.available || !headline) return null;

  const family = data.family ?? positionFamily(data.position ?? null);
  const famLabel = FAMILY_LABEL[family][lang];
  const lowSample = (data.confidence?.matches ?? 0) < 5;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1 py-2">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        {/* Layer 0 — plain, positive season headline */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {isIS ? "Fótbolti" : "Football"}
          </span>
          <span className="text-[11px] font-medium text-zinc-500">
            {famLabel}{data.season ? ` · ${data.season}` : ""}
          </span>
        </div>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900">
          {isIS ? "Tímabilið mitt" : "My season"}
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-zinc-800">{headline.primary}</p>
        {headline.secondary ? (
          <p className="mt-0.5 text-sm text-emerald-700">{headline.secondary}</p>
        ) : null}

        {/* Layer 1 — the position-tailored stat grid */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.id} className="rounded-xl bg-zinc-50 px-3 py-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium leading-tight text-zinc-500">{s.label}</span>
                {s.tip ? (
                  <span
                    title={s.tip}
                    className="cursor-help select-none text-[10px] font-bold text-zinc-300"
                    aria-label={s.tip}
                  >ⓘ</span>
                ) : null}
              </div>
              <div className="mt-0.5 text-[17px] font-bold tracking-tight text-zinc-900">{s.display}</div>
            </div>
          ))}
        </div>

        {/* Confidence — sample size, always visible + honest */}
        <p className="mt-2.5 text-[11px] text-zinc-400">
          {isIS
            ? `Byggt á ${data.confidence?.matches ?? 0} leikjum (${(data.confidence?.minutes ?? 0).toLocaleString()} mín).`
            : `Based on ${data.confidence?.matches ?? 0} matches (${(data.confidence?.minutes ?? 0).toLocaleString()} min).`}
          {lowSample ? (isIS ? " Lítið úrtak enn — tölurnar sveiflast." : " Small sample so far — numbers will swing.") : ""}
        </p>

        {/* Layer 2 — every on-pitch metric + provenance */}
        <ShowDetails
          className="border-0 bg-transparent p-0"
          label={{ EN: "Show all stats", IS: "Sýna allar tölur" }}
        >
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(data.allMetrics ?? []).map((m) => (
              <div key={m.key} className="flex items-baseline justify-between gap-3 border-b border-zinc-100 py-1">
                <span className="text-[12px] text-zinc-600">{m.key}</span>
                <span className="text-[12px] font-semibold text-zinc-900">
                  {typeof m.value === "number" ? (Math.round(m.value * 100) / 100).toLocaleString() : String(m.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-zinc-400">
            {isIS ? "Uppruni: " : "Source: "}
            {(data.provenance?.source ?? "wyscout_excel").replace("_", " ")}
            {data.provenance?.competition ? ` · ${data.provenance.competition}` : ""}
            {data.provenance?.syncedAt ? ` · ${isIS ? "sótt" : "synced"} ${new Date(data.provenance.syncedAt).toLocaleDateString()}` : ""}
          </div>
        </ShowDetails>

        {/* Descriptive-only guardrail — the manifesto promise, in plain words */}
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
          {isIS
            ? "Þetta er leiktölfræði (Wyscout) til að fylgjast með tímabilinu þínu. Hún hefur engin áhrif á álagið þitt eða græna/gula/rauða stöðu."
            : "These are match stats (Wyscout) so you can follow your season. They never affect your load or your green/amber/red status."}
        </p>
      </div>
    </div>
  );
}
