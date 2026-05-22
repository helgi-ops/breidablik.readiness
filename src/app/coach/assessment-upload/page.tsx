"use client";
export const dynamic = "force-dynamic";

/**
 * /coach/assessment-upload
 *
 * CSV upload wizard for the Physical Assessment Battery — the periodic
 * (≈6-monthly) strength + physical test the afrekshópur goes through at
 * Háskólinn í Reykjavík. Covers sprint/jump + anthropometric measurements;
 * VALD force tests come in via the separate VALD CSV upload.
 *
 *   Step 1 — File pick + assessment details (tester, fallback date)
 *   Step 2 — Map columns + athletes, then commit
 *   Step 3 — Summary
 */

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PreviewAthlete = {
  profileName: string;
  playerId: string | null;
  resolvedFrom: "manual" | "auto" | null;
};

type CatalogEntry = { code: string; nameEN: string; category: string; unit: string };

type PreviewResult = {
  ok: boolean;
  headerCells: string[];
  matchedColumns: Array<{ index: number; header: string; key: string }>;
  unmatchedColumns: Array<{ index: number; header: string }>;
  rowCount: number;
  dateRange: { start: string; end: string; days: number } | null;
  hasAnyDate: boolean;
  athletes: PreviewAthlete[];
  roster: Array<{ id: string; name: string }>;
  metricCatalog: CatalogEntry[];
  error?: string;
};

type CommitResult = {
  ok: boolean;
  assessmentsCommitted: number;
  metricsCommitted: number;
  skippedNoPlayer: number;
  skippedNoDate: number;
  skippedNoMetrics: number;
  athletesResolved: number;
  athletesUnresolved: number;
  error?: string;
};

