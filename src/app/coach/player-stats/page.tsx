"use client";

export const dynamic = "force-dynamic";

/**
 * Player Stats — Wyscout import (Adapter A).
 *
 * Upload a Wyscout Advanced Search player-list export → preview parsed rows with
 * their auto-resolved player mapping → review the fuzzy/unmatched ones → confirm.
 * Descriptive football data: every row shows its source, and nothing here touches
 * the readiness colour or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

type Candidate = { playerId: string; fullName: string; score: number };
type PreviewRow = {
  sourcePlayerRef: string;
  wyscoutPlayerName: string;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  suggestedPlayerId: string | null;
  confidence: "exact" | "fuzzy" | "none";
  remembered: boolean;
  candidates: Candidate[];
};
type Squad = { id: string; fullName: string };
type Preview = {
  ok: boolean;
  rows: PreviewRow[];
  skipped: { player: string; team: string; reason: string }[];
  squad: Squad[];
  season: string;
  sourceRef: string;
  counts?: { exact: number; fuzzy: number; none: number };
  error?: string;
};

type OverviewPlayer = {
  playerId: string;
  name: string;
  position: string | null;
  football: {
    minutes: number | null; goals: number | null; assists: number | null; xg: number | null;
    shots: number | null; shotsOnTarget: number | null; passAccuracyPct: number | null;
    metrics: Record<string, unknown>;
  };
  physical: {
    sessions: number; totalDistanceKm: number | null; topSpeed: number | null;
    playerLoad: number | null; matchMinutes: number | null;
  };
  source: string; sourceRef: string | null; syncedAt: string | null;
};
type Overview = {
  season: string;
  sport?: string;
  players: OverviewPlayer[];
  unmatched: number;
  missing?: { playerId: string; name: string; position: string | null }[];
};
type BPlayer = {
  name: string; minutes: number | null; points: number | null; reb: number | null; assists: number | null;
  steals: number | null; blocks: number | null; turnovers: number | null;
  fg: string | null; tp: string | null; ft: string | null; plusMinus: number | null;
};
type BGame = { gameId: string; date: string | null; opponent: string | null; homeAway: string | null; players: BPlayer[] };
type MatchRow = {
  playerId: string; name: string; position: string | null;
  matchDate: string; opponent: string | null; homeAway: "home" | "away" | null;
  minutes: number | null; goals: number | null; assists: number | null; xg: number | null;
  physical: { distanceKm: number | null; topSpeed: number | null; playerLoad: number | null; matchMinutes: number | null };
};

const YEAR_DEFAULT = "2026";
const fmt = (n: number | null | undefined, d = 0): string => (n == null ? "–" : n.toFixed(d));

const isBasketball = (sport?: string) => String(sport ?? "").toLowerCase() === "basketball";

// Read a box-score metric (basketball) from the jsonb bag, tolerant of %/commas.
function mNum(f: OverviewPlayer["football"], key: string): number | null {
  const v = (f.metrics as Record<string, unknown>)[key];
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
const d1 = (n: number | null) => (n == null ? "–" : n.toFixed(1));
const pctOf = (n: number | null) => (n == null ? "–" : `${Math.round(n)}%`);

// A sport-aware column: header + tooltip + how to render one player's cell.
type StatCol = { header: string; title?: string; bold?: boolean; render: (p: OverviewPlayer) => string };

// The football-side "output" columns (left of the ‖), by sport. Basketball reads
// per-game box-score metrics; football reads the typed core.
function outputColumns(sport: string | undefined, is: boolean): StatCol[] {
  if (isBasketball(sport)) {
    return [
      { header: "Min", title: is ? "Mínútur á tímabilinu" : "Season minutes", render: (p) => fmt(p.football.minutes) },
      { header: is ? "Stig" : "Pts", title: is ? "Stig að meðaltali" : "Points per game", bold: true, render: (p) => d1(mNum(p.football, "Points per game")) },
      { header: is ? "Frák" : "Reb", title: is ? "Fráköst að meðaltali" : "Rebounds per game", render: (p) => d1(mNum(p.football, "Rebounds per game")) },
      { header: is ? "Stoðs" : "Ast", title: is ? "Stoðsendingar að meðaltali" : "Assists per game", render: (p) => d1(mNum(p.football, "Assists per game")) },
      { header: "FG%", title: is ? "Vallarskotnýting" : "Field goal %", render: (p) => pctOf(mNum(p.football, "Field goals %")) },
      { header: "3P%", title: is ? "3ja stiga nýting" : "Three-point %", render: (p) => pctOf(mNum(p.football, "Three-point %")) },
    ];
  }
  return [
    { header: "Min", title: is ? "Wyscout: keppnismínútur á tímabilinu (≠ MMin)" : "Wyscout: competitive minutes this season (≠ MMin)", render: (p) => fmt(p.football.minutes) },
    { header: "G", title: is ? "Mörk" : "Goals", bold: true, render: (p) => fmt(p.football.goals) },
    { header: "A", title: is ? "Stoðsendingar" : "Assists", render: (p) => fmt(p.football.assists) },
    { header: "xG", title: is ? "Expected goals — vænt mörk út frá gæðum færanna" : "Expected goals — chance quality, not actual goals", render: (p) => fmt(p.football.xg, 1) },
    { header: "Shots", title: is ? "Skot (á rammann í sviga)" : "Shots (on target in parentheses)", render: (p) => `${fmt(p.football.shots)}${p.football.shotsOnTarget != null ? ` (${p.football.shotsOnTarget})` : ""}` },
    { header: "Pass%", title: is ? "Nákvæmni sendinga %" : "Pass accuracy %", render: (p) => (p.football.passAccuracyPct != null ? `${fmt(p.football.passAccuracyPct)}%` : "–") },
  ];
}

// The physical columns (right of the ‖), by sport. Indoor basketball has no GPS
// distance / top speed, so those columns are dropped rather than shown as "–".
function physicalColumns(sport: string | undefined, is: boolean): StatCol[] {
  const sess: StatCol = { header: "Sess", title: is ? "MicroPulse æfingar" : "MicroPulse sessions", render: (p) => String(p.physical.sessions || "–") };
  const load: StatCol = { header: "Load", title: "Player Load", render: (p) => (p.physical.playerLoad != null ? p.physical.playerLoad.toLocaleString() : "–") };
  const mmin: StatCol = { header: "MMin", title: is ? "Leikmínútur (MicroPulse)" : "Match minutes (MicroPulse)", render: (p) => (p.physical.matchMinutes != null ? fmt(p.physical.matchMinutes) : "–") };
  if (isBasketball(sport)) return [sess, load, mmin];
  const dist: StatCol = { header: "Dist", title: is ? "Heildar vegalengd (km)" : "Total distance (km)", render: (p) => (p.physical.totalDistanceKm != null ? fmt(p.physical.totalDistanceKm, 1) : "–") };
  const top: StatCol = { header: "Top", title: is ? "Hámarkshraði (km/klst)" : "Top speed (km/h)", render: (p) => (p.physical.topSpeed != null ? fmt(p.physical.topSpeed, 1) : "–") };
  return [sess, dist, top, load, mmin];
}

// Sport-specific wording for labels/provenance so no surface hardcodes "Wyscout".
function sportTerms(sport: string | undefined, is: boolean) {
  return isBasketball(sport)
    ? {
        who: is ? "Leikjatölur — leikmaður" : "Box score — player",
        allMetrics: is ? "Allar leikjatölur" : "All box-score metrics",
        provenance: is ? "Leikjatölur eru árs-samtölur (per leik að meðaltali). Lýsandi gögn — hreyfa aldrei readiness-litinn." : "Box-score data is season aggregates (per-game). Descriptive data — it never moves the readiness colour.",
      }
    : {
        who: is ? "Wyscout — leikmaður" : "Wyscout — player",
        allMetrics: is ? "Allir Wyscout-mælar" : "All Wyscout metrics",
        provenance: is ? "Fótbolta-gögn eru árs-samtölur; per-leik samanburður kemur með match-report exporti eða Wyscout API. Lýsandi gögn — hreyfa aldrei readiness-litinn." : "Football data is season totals; per-match side-by-side arrives with a match-report export or the Wyscout API. Descriptive data — it never moves the readiness colour.",
      };
}

export default function PlayerStatsPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [file, setFile] = React.useState<File | null>(null);
  const [season, setSeason] = React.useState(YEAR_DEFAULT);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [decisions, setDecisions] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"import" | "players" | "matches">("import");
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [ovBusy, setOvBusy] = React.useState(false);
  const [ovErr, setOvErr] = React.useState<string | null>(null);
  const [modalPlayer, setModalPlayer] = React.useState<OverviewPlayer | null>(null);
  const [matches, setMatches] = React.useState<{ rows: MatchRow[]; apiConnected: boolean } | null>(null);
  const [bmatches, setBmatches] = React.useState<{ games: BGame[] } | null>(null);
  const [mBusy, setMBusy] = React.useState(false);
  const [cfg, setCfg] = React.useState<{ source: string; wyscout_team_id: string | null; basketball_team_ref?: string | null; enabled: boolean } | null>(null);
  const [apiSecret, setApiSecret] = React.useState(false);
  const [sport, setSport] = React.useState<string | undefined>(undefined);
  const [cfgMsg, setCfgMsg] = React.useState<string | null>(null);

  async function token(): Promise<string | null> {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  }

  React.useEffect(() => {
    (async () => {
      const t = await token();
      if (!t) return;
      const res = await fetch("/api/coach/player-stats/config", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) { const j = await res.json(); setCfg(j.config); setApiSecret(!!j.apiSecretConfigured); setSport(j.sport); }
    })();
  }, []);

  async function saveConfig() {
    const t = await token();
    if (!t || !cfg) return;
    setCfgMsg(null);
    const res = await fetch("/api/coach/player-stats/config", {
      method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    });
    const j = await res.json();
    setCfgMsg(res.ok ? (is ? "Vistað." : "Saved.") : (j.error ?? "Error"));
  }

  const fetchOverview = React.useCallback(async () => {
    setOvBusy(true); setOvErr(null);
    try {
      const t = await token();
      if (!t) { setOvErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch(`/api/coach/player-stats/overview?season=${encodeURIComponent(season)}&_t=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setOvErr(json.error ?? "Error"); return; }
      setOverview(json as Overview);
    } catch (e) {
      setOvErr(e instanceof Error ? e.message : "Error");
    } finally { setOvBusy(false); }
  }, [season, is]);

  React.useEffect(() => {
    if (view === "players") void fetchOverview();
  }, [view, fetchOverview]);

  React.useEffect(() => {
    if (view !== "matches") return;
    (async () => {
      setMBusy(true);
      try {
        const t = await token();
        if (!t) return;
        const path = isBasketball(sport) ? "basketball-matches" : "matches";
        const res = await fetch(`/api/coach/player-stats/${path}?_t=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) { const j = await res.json(); if (isBasketball(sport)) setBmatches(j); else setMatches(j); }
      } finally { setMBusy(false); }
    })();
  }, [view, sport]);

  async function runPreview() {
    if (!file) return;
    setBusy(true); setErr(null); setResult(null); setPreview(null);
    try {
      const t = await token();
      if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData();
      fd.set("phase", "preview"); fd.set("season", season); fd.set("file", file);
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = (await res.json()) as Preview;
      if (!res.ok || !json.ok) { setErr(json.error ?? "Error"); return; }
      setPreview(json);
      // Seed decisions: exact/fuzzy → suggested; none → leave unmatched ("").
      const seed: Record<string, string> = {};
      for (const r of json.rows) seed[r.sourcePlayerRef] = r.confidence === "none" ? "" : (r.suggestedPlayerId ?? "");
      setDecisions(seed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  async function runCommit() {
    if (!file || !preview) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const t = await token();
      if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData();
      fd.set("phase", "commit"); fd.set("season", season); fd.set("file", file);
      fd.set("decisions", JSON.stringify(decisions));
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Error"); return; }
      setResult(is
        ? `Vistað: ${json.rowsUpserted} raðir (${json.mapped} mappaðar, ${json.unmatched} ómappaðar geymdar).`
        : `Saved: ${json.rowsUpserted} rows (${json.mapped} mapped, ${json.unmatched} unmatched kept).`);
      setPreview(null); setDecisions({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  const rows = preview?.rows ?? [];
  const exact = rows.filter((r) => r.confidence === "exact");
  const fuzzy = rows.filter((r) => r.confidence === "fuzzy");
  const none = rows.filter((r) => r.confidence === "none");
  const squad = preview?.squad ?? [];

  const PlayerSelect = ({ r }: { r: PreviewRow }) => (
    <select
      value={decisions[r.sourcePlayerRef] ?? ""}
      onChange={(e) => setDecisions((d) => ({ ...d, [r.sourcePlayerRef]: e.target.value }))}
      className="rounded border border-slate-300 px-2 py-1 text-xs"
    >
      <option value="">{is ? "— skilja eftir ómappað —" : "— leave unmatched —"}</option>
      {squad.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
    </select>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{is ? "Leikmanna-tölfræði" : "Player Statistics"}</h1>
        <CoachTutorialButton slug={isBasketball(sport) ? "player-stats-basketball" : "player-stats"} label={{ en: "How to read", is: "Hvernig á að lesa" }} />
      </div>
      <PagePurpose
        en={isBasketball(sport)
          ? "see each player's season box-score beside his physical load — descriptive stats, one place"
          : "import Wyscout player statistics and link them to your squad — football output beside the physical GPS/IMA data"}
        is={isBasketball(sport)
          ? "sjáðu leikjatölur hvers leikmanns á tímabilinu við hlið líkamlegs álags — lýsandi tölfræði á einum stað"
          : "flyttu inn Wyscout leikmanna-tölfræði og tengdu hana við leikmennina — fótbolta-afköst við hlið líkamlegu GPS/IMA gagnanna"}
      />
      <p className="mt-1 text-xs text-slate-500">
        {isBasketball(sport)
          ? (is
            ? "Lýsandi körfubolta-gögn. Hreyfir aldrei readiness-litinn eða dagsákvörðunina. Hvert gildi ber uppruna sinn."
            : "Descriptive basketball data. Never moves the readiness colour or the daily decision. Every value carries its source.")
          : (is
            ? "Lýsandi fótbolta-gögn. Hreyfir aldrei readiness-litinn eða dagsákvörðunina. Hvert gildi ber uppruna sinn."
            : "Descriptive football data. Never moves the readiness colour or the daily decision. Every value carries its source.")}
      </p>

      {/* Import / Players / Matches toggle */}
      <div className="mt-4 flex overflow-hidden rounded-lg border border-slate-200" style={{ width: "fit-content" }}>
        {(["import", "players", "matches"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === v ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
          >
            {v === "import" ? (is ? "Innflutningur" : "Import") : v === "players" ? (is ? "Leikmenn" : "Players") : (is ? "Leikir" : "Matches")}
          </button>
        ))}
      </div>

      {/* Basketball: the Import tab is a feed-config card (no manual upload —
          basketball is fed automatically, zero coach effort once connected). */}
      {view === "import" && isBasketball(sport) && cfg && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">
            {is ? "Sjálfvirkur körfubolta-feed (KKÍ)" : "Automatic basketball feed (KKÍ)"}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            {is
              ? "Kveiktu á sjálfvirkum innlestri leikjatalna úr KKÍ. Eftir uppsetningu gerir þjálfari ekkert — tölurnar birtast á áætlun (per leik, með rúllu yfir tímabilið). Lýsandi gögn; snerta aldrei readiness-litinn."
              : "Turn on automatic ingestion of box-score stats from KKÍ. After setup the coach does nothing — stats appear on schedule (per game, rolled up over the season). Descriptive data; never touches the readiness colour."}
          </p>
          {/* How the feed works — steps on the page. */}
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Hvernig það virkar" : "How it works"}</div>
            <ol className="ml-4 list-decimal space-y-1">
              {(is
                ? [
                    "Opnaðu kki.is → Mótamál → Leikir og úrslit → Mótayfirlit, veldu tímabil og deild. Afritaðu season_id úr vefslóðinni (t.d. 130403).",
                    "Sláðu inn season_id:liðsnafn hér að neðan (t.d. 130403:Grindavík) — nafnið nákvæmlega eins og það stendur hjá KKÍ.",
                    "Hakaðu „Virkja feed“ og smelltu Vista.",
                    "Kerfið sækir leikjatölur sjálfkrafa á hverri nóttu — þú gerir ekkert meira.",
                    "Til að tölur tengist réttum leikmönnum verða nöfnin í MicroPulse að passa við KKÍ. Óviss nöfn haldast ótengd (aldrei ágiskuð).",
                    "Árs-tölur birtast í „Leikmenn“-flipanum, per-leik box-scorar í „Matches“.",
                  ]
                : [
                    "Open kki.is → Mótamál → Leikir og úrslit → Mótayfirlit, pick the season and league. Copy the season_id from the URL (e.g. 130403).",
                    "Enter season_id:team name below (e.g. 130403:Grindavík) — the name exactly as it appears in KKÍ.",
                    "Tick “Enable feed” and click Save.",
                    "The system pulls box scores automatically every night — you do nothing more.",
                    "For stats to link to the right players, your MicroPulse names must match KKÍ. Uncertain names stay unlinked (never guessed).",
                    "Season totals show on the “Players” tab, per-game box scores on “Matches”.",
                  ]
              ).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <div className="mt-2 text-[11px] text-slate-400">
              {is ? "Frítt og opinbert (KKÍ) — enginn lykill, engin innskráning, ekkert greitt API." : "Free and public (KKÍ) — no key, no login, no paid API."}
            </div>
          </div>
          <label className="mt-3 block">
            <span className="mr-2 text-xs text-slate-500">{is ? "KKÍ tilvísun (season_id:liðsnafn)" : "KKÍ reference (season_id:team name)"}</span>
            <input
              value={cfg.basketball_team_ref ?? ""}
              onChange={(e) => setCfg({ ...cfg, source: "baskethotel", basketball_team_ref: e.target.value })}
              placeholder={is ? "t.d. 130403:Grindavík" : "e.g. 130403:Grindavík"}
              className="w-56 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <span className="mt-1 block text-[10px] text-slate-400">
              {is ? "season_id úr kki.is (Mótayfirlit), svo liðsnafnið eins og það stendur í KKÍ." : "The season_id from kki.is (Mótayfirlit), then the team name as it appears in KKÍ."}
            </span>
          </label>
          <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, source: "baskethotel", enabled: e.target.checked })} />
            {is ? "Virkja feed" : "Enable feed"}
          </label>
          <div className="mt-2 text-[11px] leading-relaxed text-emerald-700">
            {is
              ? "KKÍ-feed er tilbúinn (frítt, opinbert — enginn lykill). Þegar tilvísunin er rétt og feed virkt sækjast leikjatölur sjálfkrafa á áætlun."
              : "The KKÍ feed is ready (free, public — no key). With a valid reference and the feed enabled, box scores are pulled automatically on schedule."}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => void saveConfig()} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              {is ? "Vista feed-stillingar" : "Save feed settings"}
            </button>
            {cfgMsg && <span className="text-[11px] text-slate-500">{cfgMsg}</span>}
          </div>
        </div>
      )}

      {view === "import" && !isBasketball(sport) && (<>

      {/* How the Wyscout import works — steps on the page. */}
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Hvernig innflutningur virkar" : "How the import works"}</div>
        <ol className="ml-4 list-decimal space-y-1">
          {(is
            ? [
                "Í Wyscout: Advanced Search → veldu liðið og tímabilið → Export → All columns (.xlsx skrá).",
                "Hladdu skránni upp hér að neðan og veldu tímabil.",
                "Forskoðaðu: kerfið tengir Wyscout-nöfn við leikmennina þína sjálfkrafa; nákvæmar samsvaranir tengjast, óviss fara í yfirferð (aldrei ágiskað á rangan leikmann).",
                "Staðfestu — árs-tölur birtast í „Leikmenn“-flipanum við hlið líkamlegu GPS/IMA-gagnanna.",
                "Per-leik tölur koma aðeins um Wyscout Data API (viðbót) — ekki úr Excel.",
              ]
            : [
                "In Wyscout: Advanced Search → pick the team and season → Export → All columns (.xlsx).",
                "Upload the file below and choose the season.",
                "Preview: the system matches Wyscout names to your squad automatically; exact matches link, uncertain ones go to review (never guessed onto the wrong player).",
                "Confirm — season totals show on the “Players” tab beside the physical GPS/IMA data.",
                "Per-match stats come only via the Wyscout Data API add-on — not from Excel.",
              ]
          ).map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>

      {/* Data source (per-team config: Excel default, or Wyscout Data API) */}
      {cfg && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {is ? "Uppspretta gagna" : "Data source"} <span className="text-slate-400">· {cfg.source === "wyscout_api" ? "Wyscout API" : "Excel"}</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" checked={cfg.source === "excel"} onChange={() => setCfg({ ...cfg, source: "excel" })} />
                {is ? "Excel-innflutningur (sjálfgefið)" : "Excel import (default)"}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" checked={cfg.source === "wyscout_api"} onChange={() => setCfg({ ...cfg, source: "wyscout_api" })} />
                {is ? "Wyscout API (sjálfvirkt)" : "Wyscout API (automatic)"}
              </label>
            </div>
            {cfg.source === "wyscout_api" && (
              <>
                <label className="block">
                  <span className="mr-2 text-xs text-slate-500">{is ? "Wyscout lið-ID" : "Wyscout team ID"}</span>
                  <input
                    value={cfg.wyscout_team_id ?? ""}
                    onChange={(e) => setCfg({ ...cfg, wyscout_team_id: e.target.value })}
                    className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
                    placeholder="e.g. 12345"
                  />
                </label>
                <div className={`text-[11px] ${apiSecret ? "text-emerald-700" : "text-amber-700"}`}>
                  {apiSecret
                    ? (is ? "API-lykill stilltur á server." : "API secret is configured on the server.")
                    : (is ? "API-lykill EKKI stilltur enn (WYSCOUT_API_*). Sjálfvirk samstilling bíður hans + endapunkta-skjala." : "API secret NOT set yet (WYSCOUT_API_*). Automatic sync waits on it + the endpoint docs.")}
                </div>
              </>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
              {is ? "Virkt" : "Enabled"}
            </label>
            <div className="flex items-center gap-2">
              <button onClick={() => void saveConfig()} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {is ? "Vista uppsprettu" : "Save source"}
              </button>
              {cfgMsg && <span className="text-[11px] text-slate-500">{cfgMsg}</span>}
            </div>
          </div>
        </details>
      )}

      {/* Upload — season totals only (per-match is Adapter B / API, never Excel) */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Wyscout skrá (.xlsx / .csv)" : "Wyscout file (.xlsx / .csv)"}</div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Tímabil" : "Season"}</div>
            <input value={season} onChange={(e) => setSeason(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button
            onClick={runPreview}
            disabled={!file || busy}
            className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : (is ? "Forskoða" : "Preview")}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {is ? "Árs-samtölur (Advanced Search → All columns). Per-leik tölur koma um Wyscout Data API." : "Season totals (Advanced Search → All columns). Per-match stats come via the Wyscout Data API."}
        </p>
        {err && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>}
        {result && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{result}</div>}
      </div>

      {preview && (
        <div className="mt-5 space-y-5">
          <div className="text-[12px] text-slate-500">
            {is ? "Úr" : "From"} <b>{preview.sourceRef}</b> · {is ? "tímabil" : "season"} {preview.season} ·{" "}
            {preview.counts?.exact ?? exact.length} {is ? "sjálfvirkt" : "auto"} · {fuzzy.length} {is ? "til yfirferðar" : "to review"} · {none.length} {is ? "ómappað" : "unmatched"}
          </div>

          {/* Auto-mapped */}
          {exact.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-emerald-700">{is ? `Sjálfvirkt mappað (${exact.length})` : `Auto-mapped (${exact.length})`}</h2>
              <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {exact.map((r) => (
                  <div key={r.sourcePlayerRef} className="flex items-center justify-between rounded-md border border-emerald-100 bg-emerald-50/50 px-2.5 py-1.5 text-[12px]">
                    <span className="text-slate-700">{r.wyscoutPlayerName}{r.remembered ? <span className="ml-1 text-[9px] uppercase text-slate-400">{is ? "munað" : "remembered"}</span> : null}</span>
                    <span className="font-medium text-slate-900">→ {squad.find((p) => p.id === (decisions[r.sourcePlayerRef] || r.suggestedPlayerId))?.fullName ?? "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Needs review (fuzzy) */}
          {fuzzy.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-amber-700">{is ? `Til yfirferðar (${fuzzy.length})` : `Needs review (${fuzzy.length})`}</h2>
              <p className="text-[11px] text-slate-500">{is ? "Staðfestu eða veldu réttan leikmann — engin ágiskun er vistuð sjálfkrafa." : "Confirm or pick the right player — no guess is saved automatically."}</p>
              <div className="mt-1 space-y-1">
                {fuzzy.map((r) => (
                  <div key={r.sourcePlayerRef} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/40 px-2.5 py-1.5 text-[12px]">
                    <span className="text-slate-700">{r.wyscoutPlayerName} <span className="text-slate-400">· {r.minutes ?? "–"}′</span></span>
                    <PlayerSelect r={r} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Unmatched */}
          {none.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-slate-600">{is ? `Ómappað (${none.length})` : `Unmatched (${none.length})`}</h2>
              <p className="text-[11px] text-slate-500">{is ? "Geymt með player_id = null nema þú veljir. Aldrei giskað á rangan leikmann." : "Kept with player_id = null unless you pick. Never guessed onto the wrong player."}</p>
              <div className="mt-1 space-y-1">
                {none.map((r) => (
                  <div key={r.sourcePlayerRef} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px]">
                    <span className="text-slate-700">{r.wyscoutPlayerName} <span className="text-slate-400">· {r.minutes ?? "–"}′</span></span>
                    <PlayerSelect r={r} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skipped */}
          {preview.skipped.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
              <summary className="cursor-pointer font-medium text-slate-600">{is ? `Sleppt — ekki A-lið (${preview.skipped.length})` : `Skipped — not the senior team (${preview.skipped.length})`}</summary>
              <div className="mt-1 text-slate-500">{preview.skipped.map((s) => `${s.player} (${s.team})`).join(", ")}</div>
            </details>
          )}

          <button
            onClick={runCommit}
            disabled={busy}
            className="rounded-lg bg-[#2740e6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : (is ? "Staðfesta og flytja inn" : "Confirm & import")}
          </button>
        </div>
      )}

      </>)}

      {view === "players" && (
        <div className="mt-5">
          {ovBusy && <div className="py-6 text-center text-sm text-slate-500">…</div>}
          {ovErr && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{ovErr}</div>}
          {overview && !ovBusy && (
            overview.players.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                {is ? `Engir mappaðir leikmenn fyrir tímabil ${overview.season} enn. Flyttu inn og mappaðu í Innflutningur-flipanum.` : `No mapped players for season ${overview.season} yet. Import and map on the Import tab.`}
                {overview.unmatched > 0 ? <span className="ml-1 text-slate-400">({overview.unmatched} {is ? "ómappaðar raðir" : "unmatched rows"})</span> : null}
              </div>
            ) : (
              <>
                {/* Plain read (Layer 1) + honest coverage — descriptive data, so a
                    plain summary + provenance, never a fabricated verdict. */}
                {(() => {
                  const ps = overview.players;
                  const bball = isBasketball(overview.sport);
                  const withPhysical = ps.filter((p) => p.physical.sessions > 0).length;
                  const pick = (f: (p: OverviewPlayer) => number) => ps.reduce((a, b) => (f(b) > f(a) ? b : a), ps[0]);
                  const mostMinutes = pick((p) => p.football.minutes ?? 0);
                  // Sport-aware headline standouts.
                  const topScorer = bball
                    ? pick((p) => mNum(p.football, "Points per game") ?? 0)
                    : pick((p) => p.football.goals ?? 0);
                  const third = bball
                    ? pick((p) => mNum(p.football, "Rebounds per game") ?? 0)
                    : pick((p) => p.football.xg ?? 0);
                  const scorerVal = bball ? d1(mNum(topScorer.football, "Points per game")) : String(topScorer.football.goals ?? 0);
                  const thirdVal = bball ? d1(mNum(third.football, "Rebounds per game")) : (third.football.xg ?? 0).toFixed(1);
                  const summary = is
                    ? bball
                      ? `${ps.length} leikmenn · tímabil ${overview.season}. Stigahæstur: ${topScorer.name} (${scorerVal}); flestar mínútur: ${mostMinutes.name} (${mostMinutes.football.minutes ?? 0}); flest fráköst: ${third.name} (${thirdVal}).`
                      : `${ps.length} leikmenn fluttir inn · tímabil ${overview.season}. Markahæstur: ${topScorer.name} (${scorerVal}); flestar mínútur: ${mostMinutes.name} (${mostMinutes.football.minutes ?? 0}); hæsta xG: ${third.name} (${thirdVal}).`
                    : bball
                      ? `${ps.length} players · season ${overview.season}. Top scorer: ${topScorer.name} (${scorerVal}); most minutes: ${mostMinutes.name} (${mostMinutes.football.minutes ?? 0}); most rebounds: ${third.name} (${thirdVal}).`
                      : `${ps.length} players imported · season ${overview.season}. Top scorer: ${topScorer.name} (${scorerVal}); most minutes: ${mostMinutes.name} (${mostMinutes.football.minutes ?? 0}); highest xG: ${third.name} (${thirdVal}).`;
                  return (
                    <>
                      <div className="mb-2 rounded-xl border border-[#d4dcfb] bg-[#eef1fe] px-4 py-3 text-[13px] leading-relaxed text-slate-700">
                        {summary}
                        {overview.unmatched > 0 ? <span className="ml-1 text-amber-700">· {overview.unmatched} {is ? "ómappaðar raðir í Innflutningi" : "unmatched rows on Import"}</span> : null}
                      </div>
                      {withPhysical === 0 ? (
                        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
                          <span aria-hidden>⚠</span>
                          <span>
                            {bball
                              ? (is
                                ? `Engin MicroPulse álagsgögn fyrir tímabil ${overview.season} enn — líkamlegu dálkarnir sýna ‚–‘. Innanhúss-körfubolti hefur ekki GPS-vegalengd/hraða; álag (Player Load) og leikmínútur birtast þegar mælingar berast.`
                                : `No MicroPulse load data for season ${overview.season} yet — the physical columns show "–". Indoor basketball has no GPS distance/speed; load (Player Load) and match minutes appear once tracking comes in.`)
                              : (is
                                ? `Engin MicroPulse GPS/IMA gögn fyrir tímabil ${overview.season} — líkamlegu dálkarnir eru tómir því þetta tímabil er á undan GPS-gögnunum þínum (byrja feb 2026). Flyttu inn Wyscout-skrá fyrir yfirstandandi tímabil til að sjá fótbolta við hlið líkamlegs.`
                                : `No MicroPulse GPS/IMA for season ${overview.season} — the physical columns are empty because this season predates your GPS data (from Feb 2026). Import a current-season Wyscout export to see football beside physical.`)}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-2 text-[12px] text-slate-500">
                          {bball
                            ? (is
                              ? `Körfubolti (leikjatölur, per leik) við hlið líkamlegs álags (MicroPulse), tímabil ${overview.season}. Líkamleg gögn fyrir ${withPhysical} af ${ps.length}.`
                              : `Basketball (box score, per-game) beside physical load (MicroPulse), season ${overview.season}. Physical data for ${withPhysical} of ${ps.length}.`)
                            : (is
                              ? `Fótbolti (Wyscout, árs-samtölur) við hlið líkamlegs afkasts (GPS/IMA), tímabil ${overview.season}. Líkamleg gögn fyrir ${withPhysical} af ${ps.length}.`
                              : `Football (Wyscout, season totals) beside physical output (GPS/IMA), season ${overview.season}. Physical data for ${withPhysical} of ${ps.length}.`)}
                        </div>
                      )}
                      {/* Coverage honesty: active squad players with no Wyscout stats this season. */}
                      {overview.missing && overview.missing.length > 0 && (
                        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-600">
                          <span className="font-semibold text-slate-700">
                            {is ? `${overview.missing.length} leikmenn í hópnum ekki í þessum innflutningi:` : `${overview.missing.length} squad players not in this import:`}
                          </span>{" "}
                          {overview.missing.map((m) => m.name).join(", ")}.
                          <span className="ml-1 text-slate-400">
                            {is
                              ? "Þeir voru ekki í innfluttu tölfræðinni. Flyttu inn skrá sem inniheldur þá til að bæta við."
                              : "They weren't in the imported stats. Import a file that includes them to add them."}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  {(() => {
                    const outCols = outputColumns(overview.sport, is);
                    const physCols = physicalColumns(overview.sport, is);
                    const dividerTitle = isBasketball(overview.sport)
                      ? (is ? "Körfubolti (leikjatölur) vinstra megin · líkamlegt (MicroPulse) hægra megin" : "Basketball (box score) on the left · physical (MicroPulse) on the right")
                      : (is ? "Fótbolti (Wyscout) vinstra megin · líkamlegt (MicroPulse GPS/IMA) hægra megin" : "Football (Wyscout) on the left · physical (MicroPulse GPS/IMA) on the right");
                    return (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-medium">{is ? "Leikmaður" : "Player"}</th>
                        {outCols.map((c) => (
                          <th key={c.header} className="px-2 py-2 text-right font-medium" title={c.title}>{c.header}</th>
                        ))}
                        <th className="px-2 py-2 text-center font-medium text-[#2740e6]" title={dividerTitle}>‖</th>
                        {physCols.map((c) => (
                          <th key={c.header} className="px-2 py-2 text-right font-medium" title={c.title}>{c.header}</th>
                        ))}
                        <th className="px-2 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.players.map((p) => (
                        <tr
                          key={p.playerId}
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/60"
                          onClick={() => setModalPlayer(p)}
                          title={is ? "Smelltu til að sjá alla mælana" : "Click to see all metrics"}
                        >
                          <td className="px-2 py-1.5 font-medium text-slate-800">
                            {p.name}{p.position ? <span className="ml-1 text-[10px] text-slate-400">{p.position}</span> : null}
                            <span className="ml-1 text-[9px] text-indigo-500">⤢</span>
                          </td>
                          {outCols.map((c) => (
                            <td key={c.header} className={`px-2 py-1.5 text-right tabular-nums${c.bold ? " font-semibold text-slate-900" : ""}`}>{c.render(p)}</td>
                          ))}
                          <td className="px-2 py-1.5 text-center text-slate-200">‖</td>
                          {physCols.map((c) => (
                            <td key={c.header} className="px-2 py-1.5 text-right tabular-nums text-slate-500">{c.render(p)}</td>
                          ))}
                          <td className="px-2 py-1.5" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                    );
                  })()}
                </div>
                {/* Layered read: how to read the table + the honest limits. */}
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  {isBasketball(overview.sport)
                    ? (is
                      ? "Vinstra megin við ‖ er körfubolti (leikjatölur, per leik); hægra megin líkamlegt álag (MicroPulse). Smelltu á leikmann til að opna kort með ÖLLUM leikjatölunum og upprunanum. „–“ þýðir engin gögn (t.d. miðherji sem tekur engin 3ja stiga skot), aldrei núll. Lýsandi gögn — hreyfa aldrei readiness-litinn."
                      : "Left of the ‖ is basketball (box score, per-game); right is physical load (MicroPulse). Click a player to open a card with ALL box-score metrics and the provenance. A “–” means no data (e.g. a center who takes no threes), never zero. Descriptive data — it never moves the readiness colour.")
                    : (is
                      ? "Vinstra megin við ‖ er fótbolti (Wyscout árs-samtölur); hægra megin líkamlegt (MicroPulse GPS/IMA sama tímabil). Smelltu á leikmann til að opna kort með ÖLLUM Wyscout-mælunum (per-90 o.fl.) og upprunanum (skrá + sync-dagsetning). Min = keppnismínútur Wyscout; MMin = MicroPulse leikmínútur — þær geta verið ólíkar því þær koma úr sitt hvorri heimildinni. „–“ þýðir engin gögn (t.d. markvörður án pod, eða leikmaður utan Wyscout-skrárinnar), aldrei núll. Lýsandi gögn — hreyfa aldrei readiness-litinn."
                      : "Left of the ‖ is football (Wyscout season totals); right is physical (MicroPulse GPS/IMA, same season). Click a player to open a card with ALL Wyscout metrics (per-90 etc.) and the provenance (file + sync date). Min = Wyscout competitive minutes; MMin = MicroPulse match minutes — they can differ because they come from different sources. A “–” means no data (e.g. a keeper with no pod, or a player not in the Wyscout export), never zero. Descriptive data — it never moves the readiness colour.")}
                </p>
              </>
            )
          )}
        </div>
      )}

      {view === "matches" && isBasketball(sport) && (
        <div className="mt-5">
          {mBusy && <div className="py-6 text-center text-sm text-slate-500">…</div>}
          {bmatches && !mBusy && (
            bmatches.games.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                <div className="text-sm font-medium text-slate-700">
                  {is ? "Engir per-leik box-scorar enn." : "No per-game box scores yet."}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {is ? "Þeir birtast hér þegar KKÍ-feed hefur samstillst (per leik). Árs-tölur eru í Leikmenn-flipanum." : "They appear here once the KKÍ feed has synced (per game). Season totals are on the Players tab."}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {bmatches.games.map((g) => (
                  <div key={g.gameId} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-800">
                        {g.opponent ? `${is ? "vs" : "vs"} ${g.opponent}` : (is ? "Leikur" : "Game")}
                        {g.homeAway ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">{g.homeAway === "home" ? (is ? "heima" : "home") : (is ? "úti" : "away")}</span> : null}
                      </span>
                      <span className="text-[12px] text-slate-500">{g.date ?? ""}</span>
                    </div>
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-1.5 font-medium">{is ? "Leikmaður" : "Player"}</th>
                          <th className="px-2 py-1.5 text-right font-medium">Mín</th>
                          <th className="px-2 py-1.5 text-right font-medium">{is ? "Stig" : "Pts"}</th>
                          <th className="px-2 py-1.5 text-right font-medium">{is ? "Frák" : "Reb"}</th>
                          <th className="px-2 py-1.5 text-right font-medium">{is ? "Stoðs" : "Ast"}</th>
                          <th className="px-2 py-1.5 text-right font-medium" title="Field goals">FG</th>
                          <th className="px-2 py-1.5 text-right font-medium" title="3-point">3P</th>
                          <th className="px-2 py-1.5 text-right font-medium" title="Free throws">FT</th>
                          <th className="px-2 py-1.5 text-right font-medium">+/-</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.players.map((p, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="px-2 py-1.5 font-medium text-slate-800">{p.name}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.minutes != null ? Math.round(p.minutes) : "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">{p.points ?? "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.reb ?? "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.assists ?? "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.fg ?? "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.tp ?? "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.ft ?? "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.plusMinus ?? "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <GameDetail gameId={g.gameId} is={is} gameLabel={`${g.opponent ? `vs ${g.opponent}` : (is ? "Leikur" : "Game")}${g.date ? ` · ${g.date}` : ""}`} />
                    <ShotChart gameId={g.gameId} mine is={is} label={is ? "🏀 Sýna skot-kort (mitt lið)" : "🏀 Show shot chart (my team)"} />
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">
                  {is ? "Per-leik box-scorar úr KKÍ-feed. Lýsandi gögn — hreyfa aldrei readiness-litinn." : "Per-game box scores from the KKÍ feed. Descriptive data — it never moves the readiness colour."}
                </p>
              </div>
            )
          )}
        </div>
      )}

      {view === "matches" && !isBasketball(sport) && (
        <div className="mt-5">
          {mBusy && <div className="py-6 text-center text-sm text-slate-500">…</div>}
          {matches && !mBusy && (
            matches.rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                <div className="text-sm font-medium text-slate-700">
                  {is ? "Per-leik fótboltatölur þurfa Wyscout Data API — ekki tengt enn." : "Per-match football stats need the Wyscout Data API — not yet connected."}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {matches.apiConnected
                    ? (is ? "API valið og lykill til staðar — bíð eftir fyrstu samstillingu." : "API selected and secret present — awaiting the first sync.")
                    : (is ? "Wyscout hefur ekkert per-leik Excel; stakur leikur kemur aðeins um Data API viðbótina. Season-tölur eru í Leikmenn-flipanum." : "Wyscout has no per-match Excel; single matches come only via the Data API add-on. Season totals are on the Players tab.")}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {is ? "Þegar tengt: fótbolti og GPS/IMA hlið við hlið fyrir sama leik (player_id + leikdagur)." : "When connected: football and GPS/IMA side by side for the same match (player_id + match date)."}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-medium">{is ? "Leikur" : "Match"}</th>
                      <th className="px-2 py-2 font-medium">{is ? "Leikmaður" : "Player"}</th>
                      <th className="px-2 py-2 text-right font-medium">Min</th>
                      <th className="px-2 py-2 text-right font-medium">G</th>
                      <th className="px-2 py-2 text-right font-medium">A</th>
                      <th className="px-2 py-2 text-right font-medium">xG</th>
                      <th className="px-2 py-2 text-center font-medium text-[#2740e6]">‖</th>
                      <th className="px-2 py-2 text-right font-medium">Dist</th>
                      <th className="px-2 py-2 text-right font-medium">Top</th>
                      <th className="px-2 py-2 text-right font-medium">Load</th>
                      <th className="px-2 py-2 text-right font-medium">MMin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.rows.map((m) => (
                      <tr key={`${m.playerId}-${m.matchDate}`} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 text-slate-600">{m.matchDate}{m.opponent ? ` · ${m.opponent}` : ""}{m.homeAway ? ` (${m.homeAway[0].toUpperCase()})` : ""}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{m.name}{m.position ? <span className="ml-1 text-[10px] text-slate-400">{m.position}</span> : null}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.minutes)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">{fmt(m.goals)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.assists)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(m.xg, 1)}</td>
                        <td className="px-2 py-1.5 text-center text-slate-200">‖</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.distanceKm != null ? fmt(m.physical.distanceKm, 1) : "–"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.topSpeed != null ? fmt(m.physical.topSpeed, 1) : "–"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.playerLoad != null ? m.physical.playerLoad.toLocaleString() : "–"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{m.physical.matchMinutes != null ? fmt(m.physical.matchMinutes) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {modalPlayer && (
        <PlayerMetricsModal player={modalPlayer} is={is} season={overview?.season ?? null} sport={overview?.sport} onClose={() => setModalPlayer(null)} />
      )}
    </div>
  );
}

/**
 * Pop-up card for one player's full Wyscout metric set + provenance — opened by
 * clicking a row in the Players table. Same overlay shell as the other coach
 * modals (backdrop-click + ESC + ✕ to close). Content only; no data fetching.
 */
// Shot chart — the KKÍ court GIF (made/missed dots by location) for one game.
// Fetched with the coach's token as a blob (an <img src> can't send auth), then
// shown. Descriptive — a picture of where shots were taken, nothing more.
function ShotChart({ gameId, playerId, mine, is, label, autoLoad }: { gameId: string; playerId?: string; mine?: boolean; is: boolean; label?: string; autoLoad?: boolean }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const q = `gameId=${gameId}${playerId ? `&playerId=${playerId}` : ""}${mine ? "&mine=1" : ""}`;
      const res = await fetch(`/api/coach/player-stats/shot-chart?${q}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? `Error ${res.status}`); return; }
      setUrl(URL.createObjectURL(await res.blob()));
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); } finally { setBusy(false); }
  };
  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoLoad && !loadedRef.current) { loadedRef.current = true; void load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);
  return (
    <div className="border-t border-slate-100 px-3 py-2.5">
      {!url && !err && (
        <button onClick={() => void load()} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {busy ? "…" : (label ?? (is ? "🏀 Sýna skot-kort" : "🏀 Show shot chart"))}
        </button>
      )}
      {err && <div className="text-[12px] text-rose-600">{err}</div>}
      {url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={is ? "Skot-kort" : "Shot chart"} className="w-full max-w-xl rounded-lg border border-slate-200" />
          <div className="mt-1 text-[10px] text-slate-400">{is ? "Grænt = hitt, rautt = misst. Heimild: KKÍ. Lýsandi — snertir ekki readiness." : "Green = made, red = missed. Source: KKÍ. Descriptive — never touches readiness."}</div>
        </>
      )}
    </div>
  );
}

// Full game box score (both teams, every column) + team totals — the KKÍ
// boxscore + team-comparison views, fetched on demand. Descriptive only.
type GDPlayer = { name: string; ref: string; min: number | null; pts: number; twoM: number; twoA: number; threeM: number; threeA: number; fgM: number; fgA: number; ftM: number; ftA: number; oreb: number; dreb: number; reb: number; ast: number; fouls: number; to: number; stl: number; blk: number; eff: number | null; pm: number | null };
type GDTeam = { name: string; players: GDPlayer[]; totals: Record<string, number> };

// One player's shot chart for one game, as a centred pop-up card (backdrop-click
// + ESC + ✕ to close). Descriptive — never touches readiness.
function ShotChartModal({ gameId, playerRef, playerName, subtitle, is, onClose }: { gameId: string; playerRef: string; playerName: string; subtitle?: string; is: boolean; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Skot-kort" : "Shot chart"}</div>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">🏀 {playerName}</h2>
            {subtitle ? <div className="mt-0.5 text-[12px] text-slate-500">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label={is ? "Loka" : "Close"} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        <ShotChart key={playerRef} gameId={gameId} playerId={playerRef} is={is} autoLoad />
      </div>
    </div>
  );
}

function GameDetail({ gameId, is, gameLabel }: { gameId: string; is: boolean; gameLabel?: string }) {
  const [data, setData] = React.useState<{ teams: GDTeam[] } | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [pick, setPick] = React.useState<{ ref: string; name: string } | null>(null);
  const load = async () => {
    setBusy(true); setErr(null); setOpen(true);
    try {
      const { data: s } = await getSupabaseClient().auth.getSession();
      const res = await fetch(`/api/coach/player-stats/game-detail?gameId=${gameId}`, { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? `Error ${res.status}`); return; }
      setData(await res.json());
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); } finally { setBusy(false); }
  };
  const ma = (m: number, a: number) => `${m}/${a}`;
  const cols: Array<{ h: string; t?: string; get: (p: GDPlayer) => string; tot?: (t: Record<string, number>) => string; bold?: boolean }> = [
    { h: "Mín", get: (p) => (p.min != null ? String(Math.round(p.min)) : "–") },
    { h: "2ja", t: "2-stiga", get: (p) => ma(p.twoM, p.twoA), tot: (t) => ma(t.twoM, t.twoA) },
    { h: "3ja", t: "3-stiga", get: (p) => ma(p.threeM, p.threeA), tot: (t) => ma(t.threeM, t.threeA) },
    { h: "Skot", t: "Vallarskot", get: (p) => ma(p.fgM, p.fgA), tot: (t) => ma(t.fgM, t.fgA) },
    { h: "Víti", t: "Vítaskot", get: (p) => ma(p.ftM, p.ftA), tot: (t) => ma(t.ftM, t.ftA) },
    { h: is ? "Frák" : "Reb", t: is ? "Fráköst (sókn/vörn)" : "Rebounds (off/def)", get: (p) => `${p.reb}`, tot: (t) => `${t.reb}` },
    { h: is ? "Sto" : "Ast", get: (p) => `${p.ast}`, tot: (t) => `${t.ast}` },
    { h: is ? "Vil" : "PF", t: is ? "Villur" : "Fouls", get: (p) => `${p.fouls}`, tot: (t) => `${t.fouls}` },
    { h: is ? "Tap" : "TO", t: is ? "Tapaðir" : "Turnovers", get: (p) => `${p.to}`, tot: (t) => `${t.to}` },
    { h: is ? "Stl" : "Stl", t: is ? "Stolnir" : "Steals", get: (p) => `${p.stl}`, tot: (t) => `${t.stl}` },
    { h: is ? "Var" : "Blk", t: is ? "Varin skot" : "Blocks", get: (p) => `${p.blk}`, tot: (t) => `${t.blk}` },
    { h: "+/-", get: (p) => (p.pm != null ? `${p.pm}` : "–") },
    { h: is ? "Stig" : "Pts", get: (p) => `${p.pts}`, tot: (t) => `${t.pts}`, bold: true },
  ];
  return (
    <div className="border-t border-slate-100 px-3 py-2.5">
      {!open && (
        <button onClick={() => void load()} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {is ? "📋 Ítarleg box-score + liðstölfræði" : "📋 Full box score + team totals"}
        </button>
      )}
      {busy && <div className="py-2 text-center text-[12px] text-slate-500">…</div>}
      {err && <div className="text-[12px] text-rose-600">{err}</div>}
      {data && (
        <div className="space-y-3">
          {data.teams.map((tm) => (
            <div key={tm.name} className="overflow-x-auto">
              <div className="mb-1 text-[12px] font-semibold text-slate-800">{tm.name}</div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[9px] uppercase tracking-wide text-slate-500">
                    <th className="px-1.5 py-1 font-medium">{is ? "Leikmaður" : "Player"}</th>
                    {cols.map((c) => <th key={c.h} title={c.t} className="px-1.5 py-1 text-right font-medium">{c.h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tm.players.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-1.5 py-1 font-medium text-slate-800">
                        {/^\d+$/.test(p.ref) ? (
                          <button
                            onClick={() => setPick({ ref: p.ref, name: p.name })}
                            className={`text-left hover:underline ${pick?.ref === p.ref ? "font-semibold text-indigo-700" : "text-slate-800"}`}
                            title={is ? "Sýna skot-kort leikmannsins" : "Show this player's shot chart"}
                          >
                            🏀 {p.name}
                          </button>
                        ) : p.name}
                      </td>
                      {cols.map((c) => <td key={c.h} className={`px-1.5 py-1 text-right tabular-nums ${c.bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>{c.get(p)}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t border-slate-300 bg-slate-50 font-semibold">
                    <td className="px-1.5 py-1 text-slate-800">{is ? "Lið" : "Team"}</td>
                    {cols.map((c) => <td key={c.h} className="px-1.5 py-1 text-right tabular-nums text-slate-900">{c.tot ? c.tot(tm.totals) : ""}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-[10px] text-slate-400">{is ? "Smelltu á leikmann fyrir hans skot-kort. Heimild: KKÍ. „Lið“-röðin er liðstölfræðin. Lýsandi — snertir ekki readiness." : "Click a player for his shot chart. Source: KKÍ. The “Team” row is the team total. Descriptive — never touches readiness."}</p>
        </div>
      )}
      {pick && (
        <ShotChartModal
          gameId={gameId}
          playerRef={pick.ref}
          playerName={pick.name}
          subtitle={gameLabel ? `${is ? "þessi leikur" : "this game"} · ${gameLabel}` : (is ? "þessi leikur" : "this game")}
          is={is}
          onClose={() => setPick(null)}
        />
      )}
    </div>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] font-medium leading-tight text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function PlayerMetricsModal({ player, is, season, sport, onClose }: { player: OverviewPlayer; is: boolean; season: string | null; sport?: string; onClose: () => void }) {
  const [ai, setAi] = React.useState<string | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiErr, setAiErr] = React.useState<string | null>(null);
  const [shotGames, setShotGames] = React.useState<Array<{ gameId: string; date: string | null; opponent: string | null; kkiRef: string }>>([]);
  const [shotIdx, setShotIdx] = React.useState(0);
  const [shotSeason, setShotSeason] = React.useState(false); // false = one game, true = every game

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Basketball: the player's games that have a per-player shot chart.
  React.useEffect(() => {
    if (!isBasketball(sport)) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await getSupabaseClient().auth.getSession();
        const res = await fetch(`/api/coach/player-stats/player-shot-games?playerId=${player.playerId}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        if (alive && res.ok) { const j = await res.json(); setShotGames(j.games ?? []); }
      } catch { /* optional */ }
    })();
    return () => { alive = false; };
  }, [sport, player.playerId]);

  const f = player.football, ph = player.physical;
  const metricEntries = Object.entries(f.metrics).filter(([, v]) => v != null && v !== "");
  const terms = sportTerms(sport, is);
  const headlineCols = outputColumns(sport, is);

  const genAi = async () => {
    setAiBusy(true); setAiErr(null);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const res = await fetch(`/api/coach/player-stats/narrative`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({
          name: player.name, position: player.position, season, sport: sport ?? "football",
          stats: {
            core: {
              minutes: f.minutes, goals: f.goals, assists: f.assists, xg: f.xg,
              shots: f.shots, shotsOnTarget: f.shotsOnTarget, passAccuracyPct: f.passAccuracyPct,
            },
            metrics: f.metrics,
          },
          lang: is ? "IS" : "EN",
        }),
      });
      const j = await res.json();
      if (!res.ok) { setAiErr(j.error ?? "Failed"); return; }
      setAi(j.narrative as string);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {terms.who}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
              {player.name}
              {player.position ? <span className="ml-2 text-xs font-medium text-slate-400">{player.position}</span> : null}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={is ? "Loka" : "Close"}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Headline season line (the same numbers the table row shows). */}
        <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {headlineCols.map((c) => (
            <MetricStat key={c.header} label={c.header} value={c.render(player)} />
          ))}
        </div>

        {/* AI season summary — labelled as AI, rephrases ONLY the numbers above,
            never a verdict or a readiness/selection call (explainability rules). */}
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">AI</span>
              <span className="text-sm font-semibold text-slate-800">{is ? "Samantekt tímabilsins" : "Season summary"}</span>
            </div>
            {!ai && (
              <button
                type="button"
                onClick={() => void genAi()}
                disabled={aiBusy}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {aiBusy ? (is ? "Skrifa…" : "Writing…") : (is ? "Búa til" : "Generate")}
              </button>
            )}
          </div>
          {ai ? (
            <>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{ai}</p>
              <p className="mt-2 text-[10px] text-slate-400">
                {is
                  ? "AI umorðar aðeins tölurnar hér að ofan — það tekur enga ákvörðun og snertir ekki readiness."
                  : "AI only rephrases the numbers above — it decides nothing and never touches readiness."}
              </p>
            </>
          ) : aiErr ? (
            <p className="mt-2 text-[12px] text-rose-600">{aiErr}</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-500">
              {is
                ? "Stutt samantekt í mannamáli út frá stöðu-tölunum hans — lýsandi, ekki mat á álagi eða vali."
                : "A short plain-language recap from his position stats — descriptive, not a load or selection call."}
            </p>
          )}
        </div>

        {/* Per-player shot chart (basketball) — pick one of his games, see where
            he shot (green=made, red=missed). Free KKÍ image; descriptive only. */}
        {isBasketball(sport) && shotGames.length > 0 && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-sm font-semibold text-slate-800">{is ? "Skot-kort" : "Shot chart"}</span>
                <span className="ml-2 text-[11px] text-slate-400">
                  {shotSeason ? (is ? "allt tímabilið" : "whole season") : (shotIdx === 0 ? (is ? "síðasti leikur" : "latest game") : (is ? "eldri leikur" : "earlier game"))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {shotGames.length > 1 && (
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-[11px]">
                    <button onClick={() => setShotSeason(false)} className={`px-2 py-1 font-medium ${!shotSeason ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>{is ? "Per leik" : "Per game"}</button>
                    <button onClick={() => setShotSeason(true)} className={`px-2 py-1 font-medium ${shotSeason ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>{is ? "Allt tímabilið" : "Whole season"}</button>
                  </div>
                )}
                {!shotSeason && shotGames.length > 1 && (
                  <select
                    value={shotIdx}
                    onChange={(e) => setShotIdx(Number(e.target.value))}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    {shotGames.map((g, i) => (
                      <option key={g.gameId} value={i}>{(g.opponent ? `vs ${g.opponent}` : `Leikur ${g.gameId}`)}{g.date ? ` · ${g.date}` : ""}{i === 0 ? (is ? " (nýjasti)" : " (latest)") : ""}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {shotSeason ? (
              <div className="mt-2">
                <div className="mb-1 text-[11px] text-slate-500">
                  {is ? `Öll skotin hans á tímabilinu — eitt kort per leik (${shotGames.length} leikir).` : `All his shots this season — one chart per game (${shotGames.length} games).`}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {shotGames.map((g) => (
                    <div key={g.gameId} className="rounded-lg border border-slate-100">
                      <div className="px-2 pt-1.5 text-[11px] font-medium text-slate-600">
                        {g.opponent ? `vs ${g.opponent}` : `Leikur ${g.gameId}`}{g.date ? ` · ${g.date}` : ""}
                      </div>
                      <ShotChart key={g.gameId} gameId={g.gameId} playerId={g.kkiRef} is={is} autoLoad />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {shotGames[shotIdx].opponent ? `vs ${shotGames[shotIdx].opponent}` : `Leikur ${shotGames[shotIdx].gameId}`}{shotGames[shotIdx].date ? ` · ${shotGames[shotIdx].date}` : ""}
                </div>
                <div className="-mx-3 -mb-3 mt-1">
                  <ShotChart
                    key={shotGames[shotIdx].gameId}
                    gameId={shotGames[shotIdx].gameId}
                    playerId={shotGames[shotIdx].kkiRef}
                    is={is}
                    label={is ? "🏀 Sýna skot-kort leikmannsins" : "🏀 Show this player's shot chart"}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
          {terms.allMetrics} ({metricEntries.length})
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
          {metricEntries.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 border-b border-slate-50 py-0.5 text-[11px]">
              <span className="truncate text-slate-500" title={k}>{k}</span>
              <span className="shrink-0 tabular-nums font-semibold text-slate-800">{typeof v === "number" ? (Math.round(v * 100) / 100) : String(v)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 text-[10px] leading-relaxed text-slate-400">
          {is ? "Uppruni" : "Source"}: {player.source}{player.sourceRef ? ` · ${player.sourceRef}` : ""}{player.syncedAt ? ` · ${new Date(player.syncedAt).toLocaleDateString()}` : ""}. {terms.provenance}
          {" "}Sess {ph.sessions || "–"}{isBasketball(sport) ? "" : ` · Dist ${ph.totalDistanceKm != null ? `${fmt(ph.totalDistanceKm, 1)} km` : "–"}`} · Load {ph.playerLoad != null ? ph.playerLoad.toLocaleString() : "–"}.
        </div>
      </div>
    </div>
  );
}
