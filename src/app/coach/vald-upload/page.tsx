"use client";
export const dynamic = "force-dynamic";

/**
 * /coach/vald-upload
 *
 * CSV upload wizard for VALD Hub "Test Metrics" exports — NordBord and
 * ForceFrame. The VALD external API only covers ForceDecks for this tenant,
 * so these two products are brought in by CSV.
 *
 *   Step 1 — File pick + auto-parse preview
 *   Step 2 — Map athletes (fuzzy-matched to roster) + any unmatched columns
 *   Step 3 — Commit, show summary
 *
 * Export the CSV from VALD Hub: Profiles → (any profile) → Result Table →
 * pick System (NordBord / ForceFrame) → select rows → Export → Test Metrics.
 */

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ValdProduct = "nordbord" | "forceframe";

type PreviewAthlete = {
  profileName: string;
  playerId: string | null;
  resolvedFrom: "manual" | "auto" | null;
};

type PreviewResult = {
  ok: boolean;
  product: ValdProduct;
  headerCells: string[];
  matchedColumns: Array<{ index: number; header: string | null; key: string }>;
  unmatchedColumns: Array<{ index: number; header: string }>;
  rowCount: number;
  dateRange: { start: string; end: string; days: number } | null;
  athletes: PreviewAthlete[];
  roster: Array<{ id: string; name: string }>;
  error?: string;
};

type CommitResult = {
  ok: boolean;
  product: ValdProduct;
  rowsCommitted: number;
  skippedNoPlayer: number;
  skippedNoDate: number;
  athletesResolved: number;
  athletesUnresolved: number;
  error?: string;
};

const PRODUCT_LABEL: Record<ValdProduct, string> = {
  nordbord: "NordBord (Nordic hamstring)",
  forceframe: "ForceFrame (isometric strength)",
};

export default function ValdUploadPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvText, setCsvText] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [forcedProduct, setForcedProduct] = useState<ValdProduct | "auto">("auto");

  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

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
    setFilename(file.name);
    const text = await file.text();
    setCsvText(text);
    await runPreview(text);
  }

  async function runPreview(text: string) {
    setPreviewing(true);
    setPreviewErr(null);
    try {
      const headers = await authHeader();
      if (!headers) { setPreviewErr("Ekki innskráður."); return; }
      const res = await fetch("/api/coach/integrations/vald-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          phase: "preview",
          csv: text,
          product: forcedProduct === "auto" ? undefined : forcedProduct,
        }),
      });
      const json = (await res.json()) as PreviewResult;
      if (!res.ok || !json.ok) {
        setPreviewErr(json.error ?? "Villa við greiningu CSV.");
        return;
      }
      setPreview(json);
      // Seed athleteMap with auto-resolved players.
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

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);
    setCommitErr(null);
    try {
      const headers = await authHeader();
      if (!headers) { setCommitErr("Ekki innskráður."); return; }
      const res = await fetch("/api/coach/integrations/vald-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          phase: "commit",
          csv: csvText,
          product: forcedProduct === "auto" ? preview.product : forcedProduct,
          athleteMap,
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
    setAthleteMap({});
    setResult(null);
    setCommitErr(null);
  }

  const mappedCount = preview
    ? preview.athletes.filter((a) => athleteMap[a.profileName.toLowerCase()]).length
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VALD CSV upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fyrir NordBord og ForceFrame — VALD API nær aðeins ForceDecks. Exporta &quot;Test Metrics&quot;
          CSV úr VALD Hub Result Table og uploada hér.
        </p>
      </div>

      {/* ─── STEP 1: File pick ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1 · Veldu CSV skrá</CardTitle>
            <CardDescription>
              VALD Hub → Profiles → opnaðu leikmann → Result Table → veldu System (NordBord eða
              ForceFrame) → veldu raðir → Export → Test Metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">VALD kerfi</label>
              <div className="mt-1 flex gap-2">
                {(["auto", "nordbord", "forceframe"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForcedProduct(p)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      forcedProduct === p
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {p === "auto" ? "Greina sjálfkrafa" : p === "nordbord" ? "NordBord" : "ForceFrame"}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center hover:border-emerald-400 hover:bg-emerald-50/40">
              <span className="text-sm font-medium text-zinc-700">
                Smelltu til að velja CSV skrá
              </span>
              <span className="mt-1 text-xs text-zinc-400">VALD Hub Test Metrics export (.csv)</span>
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

      {/* ─── STEP 2: Athlete mapping ───────────────────────────────────── */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Yfirlit</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Kerfi</div>
                <div className="font-medium">{PRODUCT_LABEL[preview.product]}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Raðir</div>
                <div>{preview.rowCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Tímabil</div>
                <div>
                  {preview.dateRange
                    ? `${preview.dateRange.start} → ${preview.dateRange.end}`
                    : "Ekkert"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn</div>
                <div>{mappedCount} / {preview.athletes.length} mapped</div>
              </div>
              {filename && (
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-muted-foreground text-xs">Skrá</div>
                  <div className="font-mono text-xs truncate">{filename}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {preview.unmatchedColumns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ó-mappaðir dálkar</CardTitle>
                <CardDescription>
                  Þessir dálkar úr CSV-inu pössuðu ekki sjálfkrafa. Þeir verða hunsaðir — ekkert mál
                  ef þeir eru aukadálkar. Tölfræðin sem kerfið notar (peak force, asymmetry) er
                  sýnd hér fyrir neðan undir &quot;mappaðir dálkar&quot;.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {preview.unmatchedColumns.map((c) => (
                  <Badge key={c.index} variant="outline" className="text-[11px]">{c.header}</Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mappaðir dálkar</CardTitle>
              <CardDescription>Tölfræði sem kerfið les úr CSV-inu.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {preview.matchedColumns.map((c) => (
                <Badge key={c.index} className="text-[11px]">
                  {c.header} → {c.key}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tengja leikmenn</CardTitle>
              <CardDescription>
                Hvert &quot;Profile&quot; úr CSV-inu er mappað við leikmann í liðinu. Sjálfvirk pörun
                eftir nafni — leiðréttu ef rangt.
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
            <Button onClick={handleCommit} disabled={committing || mappedCount === 0}>
              {committing ? "Vista…" : `Vista ${preview.rowCount} raðir`}
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP 3: Result ────────────────────────────────────────────── */}
      {step === 3 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload búið ✓</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground text-xs">Kerfi</div>
                <div className="font-medium">{PRODUCT_LABEL[result.product]}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Raðir vistaðar</div>
                <div className="font-medium text-emerald-700">{result.rowsCommitted}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Leikmenn tengdir</div>
                <div>{result.athletesResolved}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Sleppt</div>
                <div>{result.skippedNoPlayer + result.skippedNoDate}</div>
              </div>
            </div>
            {(result.skippedNoPlayer > 0 || result.skippedNoDate > 0) && (
              <p className="text-xs text-amber-700">
                {result.skippedNoPlayer > 0 && `${result.skippedNoPlayer} raðir sleppt (enginn tengdur leikmaður). `}
                {result.skippedNoDate > 0 && `${result.skippedNoDate} raðir sleppt (engin dagsetning). `}
                Þú getur uploadað aftur eftir að hafa tengt leikmenn.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Gögnin birtast í Taugavöðva-þreyta (CMJ) kortinu og Performance Analytics. Source er merkt &quot;csv&quot;.
            </p>
            <Button variant="outline" onClick={reset}>Uploada aðra skrá</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
