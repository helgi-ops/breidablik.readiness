"use client";
export const dynamic = "force-dynamic";

/**
 * /coach/catapult-upload
 *
 * 3-step wizard for uploading Catapult OpenField CSV exports when the team
 * doesn't have API access. Each upload can cover any date range (single
 * session up to many weeks) — bulk uploads are encouraged for new clubs
 * since 28 days seeds personal baselines, ACWR, McBurnie windows.
 *
 *   Step 1 — File pick + auto-parse preview
 *   Step 2 — Map any unmatched athletes (cached after first time)
 *   Step 3 — Commit, show audit summary
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TeamPlayer = { id: string; full_name: string };

type SourceAthlete = {
  sourceKey: string;
  sourceId: string | null;
  sourceName: string | null;
  playerId: string | null;
  resolvedFrom: "cached_id" | "cached_name" | "manual" | null;
};

type PreviewResult = {
  delimiter: string;
  headerCells: string[];
  matchedColumns: Array<{ index: number; header: string | null; key: string }>;
  unmatchedColumns: Array<{ index: number; header: string }>;
  dateRange: { start: string; end: string; days: number } | null;
  aggregatedRows: number;
  sourceAthletes: SourceAthlete[];
};

type CommitResult = {
  rowsCommitted: number;
  rowsParsed: number;
  athletesTotal: number;
  athletesUnmapped: number;
  dateRange: { start: string; end: string; days: number } | null;
  unmappedColumns: string[];
  matchMinutesUpserted: number;
};

/** Damerau-Levenshtein-style normalised similarity 0..1 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 1;
  // Token-set: how many tokens overlap
  const sTokens = new Set(s.split(/\s+/));
  const tTokens = new Set(t.split(/\s+/));
  let shared = 0;
  for (const tok of sTokens) if (tTokens.has(tok)) shared++;
  return shared / Math.max(sTokens.size, tTokens.size);
}

export default function CatapultUploadPage() {
  const supabase = getSupabaseClient();

  // ─── Wizard state ─────────────────────────────────────────────────────
  // Two upload modes — share the same backend pipeline, differ only in
  // the step-1 instructions and the recommended Catapult Cloud workflow.
  //   bootstrap = one-time multi-day backfill (28 days)
  //   daily     = routine post-session upload (1 day)
  const [mode, setMode] = useState<"bootstrap" | "daily">("daily");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Multiple files supported — drag a whole month's worth in at once and
  // the wizard parses each, unions the athlete list across them, asks for
  // a single round of mapping, then commits each file in turn with the
  // same athleteMap. Big bootstrap saves 17 manual click cycles.
  type FileEntry = { filename: string; csv: string; preview: PreviewResult };
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);

  const [previewing, setPreviewing] = useState(false);
  const [previewProgress, setPreviewProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  // Manual athlete mapping: sourceKey → player_id
  const [manualMap, setManualMap] = useState<Record<string, string>>({});

  // Optional per-upload date override. When set, ALL rows in the upload
  // get this date instead of whatever was parsed from the CSV.
  // Necessary because Catapult Activity Report exports use the EXPORT date
  // in the preamble "Date:" line — not the actual session date. A coach
  // exporting a Sunday match on Monday morning ends up with all rows
  // stamped Monday. Coach can correct that here in one step.
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  // When set, the commit also creates match_player_minutes (minutes from the CSV)
  // so TLYP / post-match surfaces see the day as a match — Core/Lite match ingest.
  const [isMatch, setIsMatch] = useState(false);
  const [matchMinutes, setMatchMinutes] = useState(90);

  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null);
  const [commitErr, setCommitErr] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  // Track team name so coaches can SEE which team they're uploading for —
  // critical when an admin coaches multiple teams (e.g. Helgi at Breiðablik
  // + Þór + Grindavík). Without this label, mis-targeted uploads happen.
  const [teamName, setTeamName] = useState<string | null>(null);

  // ─── Resolve team + load roster ────────────────────────────────────────
  // Re-runs on window focus so a team-switch in another tab/sidebar is
  // picked up automatically. Previously this effect ran ONCE on mount,
  // which captured the user's profile.team_id from then; switching teams
  // afterwards left this page stuck on the old team's roster — surfaced as
  // "wrong team's players in athlete-mapping dropdown" (reported 2026-05-15
  // by Helgi: showed Breiðablik players when on Þór page).
  useEffect(() => {
    let alive = true;
    async function loadTeam() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const tid = (prof as { team_id?: string } | null)?.team_id ?? null;
      if (!alive) return;
      setTeamId(tid);
      if (tid) {
        const [{ data: roster }, { data: team }] = await Promise.all([
          supabase
            .from("players")
            .select("id, full_name")
            .eq("team_id", tid)
            .order("full_name"),
          supabase
            .from("teams")
            .select("name")
            .eq("id", tid)
            .maybeSingle(),
        ]);
        if (!alive) return;
        setTeamPlayers((roster ?? []) as TeamPlayer[]);
        setTeamName(((team as { name?: string } | null)?.name) ?? null);
      } else {
        setTeamPlayers([]);
        setTeamName(null);
      }
    }
    void loadTeam();

    function onFocus() { void loadTeam(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [supabase]);

  // ─── File picker → parse each → preview API ────────────────────────────
  // Accepts N files. For each: read text, POST phase=preview, accumulate
  // an entry. After all are parsed, jump to step 2 with the unioned
  // athlete list. Failure on one file aborts the whole batch — better
  // to fail fast than half-load and confuse the coach.
  async function handleFiles(picked: File[]) {
    if (picked.length === 0) return;
    setFiles([]);
    setPreviewErr(null);
    setManualMap({});
    setDateOverride(null);
    setPreviewing(true);
    setPreviewProgress({ done: 0, total: picked.length });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPreviewErr("Ekki innskráður."); setPreviewing(false); setPreviewProgress(null); return; }

    const entries: FileEntry[] = [];
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      try {
        const text = await file.text();
        const res = await fetch("/api/coach/external-load/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            phase: "preview",
            team_id: teamId,
            source: "catapult",
            filename: file.name,
            csv: text,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setPreviewErr(`${file.name}: ${json.error ?? "Villa við greiningu."}`);
          setPreviewing(false);
          setPreviewProgress(null);
          return;
        }
        entries.push({ filename: file.name, csv: text, preview: json as PreviewResult });
        setPreviewProgress({ done: i + 1, total: picked.length });
      } catch (err) {
        setPreviewErr(`${file.name}: ${err instanceof Error ? err.message : "Villa"}`);
        setPreviewing(false);
        setPreviewProgress(null);
        return;
      }
    }

    setFiles(entries);

    // Auto-suggest mappings across the union of athletes from every file.
    // First-seen wins on duplicates (sourceKey is stable).
    const seen = new Map<string, SourceAthlete>();
    for (const e of entries) {
      for (const a of e.preview.sourceAthletes) {
        if (!seen.has(a.sourceKey)) seen.set(a.sourceKey, a);
      }
    }
    const auto: Record<string, string> = {};
    for (const a of seen.values()) {
      if (a.playerId) continue;
      if (!a.sourceName) continue;
      let best: { id: string; score: number } | null = null;
      for (const p of teamPlayers) {
        const s = similarity(a.sourceName, p.full_name);
        if (s >= 0.5 && (!best || s > best.score)) best = { id: p.id, score: s };
      }
      if (best) auto[a.sourceKey] = best.id;
    }
    setManualMap(auto);
    setPreviewing(false);
    setPreviewProgress(null);
    setStep(2);
  }

  async function handleCommit() {
    if (files.length === 0) return;
    setCommitErr(null);
    setCommitting(true);
    setCommitProgress({ done: 0, total: files.length });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setCommitErr("Ekki innskráður."); setCommitting(false); setCommitProgress(null); return; }

    // Loop through files, commit each with the shared athleteMap. Sum the
    // result counts so step 3 shows the total. Stop at first failure so
    // partial uploads don't silently swallow errors.
    let totalCommitted = 0;
    let totalParsed = 0;
    let totalAthletes = 0;
    let totalUnmapped = 0;
    let totalMatchMinutes = 0;
    let earliestStart: string | null = null;
    let latestEnd: string | null = null;
    const allUnmappedColumns = new Set<string>();

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const res = await fetch("/api/coach/external-load/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            phase: "commit",
            team_id: teamId,
            source: "catapult",
            filename: f.filename,
            csv: f.csv,
            athleteMap: manualMap,
            dateOverride: dateOverride,
            isMatch: isMatch,
            matchMinutes: matchMinutes,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setCommitErr(`${f.filename}: ${json.error ?? "Villa við vistun."}`);
          setCommitting(false);
          setCommitProgress(null);
          return;
        }
        totalCommitted += json.rowsCommitted ?? 0;
        totalParsed += json.rowsParsed ?? 0;
        totalMatchMinutes += json.matchMinutesUpserted ?? 0;
        totalAthletes = Math.max(totalAthletes, json.athletesTotal ?? 0);
        totalUnmapped = Math.max(totalUnmapped, json.athletesUnmapped ?? 0);
        if (json.dateRange) {
          if (!earliestStart || json.dateRange.start < earliestStart) earliestStart = json.dateRange.start;
          if (!latestEnd || json.dateRange.end > latestEnd) latestEnd = json.dateRange.end;
        }
        for (const c of json.unmappedColumns ?? []) allUnmappedColumns.add(c);
        setCommitProgress({ done: i + 1, total: files.length });
      } catch (err) {
        setCommitErr(`${f.filename}: ${err instanceof Error ? err.message : "Villa"}`);
        setCommitting(false);
        setCommitProgress(null);
        return;
      }
    }

    const dateRange = earliestStart && latestEnd
      ? { start: earliestStart, end: latestEnd, days: Math.round((+new Date(latestEnd) - +new Date(earliestStart)) / 86400000) + 1 }
      : null;

    setResult({
      rowsCommitted: totalCommitted,
      rowsParsed: totalParsed,
      athletesTotal: totalAthletes,
      athletesUnmapped: totalUnmapped,
      dateRange,
      unmappedColumns: Array.from(allUnmappedColumns),
      matchMinutesUpserted: totalMatchMinutes,
    });
    setCommitting(false);
    setCommitProgress(null);
    setStep(3);
  }

  function reset() {
    setStep(1);
    setFiles([]);
    setPreviewErr(null);
    setManualMap({});
    setResult(null);
    setCommitErr(null);
    setPreviewProgress(null);
    setCommitProgress(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────
  // Aggregate the union of file previews so step 2 shows one summary
  // and one mapping list regardless of how many CSVs were dropped in.

  const aggregated = useMemo(() => {
    const athleteByKey = new Map<string, SourceAthlete>();
    const unmappedColumnsByHeader = new Map<string, { index: number; header: string }>();
    let totalAggregatedRows = 0;
    let earliestStart: string | null = null;
    let latestEnd: string | null = null;

    for (const f of files) {
      // First-seen wins; if the same athlete appears in multiple files,
      // we use the first preview's resolution metadata (which is fine since
      // the alias cache is global by team_id+source).
      for (const a of f.preview.sourceAthletes) {
        if (!athleteByKey.has(a.sourceKey)) athleteByKey.set(a.sourceKey, a);
      }
      for (const c of f.preview.unmatchedColumns) {
        if (!unmappedColumnsByHeader.has(c.header)) unmappedColumnsByHeader.set(c.header, c);
      }
      totalAggregatedRows += f.preview.aggregatedRows;
      if (f.preview.dateRange) {
        if (!earliestStart || f.preview.dateRange.start < earliestStart) earliestStart = f.preview.dateRange.start;
        if (!latestEnd || f.preview.dateRange.end > latestEnd) latestEnd = f.preview.dateRange.end;
      }
    }

    const dateRange = earliestStart && latestEnd
      ? { start: earliestStart, end: latestEnd, days: Math.round((+new Date(latestEnd) - +new Date(earliestStart)) / 86400000) + 1 }
      : null;

    return {
      athletes: Array.from(athleteByKey.values()),
      unmappedColumns: Array.from(unmappedColumnsByHeader.values()),
      aggregatedRows: totalAggregatedRows,
      dateRange,
    };
  }, [files]);

  const unmappedAthletes = useMemo(
    () => aggregated.athletes.filter((a) => !a.playerId && !manualMap[a.sourceKey]),
    [aggregated.athletes, manualMap],
  );

  const mappedCount = useMemo(
    () => aggregated.athletes.filter((a) => a.playerId || manualMap[a.sourceKey]).length,
    [aggregated.athletes, manualMap],
  );

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Catapult CSV upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fyrir lið án OpenField API-aðgangs. Exporta CSV úr Catapult Timeline view og uploada hér.
        </p>
      </div>

      {/* ─── Mode tabs (Bootstrap vs Daily) ─────────────────────────────── */}
      {step === 1 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:max-w-md">
          <button
            type="button"
            onClick={() => setMode("daily")}
            className={`rounded-lg border px-4 py-3 text-left transition-all ${
              mode === "daily"
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-sm font-semibold">Dagleg upload</div>
            <div className={`mt-0.5 text-xs ${mode === "daily" ? "text-background/80" : "text-muted-foreground"}`}>
              Eftir hverja æfingu — 1 dagur
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode("bootstrap")}
            className={`rounded-lg border px-4 py-3 text-left transition-all ${
              mode === "bootstrap"
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-sm font-semibold">Bootstrap (28 dagar)</div>
            <div className={`mt-0.5 text-xs ${mode === "bootstrap" ? "text-background/80" : "text-muted-foreground"}`}>
              Einu sinni — kveikir á öllu
            </div>
          </button>
        </div>
      )}

      {/* API re-sync — for clubs WITH OpenField API access. Used after a
          new Reporting Parameter is enabled in Catapult (e.g. Decel B3
          Efforts Gen 2) so the last 7 days backfill with the new column.
          Catapult does not retroactively populate new params on existing
          activities; only new syncs see them. */}
      {step === 1 && <CatapultApiResync />}

      {/* Step indicator */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {([
          [1, "Veldu skrá"],
          [2, "Athugaðu mapping"],
          [3, "Niðurstaða"],
        ] as [1 | 2 | 3, string][]).map(([n, label]) => (
          <button
            key={n}
            type="button"
            onClick={() => step > n && setStep(n)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              step === n ? "bg-muted border-foreground/20 font-medium"
                         : step > n ? "hover:bg-muted/50 cursor-pointer" : "opacity-40 cursor-default"
            }`}
          >
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
              step === n ? "bg-foreground text-background"
                         : step > n ? "bg-emerald-500 text-white" : "bg-muted text-foreground"
            }`}>
              {step > n ? "✓" : n}
            </span>
            {label}
          </button>
        ))}
        {step !== 1 && (
          <Button variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground" onClick={reset}>
            Hætta við
          </Button>
        )}
      </div>

      {/* ─── STEP 1: File picker (mode-aware copy) ──────────────────── */}
      {step === 1 && mode === "daily" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Veldu CSV — dagsins æfing</CardTitle>
            <CardDescription>
              Í Catapult Cloud: <strong>Timeline → smelltu á dagsins æfingu → Export → CSV</strong>.
              Uploadaðu skrána hér beint eftir á.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length > 0) void handleFiles(fs);
              }}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-foreground file:text-background file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-foreground/90"
            />
            {previewing && previewProgress && (
              <p className="text-sm text-muted-foreground">
                Greini skrár… {previewProgress.done} / {previewProgress.total}
              </p>
            )}
            {previewErr && <p className="text-sm text-rose-600">{previewErr}</p>}

            <div className="rounded-md border bg-emerald-50 p-3 text-xs text-emerald-800">
              <strong>⏱ Tekur ~2 mínútur.</strong> Þú getur uploadað hvenær sem er eftir æfingu —
              best á sama kvöldi svo morgun-briefingin sé tilbúin. Þú getur dregið eina eða
              fleiri skrár inn í einu.
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && mode === "bootstrap" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bootstrap — síðustu 28 dagar</CardTitle>
            <CardDescription>
              Í Catapult Cloud: <strong>Timeline → veldu date range síðustu 28 daga → Export → CSV</strong>.
              Þú getur líka uploadað nokkrar minni CSV-skrár í röð (t.d. eina viku í senn) — kerfið
              de-duplicate-ar á (leikmaður, dagur).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length > 0) void handleFiles(fs);
              }}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-foreground file:text-background file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-foreground/90"
            />
            {previewing && previewProgress && (
              <p className="text-sm text-muted-foreground">
                Greini skrár… {previewProgress.done} / {previewProgress.total}
              </p>
            )}
            {previewErr && <p className="text-sm text-rose-600">{previewErr}</p>}

            <div className="rounded-md border bg-blue-50 p-3 text-xs text-blue-800 space-y-1">
              <div><strong>💡 Af hverju 28 dagar?</strong></div>
              <div>
                Allir hluti kerfisins — personal baselines, ACWR, McBurnie og Decel Intelligence —
                þurfa <strong>amk 28 daga sögu</strong> til að virka almennilega.
                Án þess fær squad-ið flatt GREEN í 4 vikur þar til sagan safnast.
              </div>
              <div>
                Með 28-daga bootstrap-i kveikir kerfið á <strong>strax frá degi 1</strong> — og þú
                þarft bara að gera þetta einu sinni.
              </div>
              <div className="pt-1">
                <strong>📂 Margar skrár í einu:</strong> dragðu eins margar Activity Report CSV
                inn og þú vilt — kerfið parses allar í einu, sameinar leikmenn og tímabil, og
                þú þarft aðeins eitt mapping-skref og einn Commit.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── STEP 2: Mapping review ──────────────────────────────────── */}
      {step === 2 && files.length > 0 && (
        <div className="space-y-4">
          {/* Summary card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Yfirlit</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Skrár</div>
                <div className="font-medium">
                  {files.length} {files.length === 1 ? "skrá" : "skrár"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Tímabil</div>
                <div>
                  {aggregated.dateRange
                    ? `${aggregated.dateRange.start} → ${aggregated.dateRange.end} (${aggregated.dateRange.days} dag${aggregated.dateRange.days === 1 ? "ur" : "ar"})`
                    : "Ekkert"}
                </div>
                {/* Date override — Catapult Activity Reports use the EXPORT
                    date (not session date), so the parsed range is often
                    wrong when uploading a weekend match on Monday morning.
                    Coach can correct in one click. */}
                {aggregated.dateRange && aggregated.dateRange.days === 1 && (
                  <div className="mt-1.5">
                    <label className="block text-[10px] text-muted-foreground">
                      Önnur dagsetning?
                    </label>
                    <input
                      type="date"
                      value={dateOverride ?? aggregated.dateRange.start}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Treat picking the same date as no override (cleaner state).
                        setDateOverride(v === aggregated.dateRange?.start ? null : v || null);
                      }}
                      className="mt-0.5 h-7 w-full rounded-md border bg-background px-1.5 text-xs"
                    />
                    {dateOverride && (
                      <div className="mt-0.5 text-[10px] font-medium text-amber-700">
                        Allar raðir vistast undir {dateOverride}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={isMatch} onChange={(e) => setIsMatch(e.target.checked)} className="h-3.5 w-3.5" />
                  <span className="font-medium">Þetta er leikur</span>
                </label>
                {isMatch && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <label className="text-[10px] text-muted-foreground">Leik-lengd (mín)</label>
                    <input
                      type="number" min={1} max={130} value={matchMinutes}
                      onChange={(e) => setMatchMinutes(Math.max(1, Math.min(130, Number(e.target.value) || 90)))}
                      className="h-6 w-16 rounded-md border bg-background px-1.5 text-xs"
                    />
                    <span className="text-[10px] text-amber-700">→ leik-mínútur fyrir alla sem spiluðu (lagaðu skiptingar á Leik-mínútur síðunni).</span>
                  </div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Athlete-day raðir</div>
                <div>{aggregated.aggregatedRows}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn</div>
                <div>{mappedCount} / {aggregated.athletes.length} mapped</div>
              </div>
            </CardContent>
          </Card>

          {/* File list — collapsed details so coach knows exactly what was parsed */}
          {files.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Skrár í þessu upload-i</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {files.map((f) => (
                  <div key={f.filename} className="flex items-center justify-between text-xs border-b last:border-0 py-1.5">
                    <span className="font-mono truncate">{f.filename}</span>
                    <span className="text-muted-foreground shrink-0 ml-3">
                      {f.preview.aggregatedRows} raðir · {f.preview.sourceAthletes.length} leikm.
                      {f.preview.dateRange && ` · ${f.preview.dateRange.start}`}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Athlete mapping */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tengja leikmenn
                {teamName && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 align-middle">
                    🏟️ {teamName}
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Sameinaður listi yfir alla leikmenn úr {files.length === 1 ? "skránni" : `öllum ${files.length} skrám`}.
                Sjálfvirkt cache-að eftir fyrsta upload. Þú þarft bara að confirma athletes sem hafa ekki verið séðir áður.
                {teamName && <span className="block mt-1 font-medium text-slate-700">Mappast við leikmenn í <strong>{teamName}</strong> — skiptu um lið í sidebar ef þú vilt annað.</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {aggregated.athletes.map((a) => {
                const resolvedId = a.playerId ?? manualMap[a.sourceKey];
                const isCached = a.resolvedFrom === "cached_id" || a.resolvedFrom === "cached_name";
                return (
                  <div key={a.sourceKey} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{a.sourceName ?? "—"}</div>
                      {a.sourceId && (
                        <div className="text-[10px] text-muted-foreground font-mono truncate">{a.sourceId}</div>
                      )}
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-sm flex-1 min-w-0"
                      value={resolvedId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setManualMap((prev) => {
                          const next = { ...prev };
                          if (v) next[a.sourceKey] = v;
                          else delete next[a.sourceKey];
                          return next;
                        });
                      }}
                      disabled={isCached}
                    >
                      <option value="">— veldu leikmann —</option>
                      {teamPlayers.map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                    {isCached && (
                      <Badge variant="outline" className="text-[10px] shrink-0">cached</Badge>
                    )}
                    {!isCached && resolvedId && (
                      <Badge variant="outline" className="text-[10px] shrink-0 border-amber-300 text-amber-700">new</Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Diagnostic: unmapped columns (union across files) */}
          {aggregated.unmappedColumns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Óþekkt CSV dálkar ({aggregated.unmappedColumns.length})</CardTitle>
                <CardDescription>
                  Þessir dálkar verða ekki vistaðir. Ef einhver er mikilvægur, sendu mér nafnið og við bætum við aliasum.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {aggregated.unmappedColumns.map((c) => (
                    <Badge key={c.header} variant="outline" className="text-[10px] font-mono">{c.header}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>Velja aðrar skrár</Button>
            <Button
              onClick={handleCommit}
              disabled={committing || mappedCount === 0}
            >
              {committing && commitProgress
                ? `Vista skrá ${commitProgress.done + 1} / ${commitProgress.total}…`
                : committing
                ? "Vista…"
                : unmappedAthletes.length > 0
                ? `Vista ${mappedCount} leikmenn (sleppi ${unmappedAthletes.length})`
                : `Vista ${aggregated.aggregatedRows} athlete-day raðir`}
            </Button>
          </div>
          {commitErr && <p className="text-sm text-rose-600 text-right">{commitErr}</p>}
          {unmappedAthletes.length > 0 && mappedCount > 0 && (
            <p className="text-xs text-amber-700 text-right">
              {unmappedAthletes.length} leikm. án mapping verða <strong>ekki vistaðir</strong> —
              t.d. ef þeir eru meiddir eða ekki á svæðinu. Þú getur uploadað aftur seinna.
            </p>
          )}
          {mappedCount === 0 && (
            <p className="text-xs text-rose-700 text-right">
              Að minnsta kosti einn leikmaður verður að vera mapped til að vista.
            </p>
          )}
        </div>
      )}

      {/* ─── STEP 3: Result ──────────────────────────────────────────── */}
      {step === 3 && result && (
        <Card className="border-emerald-300">
          <CardHeader>
            <CardTitle className="text-base text-emerald-700">✅ Vistun tókst</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground text-xs">Skráð</div>
                <div className="text-lg font-semibold">{result.rowsCommitted}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Greind</div>
                <div className="text-lg font-semibold">{result.rowsParsed}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn</div>
                <div className="text-lg font-semibold">{result.athletesTotal - result.athletesUnmapped} / {result.athletesTotal}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Tímabil</div>
                <div className="text-sm">
                  {result.dateRange ? `${result.dateRange.days} dag${result.dateRange.days === 1 ? "ur" : "ar"}` : "—"}
                </div>
              </div>
            </div>
            {result.athletesUnmapped > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
                {result.athletesUnmapped} leikmenn voru ekki vistaðir (engin mapping). Þú getur uploadað aftur og mappað þá.
              </div>
            )}
            {isMatch && (
              <div className={`rounded-md border p-2 text-xs ${result.matchMinutesUpserted > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                {result.matchMinutesUpserted > 0
                  ? `Leikur skráður: ${result.matchMinutesUpserted} leikmenn skráðir á ${matchMinutes} mín. TLYP og endurheimt sjá nú leikinn. Lagaðu skiptingar á Leik-mínútur síðunni.`
                  : "Merkt sem leikur, en enginn leikmaður náði álags-þröskuldi (Player Load ≥ 150). Athugaðu CSV-ið eða skráðu mínútur handvirkt."}
              </div>
            )}
            <div className="pt-2">
              <Button variant="outline" onClick={reset}>Uploada fleiri gögnum</Button>
              <span className="text-xs text-muted-foreground ml-2">
                {result.unmappedColumns?.length ? `· ${result.unmappedColumns.length} óþekktir dálkar sleppt` : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── API re-sync (moved from /coach/decel-intelligence) ───────────────
// Re-fetches the last 7 days from Catapult OpenField via the API. Used
// when a new Reporting Parameter has been enabled (e.g. Decel B3 Efforts
// Gen 2) — Catapult doesn't retroactively populate new params on
// existing activities, so the only way to upgrade historic rows is to
// re-run the per-day sync with the new param active. Also re-runs the
// McBurnie baseline refresh once the rows land.
function CatapultApiResync() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setStatus("Sæki JWT token…");
    try {
      const sb = getSupabaseClient();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError("Engin gilda session — endurinnskráðu þig.");
        return;
      }
      const today = new Date();
      const dateTo = new Date(today);
      dateTo.setUTCDate(dateTo.getUTCDate() - 1);
      const dateFrom = new Date(today);
      dateFrom.setUTCDate(dateFrom.getUTCDate() - 7);
      const fromStr = dateFrom.toISOString().slice(0, 10);
      const toStr = dateTo.toISOString().slice(0, 10);

      setStatus(`Endurnýja Catapult gögn ${fromStr} – ${toStr} (3-5 mín)…`);
      const res = await fetch(
        `/api/integrations/catapult/backfill?dateFrom=${fromStr}&dateTo=${toStr}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const msg =
          json?.error ||
          (Array.isArray(json?.results)
            ? json.results.find((r: { status: string; warning?: string }) => r.status === "error")?.warning
            : undefined) ||
          `HTTP ${res.status}`;
        setError(`Backfill villa: ${msg}`);
        return;
      }
      setStatus("Endur-reikna McBurnie baselines með nýjum gögnum…");
      await sb.rpc("refresh_mcburnie_decel_baselines");
      setStatus(`Klárt — ${json.datesProcessed} dagar uppfærðir.`);
      setTimeout(() => setStatus(null), 8000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Backfill villa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">API re-sync — síðustu 7 daga</CardTitle>
        <CardDescription className="text-xs">
          Fyrir lið MEÐ OpenField API — endurnýjar gögn síðustu 7 daga svo nýir Reporting
          Parameters (t.d. Decel B3 Efforts Gen 2) komi inn í eldri raðir. Tekur 3-5 mín.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button onClick={run} disabled={busy} variant="outline" size="sm">
          {busy ? "Sæki…" : "↻ Re-sync síðustu 7 daga"}
        </Button>
        {status && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {status}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
