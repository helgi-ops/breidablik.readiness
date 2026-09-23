"use client";

/**
 * DrillRecommenderPanel — "Drill ideas" by playing STYLE and by WORST-CASE SCENARIO, at three scopes:
 *   • Player   — his style (rehearse/develop) + his worst-case + the tactical situation.
 *   • Position — the position group's aggregated worst-case + dominant tactical situation.
 *   • Team     — the whole squad's aggregated worst-case + dominant tactical situation.
 * Player uses /api/coach/player/[id]/drill-recommendations; Position/Team use
 * /api/coach/team/drill-recommendations. Reach dots (HSR/A-D/CoD/PL), verdict, intensity levers,
 * MD-day fit flag, diagrams. Coach adds drills manually (advisory). Never the readiness colour.
 */

import { useCallback, useEffect, useState, type FC } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type DrillPick = { id: string; name: string; category: string | null; pitch: string | null; diagram_url: string | null };
type DrillRec = { kind: "gap" | "strength"; quality: string; label: Bi; why: Bi; drills: DrillPick[] };
type WcsTarget = { hsrPerMin: number | null; accelDecelPerMin: number | null; codPerMin: number | null; playerLoadPerMin: number | null; windowMin: number | null; source: "player" | "position" };
type WcsFit = { drillId: string; label: string; reaches: { hsr: boolean | null; accelDecel: boolean | null; cod: boolean | null; playerLoad: boolean | null }; overallPct: number | null; verdict: "exceeds" | "meets" | "below" | "unknown"; levers: Bi[]; reason: Bi };
type Tactical = { dominant: string | null; categories: string[]; offBall: boolean; note: Bi } | null;
type MdFit = { drillType: string; fit: string; reason: Bi };
type Diagrams = Record<string, string | null>;
type WcsBrief = { scopeLabel: Bi; headline: Bi; archetype: Bi | null; demands: Bi[]; situation: Bi | null; designCues: Bi[]; confidence: Bi; citation: string };

type PlayerResp = {
  ok: boolean; style: { archetype: { axis: string; label: Bi } | null; rehearse: DrillRec[]; develop: DrillRec[] } | null;
  wcs: { target: WcsTarget | null; fits: WcsFit[] } | null; tactical: Tactical;
  both: Array<{ drillId: string; label: string; verdict: string; overallPct: number | null; category: string | null; diagram_url: string | null }> | null;
  brief: WcsBrief; mdFitByDrill: Record<string, MdFit>; diagramById: Diagrams;
};
type GroupResp = {
  ok: boolean; scope: string; groupLabel: Bi; players: number; contributing: number;
  availableGroups: Array<{ juGroup: string; label: Bi; count: number }>;
  wcs: { target: WcsTarget | null; fits: WcsFit[] }; tactical: Tactical; brief: WcsBrief; mdFitByDrill: Record<string, MdFit>; diagramById: Diagrams;
};

type PlayerRow = { id: string; full_name: string };
type Scope = "player" | "position" | "team";
type Target = "style" | "wcs" | "both";

