"use client";

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ---------- types ----------

export type Lang = "IS" | "EN";

interface PlayerLite {
  id: string;
  full_name: string;
  team_name: string | null;
  date_of_birth: string | null;
}

type RowStatus =
  | "matched"        // green: will save
  | "unchanged"      // gray: DOB already set to same value
  | "conflict"       // amber: multiple players match this name
  | "not_found"      // red: no match
  | "bad_date"       // red: couldn't parse the date
  | "saved"          // green: persisted successfully
  | "save_error";    // red: save failed

interface ParsedRow {
  raw_name: string;
  raw_dob: string;
  parsedDob: string | null; // ISO yyyy-mm-dd or null
  matches: PlayerLite[];    // 0, 1, or many
  status: RowStatus;
  message?: string;
}

// ---------- copy ----------

const COPY = {
  IS: {
    title: "Fjölda-DOB úr Excel",
    subtitle:
      "Afritaðu tvær dálka (nafn og fæðingardag) úr Excel og límdu hér fyrir neðan. Kerfið parir leikmennina sjálfkrafa og sýnir forskoðun áður en vistað er.",
    placeholder:
      "Arnór Gauti Jónsson\t10.4.2008\nGabríel Snær Hallsson\t2008-07-22\nKristófer Ingi Kristinsson\t15/11/2007",
    pasteLabel: "Lím-svæði (nafn TAB dagsetning)",
    parse: "Greina",
    reparse: "Greina aftur",
    clear: "Hreinsa",
    save: "Vista breytingar",
    saving: "Vista…",
    close: "Loka",
    previewTitle: "Forskoðun",
    thInputName: "Nafn úr Excel",
    thMatch: "Fundinn leikmaður",
    thCurrent: "Núverandi DOB",
    thNew: "Nýtt DOB",
    thStatus: "Staða",
    thMessage: "",
    statusMatched: "Tilbúið",
    statusUnchanged: "Óbreytt",
    statusConflict: "Margir leikmenn",
    statusNotFound: "Fannst ekki",
    statusBadDate: "Dagsetning óskiljanleg",
    statusSaved: "Vistað",
    statusSaveError: "Villa við vistun",
    summary: (ok: number, total: number) =>
      `${ok} af ${total} línum tilbúnar til vistunar`,
    emptyPreview:
      "Límdu inn gögn og smelltu á 'Greina' til að sjá forskoðun.",
    saveDone: (saved: number, failed: number) =>
      failed > 0
        ? `Vistaði ${saved} línur. ${failed} villur.`
        : `Vistaði ${saved} línur.`,
    hintNoPlayers: "Engir virkir leikmenn fundust í kerfinu.",
    loadErr: "Villa við að hlaða leikmannalista",
    dobFormatHint:
      "Studd snið: 10.4.2008, 10/4/2008, 2008-04-10, 10-04-2008",
  },
  EN: {
    title: "Bulk DOB from Excel",
    subtitle:
      "Copy two columns (name and date of birth) from Excel and paste below. The system auto-matches players and shows a preview before saving.",
    placeholder:
      "Arnór Gauti Jónsson\t10.4.2008\nGabríel Snær Hallsson\t2008-07-22\nKristófer Ingi Kristinsson\t15/11/2007",
    pasteLabel: "Paste area (name TAB date)",
    parse: "Parse",
    reparse: "Re-parse",
    clear: "Clear",
    save: "Save changes",
    saving: "Saving…",
    close: "Close",
    previewTitle: "Preview",
    thInputName: "Name from Excel",
    thMatch: "Matched player",
    thCurrent: "Current DOB",
    thNew: "New DOB",
    thStatus: "Status",
    thMessage: "",
    statusMatched: "Ready",
    statusUnchanged: "Unchanged",
    statusConflict: "Multiple matches",
    statusNotFound: "Not found",
    statusBadDate: "Unparseable date",
    statusSaved: "Saved",
    statusSaveError: "Save error",
    summary: (ok: number, total: number) => `${ok} of ${total} rows ready to save`,
    emptyPreview: "Paste data and click 'Parse' to see a preview.",
    saveDone: (saved: number, failed: number) =>
      failed > 0 ? `Saved ${saved} rows. ${failed} errors.` : `Saved ${saved} rows.`,
    hintNoPlayers: "No active players found in the system.",
    loadErr: "Failed to load players",
    dobFormatHint:
      "Supported formats: 10.4.2008, 10/4/2008, 2008-04-10, 10-04-2008",
  },
} as const;

