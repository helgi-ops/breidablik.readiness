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
  explainBasketballIndoorLoad,
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

/** Latest-session Titan movement profile (time-in-intensity) + raw mechanical counts, for display. */
type TitanLatest = {
  date: string;
  settled: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  loadIndex: number | null;
  jumps: number | null;
  impacts: number | null;
};

type PlayerResult = {
  id: string;
  name: string;
  load: BasketballIndoorLoad;
  /** Non-null only for Titan teams that report the Movement-Profile durations. */
  titanLatest: TitanLatest | null;
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
            "player_id, date, source, player_load, total_player_load, ima_band3_accel_count, ima_band3_decel_count, ima_cod_left_high, ima_cod_right_high, jumps, impacts, raw_payload_json",
          )
          .in("player_id", roster.map((p) => p.id))
          .gte("date", since);

        const byPlayer = new Map<string, BballLoadRow[]>();
        const titanByPlayer = new Map<string, TitanLatest>();
        for (const raw of (rows ?? []) as Array<Record<string, unknown>>) {
          const pid = String(raw.player_id);
          const codL = raw.ima_cod_left_high as number | null;
          const codR = raw.ima_cod_right_high as number | null;
          const highCod = codL == null && codR == null ? null : (codL ?? 0) + (codR ?? 0);
          const date = String(raw.date);
          const playerLoad = (raw.player_load as number | null) ?? (raw.total_player_load as number | null) ?? null;
          const jumps = (raw.jumps as number | null) ?? null;
          const impacts = (raw.impacts as number | null) ?? null;
          const row: BballLoadRow = {
            date,
            playerLoad,
            highAccel: (raw.ima_band3_accel_count as number | null) ?? null,
            highDecel: (raw.ima_band3_decel_count as number | null) ?? null,
            highCod,
            jumps,
            impacts,
          };
          const list = byPlayer.get(pid) ?? [];
          list.push(row);
          byPlayer.set(pid, list);

          // Titan Movement-Profile durations live in raw_payload_json.movement_profile. Keep the
          // newest dated row per player so the coach sees the latest time-in-intensity breakdown.
          const payload = raw.raw_payload_json as { movement_profile?: Record<string, number | null> } | null;
          const mp = payload?.movement_profile;
          if (raw.source === "titan" && mp) {
            const prev = titanByPlayer.get(pid);
            if (!prev || date > prev.date) {
              titanByPlayer.set(pid, {
                date,
                settled: mp.settled ?? null,
                low: mp.low ?? null,
                mid: mp.mid ?? null,
                high: mp.high ?? null,
                loadIndex: playerLoad,
                jumps,
                impacts,
              });
            }
          }
        }

        const computed: PlayerResult[] = roster.map((p) => ({
          id: p.id,
          name: p.full_name ?? "—",
          load: computeBasketballIndoorLoad(byPlayer.get(p.id) ?? []),
          titanLatest: titanByPlayer.get(p.id) ?? null,
        }));
        if (alive) { setResults(computed); setLoading(false); }
      } catch (e) {
        if (alive) { setError(String(e)); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [teamId]);

  const anyImaData = useMemo(
    () => results.some((r) => r.load.dataCoverage.hasIma || r.load.dataCoverage.hasPlayerLoad || r.load.dataCoverage.hasImpacts),
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
            ? "Court load from PlayerLoad + high-intensity IMA (accel/decel/change-of-direction) or Titan impacts + jump counts, each read against the player's own 28-day norm."
            : "Hallar-álag úr PlayerLoad + háálags-IMA (hröðun/hægðun/stefnubreytingar) eða Titan-impacts + stökkfjölda, hvert lesið á móti 28-daga viðmiðun leikmannsins."}
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

      {/* Detailed explainability — what the score + each signal mean, how impacts are handled. */}
      <HowToRead isEN={isEN} caveat={sampleCaveat} citation={citation ?? undefined} />

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
                        ? `Latest session vs their own norm (100 = average). Baseline from ${l.baseline.sessions} session(s).`
                        : `Nýjasta æfing á móti eigin viðmiðun (100 = meðaltal). Viðmiðun úr ${l.baseline.sessions} æfingu(m).`
                      : isEN
                        ? "No session in the window."
                        : "Engin æfing í glugganum."}
                  </CardDescription>
                </CardHeader>
                {s && (
                  <CardContent className="pt-0 space-y-3">
                    {(() => {
                      const read = explainBasketballIndoorLoad(l);
                      if (!read) return null;
                      return (
                        <p className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700">
                          {isEN ? read.en : read.is}
                        </p>
                      );
                    })()}
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <Component label="PlayerLoad" value={s.components.playerLoad} />
                      {s.components.highIntensityIma != null && (
                        <Component label={isEN ? "High-intensity IMA" : "Háálags-IMA"} value={s.components.highIntensityIma} />
                      )}
                      {s.components.impacts != null && (
                        <Component label={isEN ? "Impacts" : "Impacts"} value={s.components.impacts} />
                      )}
                      <Component label={isEN ? "Jumps" : "Stökk"} value={s.components.jumps} />
                    </div>
                    {r.titanLatest && <TitanProfileStrip t={r.titanLatest} isEN={isEN} />}
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

/**
 * Detailed coach explainability (layer 2) — what the score means, what each signal is in
 * plain language (jargon in the muted sub-line), how impacts are handled, and what drives
 * confidence. Collapsible so the board stays clean; opened when the coach wants the deep read.
 */
function Term({ name, plain, tech }: { name: string; plain: string; tech?: string }) {
  return (
    <div className="border-t border-slate-100 py-2 first:border-t-0">
      <div className="text-[13px] font-semibold text-slate-800">{name}</div>
      <div className="text-[12.5px] leading-relaxed text-slate-600">{plain}</div>
      {tech && <div className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{tech}</div>}
    </div>
  );
}

function HowToRead({ isEN, caveat, citation }: { isEN: boolean; caveat?: { en: string; is: string }; citation?: string }) {
  const bands = isEN
    ? "Light < 60 · Below avg 60–90 · Typical 90–110 · Heavy 110–140 · Spike ≥ 140"
    : "Léttur < 60 · Undir meðaltali 60–90 · Týpískur 90–110 · Þungur 110–140 · Spike ≥ 140";
  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800">
        <span className="text-[#2740e6] transition-transform group-open:rotate-90">▸</span>
        {isEN ? "How to read this board" : "Hvernig á að lesa þetta borð"}
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-4 py-3">
        {/* The score */}
        <div>
          <div className="text-[13px] font-semibold text-slate-900">{isEN ? "The score" : "Skorið"}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
            {isEN
              ? "Each player's latest indoor session is scored against their OWN 28-day norm — 100 = a typical session for that player. It's a weighted blend of the signals we can trust indoors. There are no reliable league benchmarks for basketball, so everything is read on personal norm, never against other players."
              : "Nýjasta innidyra-æfing hvers leikmanns er metin á móti HANS/HENNAR eigin 28-daga viðmiðun — 100 = týpísk æfing fyrir þann leikmann. Það er vegið meðaltal þeirra merkja sem við treystum innandyra. Það eru engin áreiðanleg deildar-viðmið fyrir körfubolta, svo allt er lesið á persónulegri viðmiðun, aldrei á móti öðrum leikmönnum."}
          </p>
          <div className="mt-1.5 rounded bg-slate-50 px-2.5 py-1.5 text-[11.5px] font-medium tabular-nums text-slate-600">{bands}</div>
        </div>

        {/* The signals */}
        <div>
          <div className="text-[13px] font-semibold text-slate-900">{isEN ? "The signals" : "Merkin"}</div>
          <div className="mt-1">
            <Term
              name={isEN ? "PlayerLoad / Load Index" : "PlayerLoad / Álagsvísitala"}
              plain={isEN
                ? "Total mechanical work — all the accelerations the body produces in every direction through the session. The volume backbone of the score."
                : "Heildar vélrænt álag — allar hröðanir sem líkaminn framleiðir í allar áttir yfir æfinguna. Rúmmáls-kjarni skorsins."}
              tech={isEN ? "Weight 45% of the composite. Load Index = the session's raw total (the number behind the %)." : "Vægi 45% af composite. Álagsvísitala = hrá heildartala æfingarinnar (talan á bak við %)."}
            />
            <Term
              name={isEN ? "High-intensity IMA (Catapult)" : "Háálags-IMA (Catapult)"}
              plain={isEN
                ? "Hard accelerations, decelerations and changes of direction — the sharp mechanical/decel work that matters most for indoor injury risk."
                : "Harðar hröðanir, hægðanir og stefnubreytingar — snögga vélræna/hægðunar-vinnan sem skiptir mestu fyrir innidyra-meiðslahættu."}
              tech={isEN ? "Band 3, > 3.0 m·s⁻² events. Weight 35%. Only on teams with Catapult IMA pods." : "Band 3, > 3.0 m·s⁻² atvik. Vægi 35%. Aðeins hjá liðum með Catapult IMA-pods."}
            />
            <Term
              name={isEN ? "Jumps" : "Stökk"}
              plain={isEN
                ? "How many jumps in the session — a raw count. It does NOT measure jump height (height needs a CMJ / force-plate test)."
                : "Hversu mörg stökk í æfingunni — hrá talning. Hún mælir EKKI stökkhæð (hæð krefst CMJ / force-plate prófs)."}
              tech={isEN ? "Weight 20%." : "Vægi 20%."}
            />
            <Term
              name={isEN ? "Impacts (Titan indoor IMU)" : "Impacts / Högg (Titan innidyra-IMU)"}
              plain={isEN
                ? "High-g impact events — hard landings or contacts above a g-threshold the IMU flags. These are discrete COLLISION events, not continuous load, and usually only a handful per session — so a day with 1 impact vs a 3-impact norm is noise, not a lighter session."
                : "Há-g högg — harðar lendingar eða snertingar yfir g-þröskuldi sem IMU-inn merkir. Þetta eru stök ÁREKSTRA-atvik, ekki samfellt álag, og yfirleitt aðeins örfá á æfingu — svo dagur með 1 höggi á móti 3-högga viðmiðun er hávaði, ekki léttari æfing."}
              tech={isEN
                ? "So impacts only enter the score when a player's baseline is impact-rich (≥ 10/session, weight 25%); below that we show the raw count but don't score it."
                : "Þess vegna fara impacts aðeins í skorið þegar grunnlína leikmanns er högg-rík (≥ 10/æfingu, vægi 25%); undir því sýnum við hráu töluna en skorum hana ekki."}
            />
            <Term
              name={isEN ? "Titan Movement Profile (settled / low / mid / high)" : "Titan hreyfiprófíll (kyrr / lágt / miðlungs / hátt)"}
              plain={isEN
                ? "Minutes spent at each intensity in the latest session (time-in-intensity) — they add up to roughly the session length. Context for what today actually looked like, shown raw and separate from the personal-norm score."
                : "Mínútur á hverri ákefð í nýjustu æfingu (tími-í-ákefð) — leggjast saman í u.þ.b. lengd æfingarinnar. Samhengi fyrir hvernig dagurinn leit raunverulega út, sýnt hrátt og aðskilið frá persónulega skorinu."}
            />
          </div>
        </div>

        {/* Confidence */}
        <div>
          <div className="text-[13px] font-semibold text-slate-900">{isEN ? "Confidence" : "Vissa"}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
            {isEN
              ? "Stays Low until a player has at least 6 sessions AND a mechanical signal (IMA, or impact-rich impacts); Medium/High as the baseline matures. The weights above are provisional — no basketball squad has enough history to calibrate them yet, so treat the score as a trend, not a verdict."
              : "Helst Lítil þar til leikmaður hefur a.m.k. 6 æfingar OG vélrænt merki (IMA, eða högg-rík impacts); Miðlungs/Há eftir því sem grunnlínan þroskast. Vægin að ofan eru til bráðabirgða — ekkert körfuboltalið hefur næga sögu til að kvarða þau enn, svo lestu skorið sem leitni, ekki dóm."}
          </p>
        </div>

        {/* Provenance */}
        {caveat && (
          <div className="rounded-md border border-violet-100 bg-violet-50/50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">{isEN ? "Provenance" : "Uppruni"}</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-violet-900">{isEN ? caveat.en : caveat.is}</p>
            {citation && <div className="mt-1 text-[10px] uppercase tracking-wide text-violet-400">{citation}</div>}
          </div>
        )}
      </div>
    </details>
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

/**
 * Titan Movement-Profile strip — the latest session's time-in-intensity (settled / low / mid / high)
 * plus the raw IMU Load Index. Descriptive, raw Titan values (unit as reported by Titan, not
 * converted); shown only for Titan teams that report the Movement Profile. Absolute numbers, not
 * personal-norm indices — this is the "what did today actually look like" context beside the composite.
 */
function TitanProfileStrip({ t, isEN }: { t: TitanLatest; isEN: boolean }) {
  const buckets: Array<{ label: string; value: number | null }> = [
    { label: isEN ? "Settled" : "Kyrr", value: t.settled },
    { label: isEN ? "Low" : "Lágt", value: t.low },
    { label: isEN ? "Mid" : "Miðlungs", value: t.mid },
    { label: isEN ? "High" : "Hátt", value: t.high },
  ];
  const hasAnyDuration = buckets.some((b) => b.value != null);
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {isEN ? "Titan movement profile — latest" : "Titan hreyfiprófíll — nýjast"}
        </span>
        <span className="text-[10px] text-slate-400">
          {t.loadIndex != null ? `${isEN ? "Load Index" : "Álagsvísitala"} ${t.loadIndex}` : ""}
        </span>
      </div>
      {hasAnyDuration ? (
        <div className="grid grid-cols-4 gap-2 text-center">
          {buckets.map((b) => (
            <div key={b.label} className="rounded bg-slate-50 px-2 py-1">
              <div className="text-[9px] uppercase tracking-wide text-slate-400">{b.label}</div>
              <div className="font-mono text-sm tabular-nums text-slate-700">{b.value == null ? "—" : b.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-slate-400">
          {isEN ? "Jumps + impacts only this session (no intensity-duration breakdown reported)."
                : "Aðeins stökk + impacts þessa æfingu (engin ákefðar-tímaskipting send)."}
        </div>
      )}
    </div>
  );
}
