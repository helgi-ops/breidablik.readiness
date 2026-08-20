"use client";

/**
 * InstatBasketballUpload — coach upload for Hudl / InStat basketball exports.
 * Two paths, auto-detected by file type by /api/coach/basketball-stats/upload:
 *   • Game Report PDF  → team box score + per-quarter + Four Factors (both sides).
 *                        One file, no player mapping. preview → commit.
 *   • CSV/Excel table   → per-player box score + advanced (own team). preview
 *                        resolves each player vs the squad; commit writes.
 * InStat is a descriptive SOURCE — box-score baskethotel stays canonical and is
 * never overwritten. Nothing here touches the readiness colour or daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Candidate = { playerId: string; fullName: string; score: number };
type CsvRow = {
  sourcePlayerRef: string; playerName: string;
  points: number | null; reb: number | null; assists: number | null;
  suggestedPlayerId: string | null; confidence: "exact" | "fuzzy" | "none"; remembered: boolean; candidates: Candidate[];
};
type CsvPreview = {
  kind: "player_csv"; match: { matchRef: string; matchDate: string | null; opponent: string | null };
  rows: CsvRow[]; skipped: { player: string; reason: string }[];
  squad: { id: string; fullName: string }[]; counts: { exact: number; fuzzy: number; none: number };
};
type PdfPlayer = {
  sourcePlayerRef: string; playerName: string;
  points: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null;
  suggestedPlayerId: string | null; confidence: "exact" | "fuzzy" | "none"; remembered: boolean; candidates: Candidate[];
};
type PdfPreview = {
  kind: "game_report_pdf";
  match: { date: string | null; home: string; away: string; homeScore: number | null; awayScore: number | null };
  ownTeam: { name: string | null; points: number | null; efgPct: number | null; ppp: number | null } | null;
  oppTeam: { name: string | null; points: number | null; efgPct: number | null; ppp: number | null } | null;
  ownIsHome: boolean;
  teamRows: number; quarters: number; matchRef: string;
  players?: PdfPlayer[];
  playerCounts?: { exact: number; fuzzy: number; none: number };
};

type LineupMemberRow = {
  ref: string; name: string; jersey: string | null;
  suggestedPlayerId: string | null; confidence: "exact" | "fuzzy" | "none"; remembered: boolean; candidates: Candidate[];
};
type LineupPreview = {
  kind: "lineups"; season: string; lineupCount: number;
  members: LineupMemberRow[]; squad: { id: string; fullName: string }[];
  counts: { exact: number; fuzzy: number; none: number }; skipped: number;
};
type SeasonPlayerRow = {
  ref: string; name: string; jersey: string | null;
  suggestedPlayerId: string | null; confidence: "exact" | "fuzzy" | "none"; remembered: boolean; candidates: Candidate[];
};
type SeasonPreview = {
  kind: "players_season"; season: string;
  players: SeasonPlayerRow[]; squad: { id: string; fullName: string }[];
  counts: { exact: number; fuzzy: number; none: number }; skipped: number;
};

const num = (v: number | null | undefined, digits = 0) => (v == null ? "–" : v.toFixed(digits));

export default function InstatBasketballUpload({ onImported }: { onImported?: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  // ── PDF Game Report ──
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState<"" | "preview" | "commit">("");
  const [pdfPreview, setPdfPreview] = React.useState<PdfPreview | null>(null);
  const [pdfOwnerSide, setPdfOwnerSide] = React.useState<"" | "home" | "away">("");
  const [pdfMsg, setPdfMsg] = React.useState<string | null>(null);
  const [pdfErr, setPdfErr] = React.useState<string | null>(null);

  // ── CSV per-player ──
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [csvDate, setCsvDate] = React.useState("");
  const [csvOpponent, setCsvOpponent] = React.useState("");
  const [csvBusy, setCsvBusy] = React.useState<"" | "preview" | "commit">("");
  const [csvPreview, setCsvPreview] = React.useState<CsvPreview | null>(null);
  const [csvDecisions, setCsvDecisions] = React.useState<Record<string, string>>({});
  const [csvMsg, setCsvMsg] = React.useState<string | null>(null);
  const [csvErr, setCsvErr] = React.useState<string | null>(null);

  // ── Lineups (season 5-man units) ──
  const [luFile, setLuFile] = React.useState<File | null>(null);
  const [luSeason, setLuSeason] = React.useState("2025-2026");
  const [luBusy, setLuBusy] = React.useState<"" | "preview" | "commit">("");
  const [luPreview, setLuPreview] = React.useState<LineupPreview | null>(null);
  const [luDecisions, setLuDecisions] = React.useState<Record<string, string>>({});
  const [luMsg, setLuMsg] = React.useState<string | null>(null);
  const [luErr, setLuErr] = React.useState<string | null>(null);

  async function luSend(phase: "preview" | "commit") {
    if (!luFile) return;
    setLuBusy(phase); setLuErr(null); setLuMsg(null);
    try {
      const t = await token(); if (!t) { setLuErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", phase); fd.set("file", luFile);
      if (luSeason) fd.set("season", luSeason);
      if (phase === "commit") fd.set("decisions", JSON.stringify(luDecisions));
      const res = await fetch("/api/coach/basketball-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setLuErr(j.error ?? "Error"); return; }
      if (phase === "preview") { setLuPreview(j); setLuDecisions({}); }
      else {
        setLuPreview(null); setLuDecisions({});
        setLuMsg(is
          ? `${j.rowsUpserted} fimmundir vistaðar (${j.mappedMembers} leikmenn mappaðir, ${j.unmatchedMembers} ómappaðir).`
          : `${j.rowsUpserted} lineups saved (${j.mappedMembers} members mapped, ${j.unmatchedMembers} unmatched).`);
        onImported?.();
      }
    } catch (e) { setLuErr(e instanceof Error ? e.message : "Error"); } finally { setLuBusy(""); }
  }

  // ── Players (season averages) ──
  const [spFile, setSpFile] = React.useState<File | null>(null);
  const [spSeason, setSpSeason] = React.useState("2025-2026");
  const [spBusy, setSpBusy] = React.useState<"" | "preview" | "commit">("");
  const [spPreview, setSpPreview] = React.useState<SeasonPreview | null>(null);
  const [spDecisions, setSpDecisions] = React.useState<Record<string, string>>({});
  const [spMsg, setSpMsg] = React.useState<string | null>(null);
  const [spErr, setSpErr] = React.useState<string | null>(null);

  async function spSend(phase: "preview" | "commit") {
    if (!spFile) return;
    setSpBusy(phase); setSpErr(null); setSpMsg(null);
    try {
      const t = await token(); if (!t) { setSpErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", phase); fd.set("file", spFile);
      if (spSeason) fd.set("season", spSeason);
      if (phase === "commit") fd.set("decisions", JSON.stringify(spDecisions));
      const res = await fetch("/api/coach/basketball-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setSpErr(j.error ?? "Error"); return; }
      if (phase === "preview") { setSpPreview(j); setSpDecisions({}); }
      else {
        setSpPreview(null); setSpDecisions({});
        setSpMsg(is
          ? `${j.rowsUpserted} leikmenn vistaðir fyrir tímabilið (${j.mapped} mappaðir, ${j.unmatched} ómappaðir).`
          : `${j.rowsUpserted} players saved for the season (${j.mapped} mapped, ${j.unmatched} unmatched).`);
        onImported?.();
      }
    } catch (e) { setSpErr(e instanceof Error ? e.message : "Error"); } finally { setSpBusy(""); }
  }

  async function pdfSend(phase: "preview" | "commit", ownerSideOverride?: "home" | "away") {
    if (!pdfFile) return;
    const side = ownerSideOverride ?? pdfOwnerSide;
    setPdfBusy(phase); setPdfErr(null); setPdfMsg(null);
    try {
      const t = await token(); if (!t) { setPdfErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", phase); fd.set("file", pdfFile);
      if (side) fd.set("owner_is_home", side);
      const res = await fetch("/api/coach/basketball-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setPdfErr(j.error ?? "Error"); return; }
      if (phase === "preview") setPdfPreview(j);
      else {
        setPdfPreview(null);
        const pl = j.players as { rowsUpserted: number; mapped: number; unmatched: number } | null;
        const plMsg = pl ? (is ? ` + ${pl.rowsUpserted} leikmenn (${pl.mapped} mappaðir, ${pl.unmatched} ómappaðir)` : ` + ${pl.rowsUpserted} players (${pl.mapped} mapped, ${pl.unmatched} unmatched)`) : "";
        setPdfMsg((is ? `${j.rowsUpserted} liðsraðir vistaðar (leikur + leikhlutar)` : `${j.rowsUpserted} team rows saved (game + quarters)`) + plMsg + ".");
        onImported?.();
      }
    } catch (e) { setPdfErr(e instanceof Error ? e.message : "Error"); } finally { setPdfBusy(""); }
  }

  async function csvSend(phase: "preview" | "commit") {
    if (!csvFile) return;
    setCsvBusy(phase); setCsvErr(null); setCsvMsg(null);
    try {
      const t = await token(); if (!t) { setCsvErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", phase); fd.set("file", csvFile);
      if (csvDate) fd.set("match_date", csvDate);
      if (csvOpponent) fd.set("opponent", csvOpponent);
      if (phase === "commit") fd.set("decisions", JSON.stringify(csvDecisions));
      const res = await fetch("/api/coach/basketball-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setCsvErr(j.error ?? "Error"); return; }
      if (phase === "preview") { setCsvPreview(j); setCsvDecisions({}); }
      else {
        setCsvPreview(null); setCsvDecisions({});
        setCsvMsg(is ? `${j.rowsUpserted} leikmenn vistaðir (${j.mapped} mappaðir, ${j.unmatched} ómappaðir).` : `${j.rowsUpserted} players saved (${j.mapped} mapped, ${j.unmatched} unmatched).`);
        onImported?.();
      }
    } catch (e) { setCsvErr(e instanceof Error ? e.message : "Error"); } finally { setCsvBusy(""); }
  }

  return (
    <div className="space-y-4">
      {/* PRIMARY — Game Report PDF */}
      <div className="rounded-xl border-2 border-[#e6742740]/30 bg-orange-50/40 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{is ? "Byrjaðu hér" : "Start here"}</span>
          <div className="text-sm font-semibold text-slate-800">{is ? "InStat leikskýrsla (PDF) — ein skrá" : "InStat Game Report (PDF) — one file"}</div>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
          {is
            ? "Frí leikskýrslan sem InStat býr til eftir hvern leik. Fyllir liðs-tölur, leikhluta (Q1–Q4) og Four Factors (eFG%, TO%, OREB%, FTF) — bæði fyrir liðið þitt og andstæðinginn. Engin nafnamöppun þarf."
            : "The free per-match report InStat generates after each game. Fills team totals, per-quarter (Q1–Q4) and Four Factors (eFG%, TO%, OREB%, FTF) — for both your team and the opponent. No player mapping needed."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.pdf)" : "File (.pdf)"}</div>
            <input type="file" accept=".pdf" onChange={(e) => { setPdfFile(e.target.files?.[0] ?? null); setPdfPreview(null); setPdfMsg(null); setPdfErr(null); setPdfOwnerSide(""); }} className="text-sm" />
          </label>
          <button onClick={() => pdfSend("preview")} disabled={!pdfFile || pdfBusy !== ""} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{pdfBusy === "preview" ? "…" : (is ? "Forskoða" : "Preview")}</button>
          <button onClick={() => pdfSend("commit")} disabled={!pdfPreview || pdfBusy !== ""} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{pdfBusy === "commit" ? "…" : (is ? "Flytja inn" : "Import")}</button>
        </div>
        {pdfErr && <p className="mt-2 text-[12px] font-medium text-red-700">{pdfErr}</p>}
        {pdfMsg && <p className="mt-2 text-[12px] text-emerald-700">{pdfMsg}</p>}
        {pdfPreview && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
            <div className="text-[12px] text-slate-700">
              <b>{pdfPreview.match.home} {num(pdfPreview.match.homeScore)}:{num(pdfPreview.match.awayScore)} {pdfPreview.match.away}</b>
              {pdfPreview.match.date ? ` · ${pdfPreview.match.date}` : ""} · {pdfPreview.teamRows} {is ? "liðsraðir" : "team rows"} ({pdfPreview.quarters} {is ? "leikhlutar" : "quarters"})
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-800">{is ? "Þitt lið" : "Your team"}{pdfPreview.ownTeam?.name ? ` (${pdfPreview.ownTeam.name})` : ""}: {num(pdfPreview.ownTeam?.points)} {is ? "stig" : "pts"} · eFG% {num(pdfPreview.ownTeam?.efgPct, 1)} · PPP {num(pdfPreview.ownTeam?.ppp, 2)}</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-600">{is ? "Andstæðingur" : "Opponent"}{pdfPreview.oppTeam?.name ? ` (${pdfPreview.oppTeam.name})` : ""}: {num(pdfPreview.oppTeam?.points)} {is ? "stig" : "pts"} · eFG% {num(pdfPreview.oppTeam?.efgPct, 1)} · PPP {num(pdfPreview.oppTeam?.ppp, 2)}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>{is ? "Er rétt lið merkt „þitt lið“?" : "Is the right team marked as “your team”?"}</span>
              <button
                type="button"
                onClick={() => { const next = pdfPreview.ownIsHome ? "away" : "home"; setPdfOwnerSide(next); void pdfSend("preview", next); }}
                disabled={pdfBusy !== ""}
                className="rounded border border-slate-300 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {is ? "↔ Skipta um lið" : "↔ Swap teams"}
              </button>
            </div>

            {/* Per-player (owner side) — identity + shot zones parsed from the FG table.
                Exact/remembered matches import automatically; unmatched are kept
                (id=null) and can be mapped precisely via the CSV export below. */}
            {pdfPreview.players && pdfPreview.players.length > 0 && (
              <div className="mt-1 border-t border-slate-100 pt-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  <b>{pdfPreview.players.length}</b> {is ? "leikmenn (þitt lið)" : "players (your team)"}
                  {pdfPreview.playerCounts && (
                    <>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">{pdfPreview.playerCounts.exact} {is ? "mappaðir" : "mapped"}</span>
                      {pdfPreview.playerCounts.none > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">{pdfPreview.playerCounts.none} {is ? "ómappaðir" : "unmatched"}</span>
                      )}
                    </>
                  )}
                  <span className="text-slate-400">· {is ? "með skotsvæði (paint/2m/4m/3ja)" : "with shot zones (paint/2m/4m/3pt)"}</span>
                </div>
                {pdfPreview.playerCounts && pdfPreview.playerCounts.none > 0 && (
                  <div className="mt-1 text-[10.5px] text-slate-400">
                    {is ? "Ómappaðir vistast áfram (id=null) — mappa nákvæmt með InStat CSV-töflunni fyrir neðan: " : "Unmatched are still saved (id=null) — map them precisely with the InStat CSV table below: "}
                    {pdfPreview.players.filter((p) => p.confidence === "none").map((p) => p.playerName).join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECONDARY — per-player CSV/Excel */}
      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500">{is ? "Per-leikmann tölur (InStat tafla — CSV/Excel)" : "Per-player stats (InStat table — CSV/Excel)"}</summary>
        <p className="mt-1 text-[11px] text-slate-400">
          {is
            ? "InStat → veldu dálkana (box-score + advanced) og sæktu töfluna. Fyllir per-leikmann tölur fyrir liðið þitt. Veldu leikdag og andstæðing, forskoðaðu, og staðfestu nafnamöppun."
            : "InStat → select the columns (box-score + advanced) and download the table. Fills per-player stats for your team. Pick the match date + opponent, preview, and confirm the player mapping."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.csv / .xlsx)" : "File (.csv / .xlsx)"}</div>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setCsvFile(e.target.files?.[0] ?? null); setCsvPreview(null); setCsvMsg(null); setCsvErr(null); }} className="text-sm" />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikdagur" : "Match date"}</div>
            <input type="date" value={csvDate} onChange={(e) => { setCsvDate(e.target.value); setCsvPreview(null); }} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Andstæðingur" : "Opponent"}</div>
            <input type="text" value={csvOpponent} onChange={(e) => setCsvOpponent(e.target.value)} placeholder={is ? "valfrjálst" : "optional"} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button onClick={() => csvSend("preview")} disabled={!csvFile || csvBusy !== ""} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{csvBusy === "preview" ? "…" : (is ? "Forskoða" : "Preview")}</button>
          <button onClick={() => csvSend("commit")} disabled={!csvPreview || csvBusy !== ""} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{csvBusy === "commit" ? "…" : (is ? "Flytja inn" : "Import")}</button>
        </div>
        {csvErr && <p className="mt-2 text-[12px] font-medium text-red-700">{csvErr}</p>}
        {csvMsg && <p className="mt-2 text-[12px] text-emerald-700">{csvMsg}</p>}
        {csvPreview && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-700">
              <span>{csvPreview.rows.length} {is ? "leikmenn" : "players"}</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">{csvPreview.counts.exact} {is ? "sjálfvirkt" : "auto"} · {csvPreview.counts.fuzzy + csvPreview.counts.none} {is ? "til yfirferðar" : "to review"}</span>
              {csvPreview.skipped.length ? <span className="text-[11px] text-slate-400">{csvPreview.skipped.length} {is ? "raðir sleppt" : "rows skipped"}</span> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">{is ? "Leikmaður (skrá)" : "Player (file)"}</th><th className="pr-2">{is ? "Stig" : "Pts"}</th><th className="pr-2">Frák.</th><th className="pr-2">Stoð.</th><th>{is ? "Mappa á" : "Map to"}</th></tr></thead>
                <tbody>
                  {csvPreview.rows.map((r) => {
                    const val = Object.prototype.hasOwnProperty.call(csvDecisions, r.sourcePlayerRef) ? csvDecisions[r.sourcePlayerRef] : (r.confidence === "exact" ? (r.suggestedPlayerId ?? "") : "");
                    return (
                      <tr key={r.sourcePlayerRef} className="border-t border-slate-200">
                        <td className="py-1 pr-2 text-slate-700">{r.playerName}{r.confidence !== "exact" ? <span className="ml-1 text-[10px] text-amber-700">{r.confidence === "fuzzy" ? "?" : "—"}</span> : null}{r.remembered ? <span className="ml-1 text-[10px] text-emerald-600">✓</span> : null}</td>
                        <td className="pr-2 tabular-nums text-slate-500">{num(r.points)}</td>
                        <td className="pr-2 tabular-nums text-slate-500">{num(r.reb)}</td>
                        <td className="pr-2 tabular-nums text-slate-500">{num(r.assists)}</td>
                        <td>
                          <select value={val} onChange={(e) => setCsvDecisions((d) => ({ ...d, [r.sourcePlayerRef]: e.target.value }))} className={`rounded border px-1 py-0.5 text-[12px] ${val ? "border-slate-300" : "border-amber-300 bg-amber-50"}`}>
                            <option value="">{is ? "— sleppa —" : "— skip —"}</option>
                            {csvPreview.squad.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      {/* TERTIARY — season lineups (5-man units) */}
      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500">{is ? "Fimmundir – heilt tímabil (InStat „Lineups“ tafla)" : "Lineups – full season (InStat “Lineups” table)"}</summary>
        <p className="mt-1 text-[11px] text-slate-400">
          {is
            ? "InStat → Lineups → sæktu töfluna (CSV/Excel). Fyllir 5-manna fimmundir tímabilsins (mínútur, sóknir, +/−) sem knýja Fimmunda-greininguna. Veldu tímabil, forskoðaðu, og staðfestu nafnamöppun leikmannanna einu sinni."
            : "InStat → Lineups → download the table (CSV/Excel). Fills the season's 5-man units (minutes, possessions, +/−) that power Lineup Intelligence. Pick the season, preview, and confirm the players' name mapping once."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.csv / .xlsx)" : "File (.csv / .xlsx)"}</div>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setLuFile(e.target.files?.[0] ?? null); setLuPreview(null); setLuMsg(null); setLuErr(null); }} className="text-sm" />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Tímabil" : "Season"}</div>
            <input type="text" value={luSeason} onChange={(e) => { setLuSeason(e.target.value); setLuPreview(null); }} placeholder="2025-2026" className="w-28 rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button onClick={() => luSend("preview")} disabled={!luFile || luBusy !== ""} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{luBusy === "preview" ? "…" : (is ? "Forskoða" : "Preview")}</button>
          <button onClick={() => luSend("commit")} disabled={!luPreview || luBusy !== ""} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{luBusy === "commit" ? "…" : (is ? "Flytja inn" : "Import")}</button>
        </div>
        {luErr && <p className="mt-2 text-[12px] font-medium text-red-700">{luErr}</p>}
        {luMsg && <p className="mt-2 text-[12px] text-emerald-700">{luMsg}</p>}
        {luPreview && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-700">
              <span><b>{luPreview.lineupCount}</b> {is ? "fimmundir" : "lineups"}</span>
              <span>· {luPreview.members.length} {is ? "leikmenn" : "players"}</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">{luPreview.counts.exact} {is ? "sjálfvirkt" : "auto"} · {luPreview.counts.fuzzy + luPreview.counts.none} {is ? "til yfirferðar" : "to review"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">{is ? "Leikmaður (skrá)" : "Player (file)"}</th><th>{is ? "Mappa á" : "Map to"}</th></tr></thead>
                <tbody>
                  {luPreview.members.map((m) => {
                    const val = Object.prototype.hasOwnProperty.call(luDecisions, m.ref) ? luDecisions[m.ref] : (m.confidence === "exact" ? (m.suggestedPlayerId ?? "") : "");
                    return (
                      <tr key={m.ref} className="border-t border-slate-200">
                        <td className="py-1 pr-2 text-slate-700">{m.jersey ? `${m.jersey} ` : ""}{m.name}{m.confidence !== "exact" ? <span className="ml-1 text-[10px] text-amber-700">{m.confidence === "fuzzy" ? "?" : "—"}</span> : null}{m.remembered ? <span className="ml-1 text-[10px] text-emerald-600">✓</span> : null}</td>
                        <td>
                          <select value={val} onChange={(e) => setLuDecisions((d) => ({ ...d, [m.ref]: e.target.value }))} className={`rounded border px-1 py-0.5 text-[12px] ${val ? "border-slate-300" : "border-amber-300 bg-amber-50"}`}>
                            <option value="">{is ? "— sleppa —" : "— skip —"}</option>
                            {luPreview.squad.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      {/* QUATERNARY — season players (per-player season averages) */}
      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500">{is ? "Leikmenn – heilt tímabil (InStat „Players“ tafla)" : "Players – full season (InStat “Players” table)"}</summary>
        <p className="mt-1 text-[11px] text-slate-400">
          {is
            ? "InStat → Players → sæktu töfluna (CSV/Excel). Fyllir tímabils-meðaltöl hvers leikmanns — auk +/− og „stig á sókn“ sem KKÍ box-score hefur ekki. Veldu tímabil, forskoðaðu, og staðfestu nafnamöppun."
            : "InStat → Players → download the table (CSV/Excel). Fills each player's season averages — plus +/− and points-per-possession the KKÍ box score doesn't carry. Pick the season, preview, and confirm the name mapping."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.csv / .xlsx)" : "File (.csv / .xlsx)"}</div>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setSpFile(e.target.files?.[0] ?? null); setSpPreview(null); setSpMsg(null); setSpErr(null); }} className="text-sm" />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Tímabil" : "Season"}</div>
            <input type="text" value={spSeason} onChange={(e) => { setSpSeason(e.target.value); setSpPreview(null); }} placeholder="2025-2026" className="w-28 rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button onClick={() => spSend("preview")} disabled={!spFile || spBusy !== ""} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{spBusy === "preview" ? "…" : (is ? "Forskoða" : "Preview")}</button>
          <button onClick={() => spSend("commit")} disabled={!spPreview || spBusy !== ""} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{spBusy === "commit" ? "…" : (is ? "Flytja inn" : "Import")}</button>
        </div>
        {spErr && <p className="mt-2 text-[12px] font-medium text-red-700">{spErr}</p>}
        {spMsg && <p className="mt-2 text-[12px] text-emerald-700">{spMsg}</p>}
        {spPreview && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-700">
              <span><b>{spPreview.players.length}</b> {is ? "leikmenn" : "players"}</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">{spPreview.counts.exact} {is ? "sjálfvirkt" : "auto"} · {spPreview.counts.fuzzy + spPreview.counts.none} {is ? "til yfirferðar" : "to review"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">{is ? "Leikmaður (skrá)" : "Player (file)"}</th><th>{is ? "Mappa á" : "Map to"}</th></tr></thead>
                <tbody>
                  {spPreview.players.map((m) => {
                    const val = Object.prototype.hasOwnProperty.call(spDecisions, m.ref) ? spDecisions[m.ref] : (m.confidence === "exact" ? (m.suggestedPlayerId ?? "") : "");
                    return (
                      <tr key={m.ref} className="border-t border-slate-200">
                        <td className="py-1 pr-2 text-slate-700">{m.jersey ? `${m.jersey} ` : ""}{m.name}{m.confidence !== "exact" ? <span className="ml-1 text-[10px] text-amber-700">{m.confidence === "fuzzy" ? "?" : "—"}</span> : null}{m.remembered ? <span className="ml-1 text-[10px] text-emerald-600">✓</span> : null}</td>
                        <td>
                          <select value={val} onChange={(e) => setSpDecisions((d) => ({ ...d, [m.ref]: e.target.value }))} className={`rounded border px-1 py-0.5 text-[12px] ${val ? "border-slate-300" : "border-amber-300 bg-amber-50"}`}>
                            <option value="">{is ? "— sleppa —" : "— skip —"}</option>
                            {spPreview.squad.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      <p className="text-[11px] text-slate-400">
        {is
          ? "InStat er lýsandi heimild (source: instat) — box-score baskethotel helst óbreytt. Ekkert af þessu snertir readiness-litinn, álagið eða daglegu ákvörðunina."
          : "InStat is a descriptive source (source: instat) — box-score baskethotel stays canonical. None of this touches the readiness colour, load, or the daily decision."}
      </p>
    </div>
  );
}
