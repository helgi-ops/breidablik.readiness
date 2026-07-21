"use client";

/**
 * BasketballIndoorLoadView
 *
 * The basketball variant of Indoor Load. Football's page scores load from the
 * Football Movement Profile (FMP) via an out-of-repo RPC; basketball has no GPS
 * and no FMP, so this reads the sport-neutral signals it genuinely produces —
 * PlayerLoad + high-intensity IMA (Band 3, >3.0 m·s⁻²) + jump counts — and runs
 * the pure `computeBasketballIndoorLoad` engine, normalising each player to their
 * OWN 28-day baseline.
 *
 * Honesty is front-and-centre: a provisional banner + the engine's caveat (Band-3
 * proxy for Tuttle's >3.5, jump counts not >40 cm heights, weights uncalibrated),
 * and a clear "connect Catapult IMA" state when the squad has no IMA data yet.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Lang } from "@/lib/lang";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  computeBasketballIndoorLoad,
  type BballLoadRow,
  type BasketballIndoorLoad,
  type LoadBand,
} from "@/lib/micropulse/indoorLoad/basketball";

const BAND_COLORS: Record<LoadBand, string> = {
  light: "bg-slate-100 text-slate-600",
  below_average: "bg-sky-100 text-sky-700",
  typical: "bg-emerald-100 text-emerald-700",
  heavy: "bg-amber-100 text-amber-800",
  spike: "bg-rose-100 text-rose-800",
};
const BAND_LABELS: Record<LoadBand, { EN: string; IS: string }> = {
  light: { EN: "Light", IS: "Léttur" },
  below_average: { EN: "Below avg", IS: "Undir meðaltali" },
  typical: { EN: "Typical", IS: "Týpískur" },
  heavy: { EN: "Heavy", IS: "Þungur" },
  spike: { EN: "Spike", IS: "Spike" },
};
const CONF_LABELS = {
  low: { EN: "Low confidence", IS: "Lítil vissa" },
  medium: { EN: "Medium confidence", IS: "Miðlungs vissa" },
  high: { EN: "High confidence", IS: "Há vissa" },
} as const;

type PlayerResult = {
  id: string;
  name: string;
  load: BasketballIndoorLoad;
};

const WINDOW_DAYS = 35;

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function BasketballIndoorLoadView({
  teamId,
  lang,
}: {
  teamId: string | null;
  lang: Lang;
}) {
  const isEN = lang === "EN";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) { setLoading(false); return; }
      setLoading(true);
      setError(null);
      try {
        const sb = getSupabaseClient();
        const { data: players } = await sb
          .from("players")
          .select("id, full_name")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");
        const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
        if (roster.length === 0) { if (alive) { setResults([]); setLoading(false); } return; }

        const since = daysAgoIso(WINDOW_DAYS);
        const { data: rows } = await sb
          .from("player_external_load_daily")
          .select(
            "player_id, date, player_load, total_player_load, ima_band3_accel_count, ima_band3_decel_count, ima_cod_left_high, ima_cod_right_high, jumps",
          )
          .in("player_id", roster.map((p) => p.id))
          .gte("date", since);

        const byPlayer = new Map<string, BballLoadRow[]>();
        for (const raw of (rows ?? []) as Array<Record<string, unknown>>) {
          const pid = String(raw.player_id);
          const codL = raw.ima_cod_left_high as number | null;
          const codR = raw.ima_cod_right_high as number | null;
          const highCod = codL == null && codR == null ? null : (codL ?? 0) + (codR ?? 0);
          const row: BballLoadRow = {
            date: String(raw.date),
            playerLoad: (raw.player_load as number | null) ?? (raw.total_player_load as number | null) ?? null,
            highAccel: (raw.ima_band3_accel_count as number | null) ?? null,
            highDecel: (raw.ima_band3_decel_count as number | null) ?? null,
            highCod,
            jumps: (raw.jumps as number | null) ?? null,
          };
          const list = byPlayer.get(pid) ?? [];
          list.push(row);
          byPlayer.set(pid, list);
        }

        const computed: PlayerResult[] = roster.map((p) => ({
          id: p.id,
          name: p.full_name ?? "—",
          load: computeBasketballIndoorLoad(byPlayer.get(p.id) ?? []),
        }));
        if (alive) { setResults(computed); setLoading(false); }
      } catch (e) {
        if (alive) { setError(String(e)); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [teamId]);

  const anyImaData = useMemo(
    () => results.some((r) => r.load.dataCoverage.hasIma || r.load.dataCoverage.hasPlayerLoad),
    [results],
  );
  const sampleCaveat = results[0]?.load.caveat;
  const citation = results[0]?.load.citation;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {isEN ? "Indoor Load — Basketball" : "Indoor Load — Körfubolti"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isEN
            ? "Court load from PlayerLoad + high-intensity IMA (accel/decel/change-of-direction) + jump counts, each read against the player's own 28-day norm."
            : "Hallar-álag úr PlayerLoad + háálags-IMA (hröðun/hægðun/stefnubreytingar) + stökkfjölda, hvert lesið á móti 28-daga viðmiðun leikmannsins."}
        </p>
      </div>

      {/* Provisional / honesty banner — always shown for basketball */}
      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <strong>{isEN ? "Provisional model — awaiting real-data calibration." : "Bráðabirgða-líkan — bíður raun-kvörðunar."}</strong>{" "}
        {isEN
          ? "No basketball squad has enough IMA history yet to calibrate the weights, so confidence stays low and every read is on personal norm."
          : "Ekkert körfuboltalið hefur næga IMA-sögu enn til að kvarða vægin, svo vissan helst lítil og allt er lesið á persónulegri viðmiðun."}
        <button
          type="button"
          className="ml-2 underline decoration-dotted"
          onClick={() => setShowDetails((s) => !s)}
        >
          {showDetails ? (isEN ? "Hide details" : "Fela") : (isEN ? "Show details" : "Sýna nánar")}
        </button>
        {showDetails && sampleCaveat && (
          <div className="mt-2 border-t border-violet-200 pt-2 text-xs text-violet-800">
            <div>{isEN ? sampleCaveat.en : sampleCaveat.is}</div>
            {citation && <div className="mt-1 uppercase tracking-wide text-violet-500">{citation}</div>}
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {isEN ? "Loading…" : "Hleður…"}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
      )}

      {/* Awaiting-IMA state: roster exists but no external-load/IMA rows at all. */}
      {!loading && !error && results.length > 0 && !anyImaData && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{isEN ? "No indoor IMA data yet." : "Engin IMA-gögn enn."}</strong>{" "}
          {isEN
            ? "Connect Catapult IMA (pods + the IMA reporting params in OpenField) and this board fills in automatically as sessions sync — nothing to reconfigure on our side."
            : "Tengdu Catapult IMA (pods + IMA-mælibreytur í OpenField) og þetta borð fyllist sjálfkrafa eftir því sem æfingar samstillast — ekkert að stilla upp á nýtt okkar megin."}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="rounded-md border bg-white p-6 text-center text-sm text-slate-500">
          {isEN ? "No active players on this team." : "Engir virkir leikmenn í liðinu."}
        </div>
      )}

      {/* Per-player reads */}
      {!loading && !error && anyImaData && (
        <div className="grid gap-3">
          {results.map((r) => {
            const l = r.load;
            const s = l.latest;
            return (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">{r.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      {s?.band && (
                        <Badge className={BAND_COLORS[s.band]} variant="secondary">
                          {s.score ?? "—"} · {BAND_LABELS[s.band][isEN ? "EN" : "IS"]}
                        </Badge>
                      )}
                      <span className="text-[11px] text-slate-500">
                        {CONF_LABELS[l.confidence][isEN ? "EN" : "IS"]}
                      </span>
                    </div>
                  </div>
                  <CardDescription>
                    {s
                      ? isEN
                        ? `Latest session vs his own norm (100 = average). Baseline from ${l.baseline.sessions} session(s).`
                        : `Nýjasta æfing á móti hans viðmiðun (100 = meðaltal). Viðmiðun úr ${l.baseline.sessions} æfingu(m).`
                      : isEN
                        ? "No session in the window."
                        : "Engin æfing í glugganum."}
                  </CardDescription>
                </CardHeader>
                {s && (
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <Component label={isEN ? "PlayerLoad" : "PlayerLoad"} value={s.components.playerLoad} />
                      <Component
                        label={isEN ? "High-intensity IMA" : "Háálags-IMA"}
                        value={s.components.highIntensityIma}
                      />
                      <Component label={isEN ? "Jumps" : "Stökk"} value={s.components.jumps} />
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Component({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-mono text-lg tabular-nums text-slate-800">
        {value == null ? "—" : value}
      </div>
    </div>
  );
}