// ---------- helpers ----------

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a date from typical Excel paste formats into ISO yyyy-mm-dd.
 * Returns null if unparseable.
 */
function parseDob(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO 2008-04-10
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 10.4.2008 or 10-4-2008 or 10/4/2008 (DD MM YYYY — Icelandic convention)
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = Number(y);
    const mm = Number(mo);
    const dd = Number(d);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  // Fallback: let Date parse and reformat
  const d2 = new Date(s);
  if (!Number.isNaN(d2.getTime())) {
    const y = d2.getUTCFullYear();
    const mo = d2.getUTCMonth() + 1;
    const dd = d2.getUTCDate();
    return `${y}-${String(mo).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

function statusClasses(status: RowStatus): string {
  switch (status) {
    case "matched":
      return "bg-green-50 border-green-200 text-green-700";
    case "saved":
      return "bg-green-100 border-green-300 text-green-800";
    case "unchanged":
      return "bg-zinc-50 border-zinc-200 text-zinc-500";
    case "conflict":
    case "bad_date":
      return "bg-amber-50 border-amber-200 text-amber-700";
    case "not_found":
    case "save_error":
      return "bg-red-50 border-red-200 text-red-700";
    default:
      return "bg-zinc-50 border-zinc-200 text-zinc-500";
  }
}

function statusLabel(status: RowStatus, t: typeof COPY.IS | typeof COPY.EN): string {
  switch (status) {
    case "matched":
      return t.statusMatched;
    case "unchanged":
      return t.statusUnchanged;
    case "conflict":
      return t.statusConflict;
    case "not_found":
      return t.statusNotFound;
    case "bad_date":
      return t.statusBadDate;
    case "saved":
      return t.statusSaved;
    case "save_error":
      return t.statusSaveError;
    default:
      return status;
  }
}

// ---------- component ----------

export default function BulkDobEditor({
  lang = "IS",
  onClose,
  onSaved,
}: {
  lang?: Lang;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = COPY[lang];

  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  // Load players lazily on first parse.
  // Uses two separate fetches (players, then teams) instead of a PostgREST
  // join, so this works regardless of schema-cache state of the FK.
  const ensurePlayers = useCallback(async (): Promise<PlayerLite[]> => {
    if (players.length > 0) return players;
    setLoading(true);
    const { data: pData, error: pErr } = await supabase
      .from("players")
      .select("id, full_name, date_of_birth, team_id")
      .eq("is_active", true);
    if (pErr) {
      setLoading(false);
      setLoadErr(`${t.loadErr}: ${pErr.message}`);
      return [];
    }

    const teamIds = Array.from(
      new Set(
        (pData ?? [])
          .map((p) => p.team_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );

    const teamNameById = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: tData, error: tErr } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds);
      if (tErr) {
        // Non-fatal — we can still match without team names.
        console.warn("BulkDobEditor: team fetch failed", tErr.message);
      } else {
        for (const t of tData ?? []) {
          if (t.id && t.name) teamNameById.set(t.id, t.name);
        }
      }
    }

    setLoading(false);

    const list: PlayerLite[] = (pData ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      date_of_birth: p.date_of_birth,
      team_name: p.team_id ? (teamNameById.get(p.team_id) ?? null) : null,
    }));
    setPlayers(list);
    return list;
  }, [players, t.loadErr]);

  // Parse the paste area into rows
  const handleParse = useCallback(async () => {
    setSavedMessage("");
    const list = await ensurePlayers();
    const index = new Map<string, PlayerLite[]>();
    for (const p of list) {
      const k = normalizeName(p.full_name);
      const arr = index.get(k) ?? [];
      arr.push(p);
      index.set(k, arr);
    }

    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parsed: ParsedRow[] = lines.map((line) => {
      // Split on tab first (native Excel paste), else on 2+ spaces
      const parts = line.includes("\t")
        ? line.split("\t").map((s) => s.trim())
        : line.split(/\s{2,}/).map((s) => s.trim());

      const rawName = parts[0] ?? "";
      const rawDob = parts[1] ?? "";

      const parsedDob = parseDob(rawDob);
      const key = normalizeName(rawName);
      const matches = index.get(key) ?? [];

      let status: RowStatus = "matched";
      if (matches.length === 0) status = "not_found";
      else if (matches.length > 1) status = "conflict";
      else if (!parsedDob) status = "bad_date";
      else if (matches[0].date_of_birth === parsedDob) status = "unchanged";

      return {
        raw_name: rawName,
        raw_dob: rawDob,
        parsedDob,
        matches,
        status,
      };
    });

    setRows(parsed);
  }, [pasteText, ensurePlayers]);

  const summary = useMemo(() => {
    const ready = rows.filter((r) => r.status === "matched").length;
    return { ready, total: rows.length };
  }, [rows]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSavedMessage("");

    let saved = 0;
    let failed = 0;
    const next: ParsedRow[] = [];

    for (const r of rows) {
      if (r.status !== "matched" || !r.parsedDob || r.matches.length !== 1) {
        next.push(r);
        continue;
      }
      const p = r.matches[0];
      const { error } = await supabase
        .from("players")
        .update({ date_of_birth: r.parsedDob })
        .eq("id", p.id);
      if (error) {
        failed++;
        next.push({ ...r, status: "save_error", message: error.message });
      } else {
        saved++;
        next.push({
          ...r,
          status: "saved",
          matches: [{ ...p, date_of_birth: r.parsedDob }],
        });
      }
    }

    setRows(next);
    setSavedMessage(t.saveDone(saved, failed));
    setSaving(false);
    if (saved > 0 && onSaved) onSaved();
  }, [rows, onSaved, t]);

  const handleClear = useCallback(() => {
    setPasteText("");
    setRows([]);
    setSavedMessage("");
  }, []);

  // ---------- render ----------

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">{t.title}</h3>
            <p className="mt-0.5 max-w-2xl text-xs text-zinc-500">{t.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            {t.close}
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {loadErr && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadErr}
            </div>
          )}

          {/* Paste area */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-600">
              {t.pasteLabel}
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={t.placeholder}
              rows={7}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
            <p className="mt-1 text-[11px] text-zinc-400">{t.dobFormatHint}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleParse}
                disabled={!pasteText.trim() || loading}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                style={{ background: "#005a2b" }}
              >
                {rows.length > 0 ? t.reparse : t.parse}
              </button>
              {rows.length > 0 && (
                <button
                  onClick={handleClear}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
                >
                  {t.clear}
                </button>
              )}
            </div>
          </div>

          {/* Preview table */}
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-6 py-8 text-center text-xs text-zinc-400">
              {t.emptyPreview}
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-800">
                  {t.previewTitle}
                </h4>
                <span className="text-xs text-zinc-500">
                  {t.summary(summary.ready, summary.total)}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 text-left">{t.thInputName}</th>
                      <th className="px-3 py-2 text-left">{t.thMatch}</th>
                      <th className="px-3 py-2 text-left">{t.thCurrent}</th>
                      <th className="px-3 py-2 text-left">{t.thNew}</th>
                      <th className="px-3 py-2 text-left">{t.thStatus}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => {
                      const only = r.matches.length === 1 ? r.matches[0] : null;
                      return (
                        <tr key={i} className="align-top">
                          <td className="px-3 py-2 font-medium text-zinc-900">
                            {r.raw_name || <span className="text-zinc-400">–</span>}
                          </td>
                          <td className="px-3 py-2">
                            {r.matches.length === 0 && (
                              <span className="text-zinc-400">–</span>
                            )}
                            {only && (
                              <div>
                                <div className="text-zinc-800">{only.full_name}</div>
                                {only.team_name && (
                                  <div className="text-[11px] text-zinc-500">
                                    {only.team_name}
                                  </div>
                                )}
                              </div>
                            )}
                            {r.matches.length > 1 && (
                              <div className="text-xs text-amber-700">
                                {r.matches.map((m) => m.full_name).join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-zinc-500">
                            {only?.date_of_birth ?? "–"}
                          </td>
                          <td className="px-3 py-2">
                            {r.parsedDob ? (
                              <span className="font-mono text-zinc-800">
                                {r.parsedDob}
                              </span>
                            ) : (
                              <span className="text-red-600">{r.raw_dob || "–"}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(
                                r.status,
                              )}`}
                            >
                              {statusLabel(r.status, t)}
                            </span>
                            {r.message && (
                              <div className="mt-0.5 text-[10px] text-red-600">
                                {r.message}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {savedMessage && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {savedMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-zinc-50 px-6 py-4 rounded-b-2xl">
          <div className="text-xs text-zinc-500">
            {rows.length > 0 ? t.summary(summary.ready, summary.total) : ""}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              {t.close}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || summary.ready === 0}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              style={{ background: "#005a2b" }}
            >
              {saving ? t.saving : `${t.save} (${summary.ready})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
