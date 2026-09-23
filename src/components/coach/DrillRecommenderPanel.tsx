"use client";

/**
 * DrillRecommenderPanel — "Drill ideas" for one player, by playing STYLE and by WORST-CASE SCENARIO.
 *
 * Pick a player + a target (Style / WCS / Both) → a ranked drill list with the reason, reach dots
 * (HSR / accel-decel / CoD / PL), intensity levers for below-WCS drills, the tactical situation of his
 * hardest minutes, and the MD-day fit flag. Diagrams shown where present. Coach adds drills manually
 * (advisory — no auto-add). Reads GET /api/coach/player/[id]/drill-recommendations. Never the colour.
 */

import { useCallback, useEffect, useState, type FC } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type DrillPick = { id: string; name: string; category: string | null; format: string | null; players: number | null; duration_min: number | null; pitch: string | null; qualityValue: number; unit: string; diagram_url: string | null };
type DrillRec = { kind: "gap" | "strength"; quality: string; label: Bi; why: Bi; drills: DrillPick[] };
type WcsTarget = { hsrPerMin: number | null; accelDecelPerMin: number | null; codPerMin: number | null; playerLoadPerMin: number | null; windowMin: number | null; source: "player" | "position" };
type WcsFit = { drillId: string; label: string; reaches: { hsr: boolean | null; accelDecel: boolean | null; cod: boolean | null; playerLoad: boolean | null }; overallPct: number | null; verdict: "exceeds" | "meets" | "below" | "unknown"; levers: Bi[]; reason: Bi };
type Tactical = { dominant: string | null; dominantLabel: Bi | null; categories: string[]; offBall: boolean; confidence: string; note: Bi } | null;
type Both = { drillId: string; label: string; verdict: string; overallPct: number | null; category: string | null; diagram_url: string | null };
type MdFit = { drillType: string; fit: string; reason: Bi };
type Resp = {
  ok: boolean; name?: string; position?: string | null; target: string;
  style: { archetype: { axis: string; label: Bi } | null; rehearse: DrillRec[]; develop: DrillRec[] } | null;
  wcs: { target: WcsTarget | null; fits: WcsFit[] } | null;
  tactical: Tactical; both: Both[] | null; mdFitByDrill: Record<string, MdFit>; diagramById: Record<string, string | null>;
};

type PlayerRow = { id: string; full_name: string };
type Target = "style" | "wcs" | "both";