export const DrillRecommenderPanel: FC<{ teamId: string; mdDay?: string | null }> = ({ teamId, mdDay }) => {
  const [lang] = useLang();
  const t = (en: string, is: string) => (lang === "IS" ? is : en);
  const bi = (b: Bi) => (lang === "IS" ? b.is : b.en);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [scope, setScope] = useState<Scope>("player");
  const [view, setView] = useState<"brief" | "drills">("brief");
  const [playerId, setPlayerId] = useState<string>("");
  const [target, setTarget] = useState<Target>("both");
  const [juGroup, setJuGroup] = useState<string>("");
  const [groups, setGroups] = useState<Array<{ juGroup: string; label: Bi; count: number }>>([]);
  const [pData, setPData] = useState<PlayerResp | null>(null);
  const [gData, setGData] = useState<GroupResp | null>(null);
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

  const token = async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tk = await token();
      if (!tk) return;
      const h = { Authorization: `Bearer ${tk}` };
      if (scope === "player") {
        if (!playerId) { setPData(null); return; }
        const qs = new URLSearchParams({ target: view === "brief" ? "both" : target }); if (mdDay) qs.set("md", mdDay);
        const j = await fetch(`/api/coach/player/${playerId}/drill-recommendations?${qs}`, { headers: h }).then((r) => r.json()).catch(() => null);
        setPData(j?.ok ? j : null);
      } else {
        const qs = new URLSearchParams({ scope }); if (scope === "position" && juGroup) qs.set("juGroup", juGroup); if (mdDay) qs.set("md", mdDay);
        const j = await fetch(`/api/coach/team/drill-recommendations?${qs}`, { headers: h }).then((r) => r.json()).catch(() => null);
        if (j?.ok) { setGData(j); if (j.availableGroups) setGroups(j.availableGroups); } else setGData(null);
      }
    } finally { setLoading(false); }
  }, [scope, view, playerId, target, juGroup, mdDay]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const num = (n: number | null) => (n == null ? "—" : Math.round(n).toString());
  const Dot: FC<{ v: boolean | null }> = ({ v }) => <span className={`inline-block h-2 w-2 rounded-full ${v == null ? "bg-slate-300" : v ? "bg-[#1c7a4a]" : "bg-[#a83e28]"}`} />;
  const verdictChip = (v: string) => {
    const table: Record<string, { c: string; en: string; is: string }> = {
      exceeds: { c: "bg-[#1c7a4a]/15 text-[#1c7a4a]", en: "exceeds", is: "fer yfir" },
      meets: { c: "bg-[#de9328]/15 text-[#8a5a10]", en: "meets", is: "nær" },
      below: { c: "bg-[#a83e28]/15 text-[#a83e28]", en: "below", is: "undir" },
      unknown: { c: "bg-slate-100 text-slate-500", en: "no data", is: "engin gögn" },
    };
    const m = table[v] ?? table.unknown;
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${m.c}`}>{t(m.en, m.is)}</span>;
  };
  const mdFlag = (fitMap: Record<string, MdFit>, drillId: string) => {
    const f = fitMap?.[drillId];
    if (!f || !mdDay || f.fit === "ok") return null;
    return <span className={`text-[10px] font-medium ${f.fit === "ideal" ? "text-[#1c7a4a]" : "text-[#a83e28]"}`} title={bi(f.reason)}>· {mdDay} {f.fit === "ideal" ? "✓" : "⚠"}</span>;
  };
  const Diagram: FC<{ url: string | null | undefined }> = ({ url }) =>
    // eslint-disable-next-line @next/next/no-img-element
    url ? <img src={url} alt="" className="mt-1 max-h-24 rounded border border-slate-200" /> : null;

  const BriefBlock: FC<{ brief: WcsBrief }> = ({ brief }) => (
    <div className="space-y-2">
      <p className="rounded-md bg-[#14181c] px-3 py-2 text-[13px] font-semibold text-white">{bi(brief.headline)}</p>
      {brief.archetype && <p className="text-[11px] text-slate-600">{t("Movement archetype:", "Hreyfi-erkitýpa:")} <span className="font-semibold text-slate-900">{bi(brief.archetype)}</span></p>}
      {brief.demands.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-800">{t("Hardest-minutes demands", "Kröfur hörðustu mínútna")}</p>
          <ul className="mt-0.5 space-y-0.5">{brief.demands.map((d, i) => <li key={i} className="text-[11px] text-slate-700">• {bi(d)}</li>)}</ul>
        </div>
      )}
      {brief.situation && (
        <p className="rounded-md border border-[#7a5cc4]/25 bg-[#7a5cc4]/5 p-2 text-[11px] text-slate-700"><span className="font-semibold text-[#7a5cc4]">{t("Game situation:", "Leikstaða:")}</span> {bi(brief.situation)}</p>
      )}
      {brief.designCues.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-800">{t("Design cues — build your own drill to hit these", "Hönnunar-vísbendingar — hannaðu þína drillu til að ná þessu")}</p>
          <ul className="mt-0.5 space-y-0.5">{brief.designCues.map((c, i) => <li key={i} className="text-[11px] text-[#1c5a7a]">→ {bi(c)}</li>)}</ul>
        </div>
      )}
      <p className="text-[9px] text-slate-400">{bi(brief.confidence)} · {brief.citation}</p>
    </div>
  );

  const TacticalNote: FC<{ tac: Tactical }> = ({ tac }) => tac ? (
    <p className="rounded-md border border-[#7a5cc4]/25 bg-[#7a5cc4]/5 p-2 text-[11px] text-slate-700">
      <span className="font-semibold text-[#7a5cc4]">{t("Worst-case situation:", "Versta-falls staða:")}</span> {bi(tac.note)}
      {tac.offBall && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-800">{t("needs tracking", "þarf rakningu")}</span>}
    </p>
  ) : null;

  const WcsBlock: FC<{ target: WcsTarget | null; fits: WcsFit[]; fitMap: Record<string, MdFit>; diagrams: Diagrams; sourceLabel?: string }> = ({ target, fits, fitMap, diagrams, sourceLabel }) => {
    if (!target) return <p className="text-[11px] text-slate-400">{t("No peak-window data yet.", "Engin hámarksglugga-gögn enn.")}</p>;
    return (
      <>
        <p className="text-[11px] text-slate-600">
          {t("Worst-case target", "Versta-falls markmið")}{sourceLabel ? ` (${sourceLabel})` : ""} · ~{num(target.windowMin)} min:
          {" "}HSR {num(target.hsrPerMin)} · A/D {num(target.accelDecelPerMin)} · CoD {num(target.codPerMin)} · PL {num(target.playerLoadPerMin)} /min
        </p>
        <ul className="mt-1 space-y-1">
          {fits.slice(0, 20).map((f) => (
            <li key={f.drillId} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{f.label} {mdFlag(fitMap, f.drillId)}</span>
                <span className="flex items-center gap-1.5"><Dot v={f.reaches.hsr} /><Dot v={f.reaches.accelDecel} /><Dot v={f.reaches.cod} /><Dot v={f.reaches.playerLoad} />{verdictChip(f.verdict)}</span>
              </div>
              <p className="text-slate-500">{bi(f.reason)}</p>
              {f.levers.map((l, i) => <p key={i} className="text-[10px] text-[#8a5a10]">↑ {bi(l)}</p>)}
              <Diagram url={diagrams[f.drillId]} />
            </li>
          ))}
        </ul>
        <p className="mt-1 flex items-center gap-2 text-[9px] text-slate-400"><span>{t("reach: HSR · accel/decel · CoD · player-load", "nær: HSR · hröðun/hemlun · CoD · player-load")}</span></p>
      </>
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-slate-900">{t("Drill ideas — by style & worst-case", "Drillu-hugmyndir — eftir stíl & versta falli")}</span>
        <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {/* Scope */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              {(["player", "position", "team"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setScope(s)} className={`px-2.5 py-1 font-semibold ${scope === s ? "bg-[#2740e6] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {s === "player" ? t("Player", "Leikmaður") : s === "position" ? t("Position", "Liðstaða") : t("Team", "Lið")}
                </button>
              ))}
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              {(["brief", "drills"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`px-2.5 py-1 font-semibold ${view === v ? "bg-[#14181c] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {v === "brief" ? t("Brief", "Yfirlit") : t("Drills", "Drillur")}
                </button>
              ))}
            </div>
            {scope === "player" && (
              <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1">
                <option value="">{t("Pick a player…", "Veldu leikmann…")}</option>
                {players.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            )}
            {scope === "position" && (
              <select value={juGroup} onChange={(e) => setJuGroup(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1">
                <option value="">{t("Pick a position…", "Veldu stöðu…")}</option>
                {groups.map((g) => <option key={g.juGroup} value={g.juGroup}>{bi(g.label)} ({g.count})</option>)}
              </select>
            )}
            {scope === "player" && view === "drills" && (
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                {(["style", "wcs", "both"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setTarget(v)} className={`px-2.5 py-1 font-semibold ${target === v ? "bg-[#2740e6] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {v === "style" ? t("Style", "Stíll") : v === "wcs" ? t("WCS", "Versta fall") : t("Both", "Bæði")}
                  </button>
                ))}
              </div>
            )}
            <span className="text-[10px] text-slate-400">{t("Advisory — add drills manually.", "Ráðgefandi — bættu drillum við handvirkt.")}</span>
          </div>

          {loading && <p className="text-xs text-slate-500">{t("Loading…", "Hleð…")}</p>}

          {/* BRIEF view — the training design brief for the current scope */}
          {!loading && view === "brief" && scope === "player" && !playerId && <p className="text-xs text-slate-400">{t("Pick a player to see the training brief.", "Veldu leikmann til að sjá þjálfunar-yfirlitið.")}</p>}
          {!loading && view === "brief" && scope === "position" && !juGroup && <p className="text-xs text-slate-400">{t("Pick a position to see its training brief.", "Veldu stöðu til að sjá þjálfunar-yfirlit hennar.")}</p>}
          {!loading && view === "brief" && scope === "player" && pData?.brief && <BriefBlock brief={pData.brief} />}
          {!loading && view === "brief" && scope !== "player" && (scope === "team" || juGroup) && gData?.brief && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{t("Across", "Yfir")} {gData.contributing}/{gData.players} {t("players (injured excluded)", "leikmenn (meiddir undanskildir)")}</p>
              <BriefBlock brief={gData.brief} />
            </div>
          )}

          {/* PLAYER scope — drills */}
          {!loading && view === "drills" && scope === "player" && !playerId && <p className="text-xs text-slate-400">{t("Pick a player to see drill ideas.", "Veldu leikmann til að sjá drillu-hugmyndir.")}</p>}
          {!loading && view === "drills" && scope === "player" && pData && (
            <div className="space-y-4">
              {target !== "style" && <TacticalNote tac={pData.tactical} />}
              {target === "style" && pData.style && (
                <div className="space-y-3">
                  {pData.style.archetype && <p className="text-xs text-slate-600">{t("Archetype:", "Erkitýpa:")} <span className="font-semibold text-slate-900">{bi(pData.style.archetype.label)}</span></p>}
                  {[{ list: pData.style.rehearse, head: t("Rehearse his game", "Æfðu leikinn hans") }, { list: pData.style.develop, head: t("Develop the gaps", "Þróaðu veikleikana") }].map((grp, i) => (
                    <div key={i}>
                      <p className="text-[11px] font-semibold text-slate-800">{grp.head}</p>
                      {grp.list.length === 0 && <p className="text-[11px] text-slate-400">{t("No drills matched.", "Engar drillur pössuðu.")}</p>}
                      {grp.list.map((rec) => (
                        <div key={rec.quality} className="mt-1">
                          <p className="text-[11px] text-slate-600">{bi(rec.label)} — {bi(rec.why)}</p>
                          <ul className="mt-0.5 space-y-1">
                            {rec.drills.map((d) => (
                              <li key={d.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
                                <span className="font-medium text-slate-900">{d.name}</span><span className="text-slate-400"> · {d.category ?? "—"} · {d.pitch ?? "—"} {mdFlag(pData.mdFitByDrill, d.id)}</span>
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
              {target === "wcs" && pData.wcs && (
                <WcsBlock target={pData.wcs.target} fits={pData.wcs.fits} fitMap={pData.mdFitByDrill} diagrams={pData.diagramById} sourceLabel={pData.wcs.target?.source === "position" ? t("position fallback", "staða til vara") : t("his own", "hans eigin")} />
              )}
              {target === "both" && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-800">{t("Rehearse his game, at worst-case intensity", "Æfðu leikinn hans, á versta-falls ákefð")}</p>
                  {pData.both && pData.both.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {pData.both.map((b) => (
                        <li key={b.drillId} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
                          <span className="font-medium text-slate-900">{b.label}</span><span className="text-slate-400"> · {b.category ?? "—"} · {b.overallPct != null ? `~${b.overallPct}%` : ""} {mdFlag(pData.mdFitByDrill, b.drillId)}</span> {verdictChip(b.verdict)}
                          <Diagram url={b.diagram_url} />
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-[11px] text-slate-400">{t("No drill both fits his style and reaches his worst-case yet.", "Engin drilla passar bæði stíl hans og nær versta falli enn.")}</p>}
                </div>
              )}
            </div>
          )}

          {/* POSITION / TEAM scope — drills */}
          {!loading && view === "drills" && scope === "position" && !juGroup && <p className="text-xs text-slate-400">{t("Pick a position to see its worst-case drills.", "Veldu stöðu til að sjá versta-falls drillur hennar.")}</p>}
          {!loading && view === "drills" && (scope === "team" || (scope === "position" && juGroup)) && gData && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-slate-900">{bi(gData.groupLabel)}</span>
                <span className="text-slate-400"> · {t("worst-case across", "versta fall yfir")} {gData.contributing}/{gData.players} {t("players (injured excluded)", "leikmenn (meiddir undanskildir)")}</span>
              </p>
              <TacticalNote tac={gData.tactical} />
              <WcsBlock target={gData.wcs.target} fits={gData.wcs.fits} fitMap={gData.mdFitByDrill} diagrams={gData.diagramById} sourceLabel={t("group mean", "hóp-meðaltal")} />
              <p className="text-[10px] text-slate-400">{t("Group playing-style gaps are in the Train-like-you-play panel above.", "Sameiginlegir stíl-veikleikar hópsins eru í Train-like-you-play spjaldinu að ofan.")}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default DrillRecommenderPanel;
