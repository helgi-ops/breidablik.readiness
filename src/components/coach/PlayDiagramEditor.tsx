"use client";

/**
 * PlayDiagramEditor — coach-drawn set play on a half court. Drop offensive (O) and
 * defensive (X) players, drag to position, mark the ball-handler, and draw arrows
 * (move / dribble / screen / pass). Renders through the shared play renderer so the
 * saved JSON draws identically in the scouting PDF. Descriptive — never a readiness signal.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { WEB_PLAY_COLORS } from "@/components/coach/PlayDiagramSvg";
import { buildPlayDiagram, PLAY_VIEW, PLAY_TYPES, ARROW_KINDS, type PlayDiagram, type PlayArrow, type ArrowKind } from "@/lib/micropulse/basketballStats/playDiagram";
import { COMMON_SETS } from "@/lib/micropulse/basketballStats/commonSets";

type Tool = "off" | "def" | "arrow" | "move" | "erase";
export type SavedDiagram = { id: string; name: string; play_type: string | null; diagram: PlayDiagram; source: string; confirmed: boolean; confidence: string | null };

const EMPTY: PlayDiagram = { court: "half", players: [], arrows: [] };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function PlayDiagramEditor({ opponent, initial, onSaved, onCancel }: {
  opponent: string; initial?: SavedDiagram | null; onSaved: () => void; onCancel: () => void;
}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [diagram, setDiagram] = React.useState<PlayDiagram>(initial?.diagram ?? EMPTY);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [playType, setPlayType] = React.useState(initial?.play_type ?? "pnrHandler");
  const [tool, setTool] = React.useState<Tool>("off");
  const [kind, setKind] = React.useState<ArrowKind>("move");

  // Start from a named set — seed the name, play type and a standard starting alignment from the
  // common-sets library, which the coach then draws up (adjusts) and saves. Free-text naming still
  // works for a play that isn't in the library.
  const applyTemplate = (key: string) => {
    const set = COMMON_SETS.find((s) => s.key === key);
    if (!set) return;
    setName(is ? set.name.is : set.name.en);
    setPlayType(set.playType);
    setDiagram(JSON.parse(JSON.stringify(set.diagram)) as PlayDiagram);
  };
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // drag + arrow-draw transient state
  const dragId = React.useRef<string | null>(null);
  const moved = React.useRef(false);
  const [pending, setPending] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const vb = { x: -2, y: -2, w: PLAY_VIEW.w + 4, h: PLAY_VIEW.h + 4 };
  const toCoord = (e: React.PointerEvent): [number, number] => {
    const svg = svgRef.current; if (!svg) return [0, 0];
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * vb.w + vb.x;
    const y = ((e.clientY - r.top) / r.height) * vb.h + vb.y;
    return [clamp(x, 0, PLAY_VIEW.w), clamp(y, 0, PLAY_VIEW.h)];
  };
  const nextLabel = (team: "off" | "def") => {
    const n = diagram.players.filter((p) => p.team === team).length + 1;
    return team === "off" ? String(n) : "";
  };

  function bgDown(e: React.PointerEvent) {
    const [x, y] = toCoord(e);
    if (tool === "off" || tool === "def") {
      const id = `${tool}-${Date.now()}`;
      setDiagram((d) => ({ ...d, players: [...d.players, { id, team: tool, x, y, label: nextLabel(tool) }] }));
    } else if (tool === "arrow") {
      setPending({ x1: x, y1: y, x2: x, y2: y });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  }
  function playerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const p = diagram.players.find((pp) => pp.id === id);
    if (!p) return;
    if (tool === "erase") { setDiagram((d) => ({ ...d, players: d.players.filter((pp) => pp.id !== id) })); return; }
    if (tool === "arrow") { setPending({ x1: p.x, y1: p.y, x2: p.x, y2: p.y }); (e.target as Element).setPointerCapture?.(e.pointerId); return; }
    // move / ball-toggle
    dragId.current = id; moved.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (dragId.current) {
      const [x, y] = toCoord(e); moved.current = true;
      setDiagram((d) => ({ ...d, players: d.players.map((p) => (p.id === dragId.current ? { ...p, x, y } : p)) }));
    } else if (pending) {
      const [x, y] = toCoord(e); setPending((pp) => (pp ? { ...pp, x2: x, y2: y } : pp));
    }
  }
  function up(e: React.PointerEvent) {
    if (dragId.current) {
      if (!moved.current) {
        // a click (no drag) on an offensive player toggles the ball-handler
        const id = dragId.current;
        setDiagram((d) => ({ ...d, players: d.players.map((p) => (p.id === id && p.team === "off" ? { ...p, ball: !p.ball } : (p.team === "off" && p.ball && p.id === id ? { ...p, ball: false } : p))) }));
      }
      dragId.current = null; return;
    }
    if (pending) {
      const [x, y] = toCoord(e);
      const dist = Math.hypot(x - pending.x1, y - pending.y1);
      if (dist > 3) {
        const arrow: PlayArrow = { from: [Math.round(pending.x1), Math.round(pending.y1)], to: [Math.round(x), Math.round(y)], kind };
        setDiagram((d) => ({ ...d, arrows: [...d.arrows, arrow] }));
      }
      setPending(null);
    }
  }
  const undoArrow = () => setDiagram((d) => ({ ...d, arrows: d.arrows.slice(0, -1) }));
  const clearAll = () => setDiagram(EMPTY);

  const { prims } = React.useMemo(() => buildPlayDiagram(diagram, WEB_PLAY_COLORS), [diagram]);

  async function save() {
    if (!name.trim()) { setErr(is ? "Gefðu leiknum nafn." : "Name the play."); return; }
    if (diagram.players.length === 0) { setErr(is ? "Settu a.m.k. einn leikmann." : "Add at least one player."); return; }
    setBusy(true); setErr(null);
    try {
      const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!token) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const body = { opponent, name: name.trim(), playType, diagram };
      // Editing an unconfirmed AI draft is the coach taking ownership — confirm it on save
      // (brief: "coach confirms or edits → confirmed:true"). Only confirmed plays print.
      const confirmDraft = initial?.source === "ai_draft" && !initial.confirmed;
      const res = await fetch("/api/coach/scouting/play-diagrams", {
        method: initial ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(initial ? { ...body, id: initial.id, ...(confirmDraft ? { confirmed: true } : {}) } : body),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  const toolBtn = (t: Tool, label: string) => (
    <button type="button" onClick={() => setTool(t)}
      className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${tool === t ? "bg-[#2740e6] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
  );

  const isUnconfirmedDraft = initial?.source === "ai_draft" && !initial.confirmed;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      {isUnconfirmedDraft ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-[#c4cbf5] bg-[#eef0fb] px-3 py-2">
          <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">AI</span>
          <p className="text-[11px] leading-snug text-slate-600">
            {is ? "AI-uppkast úr myndbandi — les tölurnar, ákveður ekkert. Lagaðu staðsetningar og örvar; þegar þú vistar telst það staðfest og fer í PDF-ið." : "AI first draft from the clip — reads the frames, decides nothing. Fix the positions and arrows; saving confirms it and lets it print."}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={is ? "Nafn leiks (t.d. Spread ball-screen)" : "Play name (e.g. Spread ball-screen)"}
          className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
        <select value={playType} onChange={(e) => setPlayType(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-[13px]">
          {PLAY_TYPES.map((p) => <option key={p.key} value={p.key}>{is ? p.is : p.en}</option>)}
        </select>
      </div>
      {/* Start from a named standard set (Horns, Spain PnR, Chicago, Floppy…) — seeds the name + a
          starting alignment to draw up; or just type a name above and draw from scratch. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Byrja á kerfi" : "Start from a set"}</span>
        <select value="" onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.currentTarget.value = ""; }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-[13px] text-slate-600">
          <option value="">{is ? "Veldu kerfi…" : "Choose a set…"}</option>
          {COMMON_SETS.map((s) => <option key={s.key} value={s.key}>{is ? s.name.is : s.name.en}</option>)}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {toolBtn("off", is ? "+ Sóknarm. (O)" : "+ Offense (O)")}
        {toolBtn("def", is ? "+ Vörn (X)" : "+ Defense (X)")}
        {toolBtn("move", is ? "Færa / bolti" : "Move / ball")}
        {toolBtn("arrow", is ? "Ör" : "Arrow")}
        {toolBtn("erase", is ? "Eyða" : "Erase")}
        {tool === "arrow" && (
          <span className="ml-1 inline-flex overflow-hidden rounded-md border border-slate-200">
            {ARROW_KINDS.map((k) => (
              <button key={k.key} type="button" onClick={() => setKind(k.key)}
                className={`px-2 py-1 text-[11px] font-semibold ${kind === k.key ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>{is ? k.is : k.en}</button>
            ))}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {tool === "move" ? (is ? "Dragðu leikmann til að færa; smelltu á sóknarmann til að merkja/afmerkja boltann." : "Drag a player to move; click an offensive player to toggle the ball.")
          : tool === "arrow" ? (is ? "Dragðu frá upphafspunkti að endapunkti." : "Drag from the start point to the end point.")
          : tool === "erase" ? (is ? "Smelltu á leikmann til að eyða." : "Click a player to remove it.")
          : (is ? "Smelltu á völlinn til að bæta við leikmanni." : "Click the court to drop a player.")}
      </p>

      <div className="mt-2 flex justify-center">
        <div style={{ width: "min(100%, 420px)" }}>
          <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ width: "100%", height: "auto", display: "block", touchAction: "none", cursor: tool === "move" ? "grab" : "crosshair" }}
            onPointerDown={bgDown} onPointerMove={move} onPointerUp={up}>
            <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" />
            {prims.map((p, i) => {
              switch (p.t) {
                case "line": return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} style={{ stroke: p.stroke }} strokeWidth={p.w} strokeLinecap="round" strokeDasharray={p.dash} />;
                case "path": return <path key={i} d={p.d} style={{ stroke: p.stroke ?? "none", fill: p.fill ?? "none" }} strokeWidth={p.w ?? 0.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={p.dash} />;
                case "circle": return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} style={{ fill: p.fill ?? "none", stroke: p.stroke ?? "none" }} strokeWidth={p.w ?? 0} />;
                case "polygon": return <polygon key={i} points={p.pts.map(([x, y]) => `${x},${y}`).join(" ")} style={{ fill: p.fill ?? "none", stroke: p.stroke ?? "none" }} strokeWidth={p.w ?? 0} />;
                case "text": return <text key={i} x={p.x} y={p.y} style={{ fill: p.fill, pointerEvents: "none" }} fontSize={p.size} fontWeight={p.weight ?? 500} textAnchor={p.anchor ?? "middle"} dominantBaseline="middle">{p.s}</text>;
              }
            })}
            {/* interactive hit targets over each player */}
            {diagram.players.map((p) => (
              <circle key={p.id} cx={p.x} cy={p.y} r={5} fill="transparent" style={{ cursor: tool === "erase" ? "not-allowed" : "grab" }} onPointerDown={(e) => playerDown(e, p.id)} />
            ))}
            {pending && <line x1={pending.x1} y1={pending.y1} x2={pending.x2} y2={pending.y2} style={{ stroke: "var(--primary, #2740e6)" }} strokeWidth={1} strokeDasharray="2 2" />}
          </svg>
        </div>
      </div>

      {err && <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : isUnconfirmedDraft ? (is ? "Vista og staðfesta" : "Save & confirm") : (is ? "Vista leik" : "Save play")}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">{is ? "Hætta við" : "Cancel"}</button>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={undoArrow} className="text-[12px] font-semibold text-slate-500 hover:underline">{is ? "Afturkalla ör" : "Undo arrow"}</button>
          <button type="button" onClick={clearAll} className="text-[12px] font-semibold text-slate-500 hover:underline">{is ? "Hreinsa allt" : "Clear"}</button>
        </span>
      </div>
    </div>
  );
}