export const DrillRecommenderPanel: FC<{ teamId: string; mdDay?: string | null }> = ({ teamId, mdDay }) => {
  const [lang] = useLang();
  const t = (en: string, is: string) => (lang === "IS" ? is : en);
  const bi = (b: Bi) => (lang === "IS" ? b.is : b.en);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerId, setPlayerId] = useState<string>("");
  const [target, setTarget] = useState<Target>("both");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = getSupabaseClient();
      const { data: pl } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).order("full_name", { ascending: true });
      if (alive) setPlayers((pl ?? []) as PlayerRow[]);
    })();
    return () => { alive = false; };
  }, [teamId]);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    try {
      const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!token) return;
      const qs = new URLSearchParams({ target });
      if (mdDay) qs.set("md", mdDay);
      const res = await fetch(`/api/coach/player/${playerId}/drill-recommendations?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => null);
      if (j?.ok) setData(j as Resp); else setData(null);
    } finally { setLoading(false); }
  }, [playerId, target, mdDay]);

  useEffect(() => { if (open && playerId) void load(); }, [open, playerId, target, load]);

  const num = (n: number | null) => (n == null ? "—" : Math.round(n).toString());
  const Dot: FC<{ v: boolean | null }> = ({ v }) => (
    <span className={`inline-block h-2 w-2 rounded-full ${v == null ? "bg-slate-300" : v ? "bg-[#1c7a4a]" : "bg-[#a83e28]"}`} />
  );
  const verdictChip = (v: string) => {
    const map: Record<string, { c: string; en: string; is: string }> = {
      exceeds: { c: "bg-[#1c7a4a]/15 text-[#1c7a4a]", en: "exceeds", is: "fer yfir" },
      meets: { c: "bg-[#de9328]/15 text-[#8a5a10]", en: "meets", is: "nær" },
      below: { c: "bg-[#a83e28]/15 text-[#a83e28]", en: "below", is: "undir" },
      unknown: { c: "bg-slate-100 text-slate-500", en: "no data", is: "engin gögn" },
    };
    const m = map[v] ?? map.unknown;
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${m.c}`}>{t(m.en, m.is)}</span>;
  };
  const mdFlag = (drillId: string) => {
    const f = data?.mdFitByDrill?.[drillId];
    if (!f || !mdDay || f.fit === "ok") return null;
    const c = f.fit === "ideal" ? "text-[#1c7a4a]" : "text-[#a83e28]";
    return <span className={`text-[10px] font-medium ${c}`} title={bi(f.reason)}>· {mdDay} {f.fit === "ideal" ? "✓" : "⚠"}</span>;
  };

  const Diagram: FC<{ url: string | null | undefined }> = ({ url }) =>
    // eslint-disable-next-line @next/next/no-img-element
    url ? <img src={url} alt="" className="mt-1 max-h-24 rounded border border-slate-200" /> : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-slate-900">{t("Drill ideas — by style & worst-case", "Drillu-hugmyndir — eftir stíl & versta falli")}</span>
        <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1">
              <option value="">{t("Pick a player…", "Veldu leikmann…")}</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              {(["style", "wcs", "both"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setTarget(v)} className={`px-2.5 py-1 font-semibold ${target === v ? "bg-[#2740e6] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {v === "style" ? t("Style", "Stíll") : v === "wcs" ? t("WCS", "Versta fall") : t("Both", "Bæði")}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-400">{t("Advisory — add drills manually.", "Ráðgefandi — bættu drillum við handvirkt.")}</span>
          </div>

          {loading && <p className="text-xs text-slate-500">{t("Loading…", "Hleð…")}</p>}
          {!loading && !playerId && <p className="text-xs text-slate-400">{t("Pick a player to see drill ideas.", "Veldu leikmann til að sjá drillu-hugmyndir.")}</p>}

          {!loading && data && (
            <div className="space-y-4">
              {/* TACTICAL note (Part 3) — the game situation of his hardest minutes */}
              {(target !== "style") && data.tactical && (
                <p className="rounded-md border border-[#7a5cc4]/25 bg-[#7a5cc4]/5 p-2 text-[11px] text-slate-700">
                  <span className="font-semibold text-[#7a5cc4]">{t("Worst-case situation:", "Versta-falls staða:")}</span>{" "}
                  {bi(data.tactical.note)}
                  {data.tactical.offBall && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-800">{t("needs tracking", "þarf rakningu")}</span>}
                </p>
              )}

              {/* STYLE (Part 1) */}
              {(target === "style") && data.style && (
                <div className="space-y-3">
                  {data.style.archetype && <p className="text-xs text-slate-600">{t("Archetype:", "Erkitýpa:")} <span className="font-semibold text-slate-900">{bi(data.style.archetype.label)}</span></p>}
                  {[{ list: data.style.rehearse, head: t("Rehearse his game", "Æfðu leikinn hans"), sub: t("drills that match his strengths", "drillur sem passa styrkleika hans") },
                    { list: data.style.develop, head: t("Develop the gaps", "Þróaðu veikleikana"), sub: t("under-exposed vs his position", "vanþjálfað m.v. stöðu hans") }].map((grp, i) => (
                    <div key={i}>
                      <p className="text-[11px] font-semibold text-slate-800">{grp.head} <span className="font-normal text-slate-400">· {grp.sub}</span></p>
                      {grp.list.length === 0 && <p className="text-[11px] text-slate-400">{t("No drills matched.", "Engar drillur pössuðu.")}</p>}
                      {grp.list.map((rec) => (
                        <div key={rec.quality} className="mt-1">
                          <p className="text-[11px] text-slate-600">{bi(rec.label)} — {bi(rec.why)}</p>
                          <ul className="mt-0.5 space-y-1">
                            {rec.drills.map((d) => (
                              <li key={d.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
                                <span className="font-medium text-slate-900">{d.name}</span>
                                <span className="text-slate-400"> · {d.category ?? "—"} · {d.pitch ?? "—"} {mdFlag(d.id)}</span>
                                <Diagram url={d.diagram_url} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* WCS (Part 2) */}
              {(target === "wcs") && data.wcs && (
                <div>
                  {data.wcs.target ? (
                    <>
                      <p className="text-[11px] text-slate-600">
                        {t("Worst-case target", "Versta-falls markmið")} ({data.wcs.target.source === "position" ? t("position fallback", "staða til vara") : t("his own", "hans eigin")}, ~{num(data.wcs.target.windowMin)} min):
                        {" "}HSR {num(data.wcs.target.hsrPerMin)} · A/D {num(data.wcs.target.accelDecelPerMin)} · CoD {num(data.wcs.target.codPerMin)} · PL {num(data.wcs.target.playerLoadPerMin)} /min
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[9px] text-slate-400">
                        <span>{t("reach:", "nær:")}</span><span className="flex items-center gap-1"><span>HSR</span></span><span>A/D</span><span>CoD</span><span>PL</span>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {data.wcs.fits.slice(0, 20).map((f) => (
                          <li key={f.drillId} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-900">{f.label} {mdFlag(f.drillId)}</span>
                              <span className="flex items-center gap-1.5">
                                <Dot v={f.reaches.hsr} /><Dot v={f.reaches.accelDecel} /><Dot v={f.reaches.cod} /><Dot v={f.reaches.playerLoad} />
                                {verdictChip(f.verdict)}
                              </span>
                            </div>
                            <p className="text-slate-500">{bi(f.reason)}</p>
                            {f.levers.map((l, i) => <p key={i} className="text-[10px] text-[#8a5a10]">↑ {bi(l)}</p>)}
                            <Diagram url={data.diagramById[f.drillId]} />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : <p className="text-[11px] text-slate-400">{t("No peak-window data for this player or his position yet.", "Engin hámarksglugga-gögn fyrir þennan leikmann eða stöðu hans enn.")}</p>}
                </div>
              )}

              {/* BOTH — intersection */}
              {(target === "both") && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-800">{t("Rehearse his game, at worst-case intensity", "Æfðu leikinn hans, á versta-falls ákefð")}</p>
                  {data.both && data.both.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {data.both.map((b) => (
                        <li key={b.drillId} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
                          <span className="font-medium text-slate-900">{b.label}</span>
                          <span className="text-slate-400"> · {b.category ?? "—"} · {b.overallPct != null ? `~${b.overallPct}%` : ""} {mdFlag(b.drillId)}</span> {verdictChip(b.verdict)}
                          <Diagram url={b.diagram_url} />
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-[11px] text-slate-400">{t("No drill both fits his style and reaches his worst-case yet — try Style or WCS on their own.", "Engin drilla passar bæði stíl hans og nær versta falli enn — prófaðu Stíl eða Versta fall sér.")}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default DrillRecommenderPanel;