export default function AssessmentUploadPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvText, setCsvText] = useState<string>("");
  const [filename, setFilename] = useState<string>("");

  // Assessment-level metadata.
  const [testerSource, setTesterSource] = useState<string>("Háskólinn í Reykjavík");
  const [fallbackDate, setFallbackDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  // header → field key (manual column mapping for unmatched columns)
  const [columnOverrides, setColumnOverrides] = useState<Record<string, string>>({});
  // profileName(lowercased) → player_id
  const [athleteMap, setAthleteMap] = useState<Record<string, string>>({});

  const [committing, setCommitting] = useState(false);
  const [commitErr, setCommitErr] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  async function authHeader(): Promise<Record<string, string> | null> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }

  async function handleFile(file: File) {
    setPreviewErr(null);
    setPreview(null);
    setResult(null);
    setColumnOverrides({});
    setFilename(file.name);
    const text = await file.text();
    setCsvText(text);
    await runPreview(text, {});
  }

  async function runPreview(text: string, overrides: Record<string, string>) {
    setPreviewing(true);
    setPreviewErr(null);
    try {
      const headers = await authHeader();
      if (!headers) { setPreviewErr("Ekki innskráður."); return; }
      const res = await fetch("/api/coach/integrations/assessment-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ phase: "preview", csv: text, columnOverrides: overrides }),
      });
      const json = (await res.json()) as PreviewResult;
      if (!res.ok || !json.ok) {
        setPreviewErr(json.error ?? "Villa við greiningu CSV.");
        return;
      }
      setPreview(json);
      const seed: Record<string, string> = {};
      for (const a of json.athletes) {
        if (a.playerId) seed[a.profileName.toLowerCase()] = a.playerId;
      }
      setAthleteMap(seed);
      setStep(2);
    } catch (err) {
      setPreviewErr(err instanceof Error ? err.message : "Villa.");
    } finally {
      setPreviewing(false);
    }
  }

  /** Apply a manual column mapping and re-run the preview so the coach sees it. */
  function setColumnMapping(header: string, key: string) {
    const next = { ...columnOverrides };
    if (key) next[header] = key;
    else delete next[header];
    setColumnOverrides(next);
    void runPreview(csvText, next);
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);
    setCommitErr(null);
    try {
      const headers = await authHeader();
      if (!headers) { setCommitErr("Ekki innskráður."); return; }
      const res = await fetch("/api/coach/integrations/assessment-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          phase: "commit",
          csv: csvText,
          columnOverrides,
          athleteMap,
          assessmentDate: fallbackDate || undefined,
          testerSource: testerSource || undefined,
          notes: notes || undefined,
        }),
      });
      const json = (await res.json()) as CommitResult;
      if (!res.ok || !json.ok) {
        setCommitErr(json.error ?? "Villa við vistun.");
        return;
      }
      setResult(json);
      setStep(3);
    } catch (err) {
      setCommitErr(err instanceof Error ? err.message : "Villa.");
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setStep(1);
    setCsvText("");
    setFilename("");
    setPreview(null);
    setPreviewErr(null);
    setColumnOverrides({});
    setAthleteMap({});
    setResult(null);
    setCommitErr(null);
  }

  const mappedCount = preview
    ? preview.athletes.filter((a) => athleteMap[a.profileName.toLowerCase()]).length
    : 0;
  const needsFallbackDate = !!preview && !preview.hasAnyDate;
  const dateReady = !needsFallbackDate || !!fallbackDate;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mælingaupphleðsla</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hálfsárs styrktar- og líkamsmælingar afrekshóps. Hladdu upp CSV frá mælingaraðila
          (t.d. Háskólanum í Reykjavík) — sprett-, stökk- og líkamsmælingar. VALD kraftmælingar
          fara áfram í gegnum VALD CSV upload.
        </p>
      </div>

      {/* ─── STEP 1: File pick ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1 · Veldu CSV skrá</CardTitle>
            <CardDescription>
              Ein lína á leikmann. Dálkar: nafn, dagsetning (valfrjáls), og einn dálkur á
              hverja mælingu (5/10/20/30/40 m sprettir, CMJ, stökk, hæð, þyngd, fita o.s.frv.).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mælingaraðili</label>
                <input
                  type="text"
                  value={testerSource}
                  onChange={(e) => setTesterSource(e.target.value)}
                  placeholder="Háskólinn í Reykjavík"
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Mælingadagur (ef hann er ekki í CSV)
                </label>
                <input
                  type="date"
                  value={fallbackDate}
                  onChange={(e) => setFallbackDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Athugasemd (valfrjáls)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="T.d. tilefni mælingar eða aðstæður"
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center hover:border-emerald-400 hover:bg-emerald-50/40">
              <span className="text-sm font-medium text-zinc-700">
                Smelltu til að velja CSV skrá
              </span>
              <span className="mt-1 text-xs text-zinc-400">Mælingaskýrsla (.csv)</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>

            {previewing && <p className="text-sm text-zinc-500">Greini skrá…</p>}
            {previewErr && <p className="text-sm text-red-600">{previewErr}</p>}
          </CardContent>
        </Card>
      )}

      {/* ─── STEP 2: Mapping ───────────────────────────────────────────── */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Yfirlit</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn í skrá</div>
                <div>{preview.rowCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Mælingar (dálkar)</div>
                <div>{preview.matchedColumns.filter((c) => c.key !== "profileName" && c.key !== "assessmentDate").length}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Dagsetning</div>
                <div>
                  {preview.dateRange
                    ? `${preview.dateRange.start} → ${preview.dateRange.end}`
                    : fallbackDate || "Vantar"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn tengdir</div>
                <div>{mappedCount} / {preview.athletes.length}</div>
              </div>
              {filename && (
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-muted-foreground text-xs">Skrá</div>
                  <div className="font-mono text-xs truncate">{filename}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {needsFallbackDate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mælingadagur vantar</CardTitle>
                <CardDescription>
                  CSV-skráin inniheldur enga dagsetningu. Veldu dagsetningu mælingarinnar — hún
                  verður notuð fyrir allar raðir.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  type="date"
                  value={fallbackDate}
                  onChange={(e) => setFallbackDate(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mappaðar mælingar</CardTitle>
              <CardDescription>Dálkar sem kerfið þekkti sjálfkrafa.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {preview.matchedColumns.length === 0 && (
                <span className="text-sm text-muted-foreground">Engir dálkar pössuðu.</span>
              )}
              {preview.matchedColumns.map((c) => (
                <Badge key={c.index} className="text-[11px]">
                  {c.header} → {c.key}
                </Badge>
              ))}
            </CardContent>
          </Card>

          {preview.unmatchedColumns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ó-mappaðir dálkar</CardTitle>
                <CardDescription>
                  Þessir dálkar pössuðu ekki sjálfkrafa. Veldu mælingu handvirkt — eða slepptu
                  þeim. Ótengdir dálkar eru hunsaðir.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {preview.unmatchedColumns.map((c) => (
                  <div key={c.index} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.header}</div>
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-sm flex-1 min-w-0"
                      value={columnOverrides[c.header] ?? ""}
                      onChange={(e) => setColumnMapping(c.header, e.target.value)}
                    >
                      <option value="">— hunsa —</option>
                      <option value="profileName">Nafn leikmanns</option>
                      <option value="assessmentDate">Dagsetning</option>
                      {(["speed", "jump", "anthropometric"] as const).map((cat) => (
                        <optgroup
                          key={cat}
                          label={cat === "speed" ? "Hraði" : cat === "jump" ? "Stökk" : "Líkamsmælingar"}
                        >
                          {preview.metricCatalog
                            .filter((m) => m.category === cat)
                            .map((m) => (
                              <option key={m.code} value={m.code}>
                                {m.nameEN} ({m.unit})
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tengja leikmenn</CardTitle>
              <CardDescription>
                Hvert nafn úr CSV-inu er mappað við leikmann í liðinu. Sjálfvirk pörun eftir
                nafni — leiðréttu ef rangt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {preview.athletes.map((a) => {
                const key = a.profileName.toLowerCase();
                const selected = athleteMap[key] ?? "";
                return (
                  <div key={key} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{a.profileName}</div>
                      {a.resolvedFrom === "auto" && (
                        <div className="text-[10px] text-emerald-600">sjálfvirk pörun</div>
                      )}
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-sm flex-1 min-w-0"
                      value={selected}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAthleteMap((prev) => {
                          const next = { ...prev };
                          if (v) next[key] = v;
                          else delete next[key];
                          return next;
                        });
                      }}
                    >
                      <option value="">— ekki tengja —</option>
                      {[...preview.roster]
                        .sort((x, y) => x.name.localeCompare(y.name))
                        .map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {commitErr && <p className="text-sm text-red-600">{commitErr}</p>}

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>Hætta við</Button>
            <Button
              onClick={handleCommit}
              disabled={committing || mappedCount === 0 || !dateReady || previewing}
            >
              {committing ? "Vista…" : `Vista ${preview.rowCount} mælingar`}
            </Button>
          </div>
          {!dateReady && (
            <p className="text-right text-xs text-amber-700">Veldu mælingadag til að halda áfram.</p>
          )}
        </div>
      )}

      {/* ─── STEP 3: Result ────────────────────────────────────────────── */}
      {step === 3 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upphleðsla búin ✓</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground text-xs">Mælingar vistaðar</div>
                <div className="font-medium text-emerald-700">{result.assessmentsCommitted}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Mæligildi</div>
                <div className="font-medium">{result.metricsCommitted}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn tengdir</div>
                <div>{result.athletesResolved}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Sleppt</div>
                <div>{result.skippedNoPlayer + result.skippedNoDate + result.skippedNoMetrics}</div>
              </div>
            </div>
            {(result.skippedNoPlayer > 0 || result.skippedNoDate > 0 || result.skippedNoMetrics > 0) && (
              <p className="text-xs text-amber-700">
                {result.skippedNoPlayer > 0 && `${result.skippedNoPlayer} raðir sleppt (enginn tengdur leikmaður). `}
                {result.skippedNoDate > 0 && `${result.skippedNoDate} raðir sleppt (engin dagsetning). `}
                {result.skippedNoMetrics > 0 && `${result.skippedNoMetrics} raðir sleppt (engar mælingar). `}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Mælingarnar eru vistaðar. Túlkun og samanburður milli mælinga kemur í næsta áfanga.
            </p>
            <Button variant="outline" onClick={reset}>Hlaða upp annarri skrá</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
