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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csv, setCsv] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  // Manual athlete mapping: sourceKey → player_id
  const [manualMap, setManualMap] = useState<Record<string, string>>({});

  const [committing, setCommitting] = useState(false);
  const [commitErr, setCommitErr] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  // ─── Resolve team + load roster ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const tid = (prof as { team_id?: string } | null)?.team_id ?? null;
      setTeamId(tid);
      if (tid) {
        const { data } = await supabase
          .from("players")
          .select("id, full_name")
          .eq("team_id", tid)
          .order("full_name");
        setTeamPlayers((data ?? []) as TeamPlayer[]);
      }
    })();
  }, [supabase]);

  // ─── File picker → read text → preview API ─────────────────────────────
  async function handleFile(file: File) {
    setFilename(file.name);
    const text = await file.text();
    setCsv(text);
    setPreviewErr(null);
    setPreview(null);
    setManualMap({});
    setPreviewing(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPreviewErr("Ekki innskráður."); setPreviewing(false); return; }

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
    if (!res.ok) { setPreviewErr(json.error ?? "Villa við greiningu."); setPreviewing(false); return; }

    setPreview(json as PreviewResult);

    // Auto-suggest manual mappings for unresolved athletes
    const auto: Record<string, string> = {};
    for (const a of (json as PreviewResult).sourceAthletes) {
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
    setStep(2);
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitErr(null);
    setCommitting(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setCommitErr("Ekki innskráður."); setCommitting(false); return; }

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
        filename,
        csv,
        athleteMap: manualMap,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setCommitErr(json.error ?? "Villa við vistun."); setCommitting(false); return; }
    setResult(json as CommitResult);
    setCommitting(false);
    setStep(3);
  }

  function reset() {
    setStep(1); setCsv(""); setFilename("");
    setPreview(null); setPreviewErr(null);
    setManualMap({}); setResult(null); setCommitErr(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────

  const unmappedAthletes = useMemo(
    () => (preview?.sourceAthletes ?? []).filter(
      (a) => !a.playerId && !manualMap[a.sourceKey],
    ),
    [preview, manualMap],
  );

  const mappedCount = useMemo(
    () => (preview?.sourceAthletes ?? []).filter(
      (a) => a.playerId || manualMap[a.sourceKey],
    ).length,
    [preview, manualMap],
  );

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Catapult CSV upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fyrir lið án OpenField API-aðgangs. Exporta Activity Report úr OpenField Cloud sem CSV og uploada hér —
          virkar fyrir einn dag eða marga (mælt með 28 daga bulk fyrir nýja klúbba).
        </p>
      </div>

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

      {/* ─── STEP 1: File picker ─────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skref 1 — Veldu CSV-skrá</CardTitle>
            <CardDescription>
              Í OpenField Cloud: <strong>Reporting → Activity Report → Export → CSV</strong>. Veldu hvaða dagaramma sem er
              (einn dagur, ein vika, 28 dagar).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-foreground file:text-background file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-foreground/90"
            />
            {previewing && <p className="text-sm text-muted-foreground">Greini skrá…</p>}
            {previewErr && <p className="text-sm text-rose-600">{previewErr}</p>}

            <div className="rounded-md border bg-blue-50 p-3 text-xs text-blue-800">
              <strong>💡 Nýr klúbbur?</strong> Exportaðu síðustu 28 daga á EINUM CSV.
              Það kveikir á personal baselines, ACWR, McBurnie og Decel Intelligence strax — þú þarft ekki að bíða 4 vikur eftir að söguhrun safnist.
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── STEP 2: Mapping review ──────────────────────────────────── */}
      {step === 2 && preview && (
        <div className="space-y-4">
          {/* Summary card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Yfirlit</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Skrá</div>
                <div className="font-mono text-xs truncate">{filename}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Tímabil</div>
                <div>
                  {preview.dateRange
                    ? `${preview.dateRange.start} → ${preview.dateRange.end} (${preview.dateRange.days} dag${preview.dateRange.days === 1 ? "ur" : "ar"})`
                    : "Ekkert"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Athlete-day raðir</div>
                <div>{preview.aggregatedRows}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn</div>
                <div>{mappedCount} / {preview.sourceAthletes.length} mapped</div>
              </div>
            </CardContent>
          </Card>

          {/* Athlete mapping */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tengja leikmenn</CardTitle>
              <CardDescription>
                Sjálfvirkt cache-að eftir fyrsta upload. Þú þarft bara að confirma athletes sem hafa ekki verið séðir áður.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {preview.sourceAthletes.map((a) => {
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

          {/* Diagnostic: unmapped columns */}
          {preview.unmatchedColumns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Óþekkt CSV dálkar ({preview.unmatchedColumns.length})</CardTitle>
                <CardDescription>
                  Þessir dálkar verða ekki vistaðir. Ef einhver er mikilvægur, sendu mér nafnið og við bætum við aliasum.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {preview.unmatchedColumns.map((c) => (
                    <Badge key={c.index} variant="outline" className="text-[10px] font-mono">{c.header}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>Velja aðra skrá</Button>
            <Button
              onClick={handleCommit}
              disabled={committing || unmappedAthletes.length > 0 || mappedCount === 0}
            >
              {committing ? "Vista…" : `Vista ${preview.aggregatedRows} athlete-day raðir`}
            </Button>
          </div>
          {commitErr && <p className="text-sm text-rose-600 text-right">{commitErr}</p>}
          {unmappedAthletes.length > 0 && (
            <p className="text-xs text-amber-700 text-right">
              {unmappedAthletes.length} leikmenn enn án mapping — confirmaðu þá fyrst.
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
            <div className="pt-2">
              <Button variant="outline" onClick={reset}>Uploada fleiri gögnum</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
