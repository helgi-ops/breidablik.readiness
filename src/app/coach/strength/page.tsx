"use client";

/**
 * Coach view — Strength (Micro-dose)
 *
 * Per-player individualized strength sessions, ~15-20 minutes by design.
 * This is the core MicroPulse philosophy: small, frequent, high-quality
 * exposure rather than infrequent big sessions.
 *
 * Layout: searchable list of players in the squad with a one-line status
 * (MD-context, main lift / block summary, adaptation count). Click a row
 * to expand and see the full prescribed session with rationale per
 * exercise. The same component (PlayerStrengthSessionCard) renders in
 * both list and expanded view — list mode just shows the summary line.
 *
 * Evidence base (research/Microdosing/):
 *   - Rønnestad 2023, García-Pinillos 2024, Aedo-Muñoz 2024.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { pdf } from "@react-pdf/renderer";
import { getSupabaseClient } from "@/lib/supabaseClient";
import PlayerStrengthSessionCard from "@/components/coach/PlayerStrengthSessionCard";
import StrengthSessionPdf, { type StrengthSessionPdfData } from "@/components/coach/StrengthSessionPdf";
import { useLang } from "@/lib/lang";
import type { StrengthSession, MdContext } from "@/lib/micropulse/strengthProgramming/types";
import type { PaletteSlot, PaletteSlots } from "@/lib/micropulse/strengthProgramming/palette";
import type { StructureKey, MdStructures } from "@/lib/micropulse/strengthProgramming/structures";

type PlayerRow = { id: string; full_name: string };

/** One eligible library exercise for a palette slot (from the endpoint). */
type SlotOption = { id: string; nameEN: string; nameIS: string; unilateral: boolean };
type SlotOptionGroup = { slot: PaletteSlot; label: { en: string; is: string }; options: SlotOption[] };
/** Per-MD structure options (from the endpoint). */
type StructureOptionGroup = { md: string; defaultKey: StructureKey | null; options: { key: StructureKey; label: { en: string; is: string } }[] };

export default function CoachStrengthPage() {
  const [lang] = useLang();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const [pdfMdContext, setPdfMdContext] = useState<MdContext | "AUTO">("AUTO");
  const [teamName, setTeamName] = useState<string>("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ sent: number; skipped: number; failed: number } | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  // Send mode: the team default (teams.strength_send_mode), overridable per send.
  const [sendMode, setSendMode] = useState<"individualised" | "standard">("individualised");
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  // Team strength palette — the per-slot exercise pool the individualised / auto
  // build draws from (the coach enters the standard session by hand).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSlots, setPaletteSlots] = useState<PaletteSlots>({});
  const [slotOptions, setSlotOptions] = useState<SlotOptionGroup[]>([]);
  const [savingPalette, setSavingPalette] = useState(false);
  const [paletteSaved, setPaletteSaved] = useState(false);
  // Per-MD training structure (method) the coach ties to each configurable MD day.
  const [mdStructures, setMdStructures] = useState<MdStructures>({});
  const [structureOptions, setStructureOptions] = useState<StructureOptionGroup[]>([]);
  const [savingStructures, setSavingStructures] = useState(false);
  const [structuresSaved, setStructuresSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        if (!sess?.session) {
          if (alive) setLoading(false);
          return;
        }
        // Get coach's team via the profiles row.
        const userId = sess.session.user.id;
        const { data: prof } = await sb
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .maybeSingle();
        const teamId = (prof as { team_id: string } | null)?.team_id;
        if (!teamId) {
          if (alive) setLoading(false);
          return;
        }
        const { data: teamRow } = await sb
          .from("teams")
          .select("name, strength_send_mode, strength_auto_send")
          .eq("id", teamId)
          .maybeSingle();
        if (alive) {
          const tr = teamRow as { name?: string; strength_send_mode?: string; strength_auto_send?: boolean } | null;
          setTeamName(tr?.name ?? "Team");
          setSendMode(tr?.strength_send_mode === "standard" ? "standard" : "individualised");
          setAutoSend(!!tr?.strength_auto_send);
        }
        const { data: pl } = await sb
          .from("players")
          .select("id, full_name")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name", { ascending: true });
        if (!alive) return;
        setPlayers(((pl ?? []) as PlayerRow[]));
      } catch {
        // silent
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load the team palette (slots + eligible library options) once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const token = (await sb.auth.getSession()).data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/coach/team/strength-palette", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setPaletteSlots((json.slots ?? {}) as PaletteSlots);
        setSlotOptions((json.slotOptions ?? []) as SlotOptionGroup[]);
        setMdStructures((json.mdStructures ?? {}) as MdStructures);
        setStructureOptions((json.structureOptions ?? []) as StructureOptionGroup[]);
      } catch {
        // silent
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [players, search]);

  const t = (en: string, is: string) => (lang === "IS" ? is : en);

  /** Bulk-send the prescribed strength session to every active player. */
  async function bulkSendToAll() {
    if (bulkSending) return;
    setBulkSending(true);
    setBulkResult(null);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setBulkSending(false);
        return;
      }
      const mdParam =
        pdfMdContext === "AUTO" ? undefined :
        pdfMdContext === "MD+1" ? "+1" :
        pdfMdContext.replace("MD-", "");
      const res = await fetch("/api/coach/team/send-strength-sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          md: mdParam,
          note: bulkNote.trim() || undefined,
          lang,
          mode: sendMode,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBulkResult({ sent: 0, skipped: 0, failed: players.length });
        return;
      }
      setBulkResult({
        sent: Number(json.sent ?? 0),
        skipped: Number(json.skipped ?? 0),
        failed: Number(json.failed ?? 0),
      });
      setBulkNote("");
      setShowBulkConfirm(false);
    } finally {
      setBulkSending(false);
    }
  }

  /** Persist the current mode as the team default (still overridable per send). */
  async function saveTeamDefault() {
    if (savingDefault) return;
    setSavingDefault(true);
    setDefaultSaved(false);
    try {
      const sb = getSupabaseClient();
      const token = (await sb.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/coach/team/strength-send-mode", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: sendMode }),
      });
      if (res.ok) { setDefaultSaved(true); setTimeout(() => setDefaultSaved(false), 2500); }
    } finally {
      setSavingDefault(false);
    }
  }

  /** Opt in / out of the daily automatic send (no coach click) for this team. */
  async function toggleAutoSend(next: boolean) {
    if (savingAuto) return;
    setSavingAuto(true);
    const prev = autoSend;
    setAutoSend(next); // optimistic
    try {
      const sb = getSupabaseClient();
      const token = (await sb.auth.getSession()).data.session?.access_token;
      if (!token) { setAutoSend(prev); return; }
      const res = await fetch("/api/coach/team/strength-send-mode", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ autoSend: next }),
      });
      if (!res.ok) setAutoSend(prev);
    } catch {
      setAutoSend(prev);
    } finally {
      setSavingAuto(false);
    }
  }

  /** Add / remove an exercise from a palette slot (local, saved on click of Save). */
  function togglePaletteExercise(slot: PaletteSlot, id: string) {
    setPaletteSaved(false);
    setPaletteSlots((prev) => {
      const cur = prev[slot] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, [slot]: next };
    });
  }

  /** Persist the team palette. */
  async function savePalette() {
    if (savingPalette) return;
    setSavingPalette(true);
    setPaletteSaved(false);
    try {
      const sb = getSupabaseClient();
      const token = (await sb.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/coach/team/strength-palette", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slots: paletteSlots }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setPaletteSlots((json.slots ?? paletteSlots) as PaletteSlots);
        setPaletteSaved(true);
        setTimeout(() => setPaletteSaved(false), 2500);
      }
    } finally {
      setSavingPalette(false);
    }
  }

  /** Set the method for one MD day (or clear it back to default). */
  function setStructure(md: string, key: StructureKey | "") {
    setStructuresSaved(false);
    setMdStructures((prev) => {
      const next = { ...prev };
      if (key === "") delete next[md as keyof MdStructures];
      else next[md as keyof MdStructures] = key;
      return next;
    });
  }

  /** Persist the team MD→structure map. */
  async function saveStructures() {
    if (savingStructures) return;
    setSavingStructures(true);
    setStructuresSaved(false);
    try {
      const sb = getSupabaseClient();
      const token = (await sb.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/coach/team/strength-palette", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mdStructures }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setMdStructures((json.mdStructures ?? mdStructures) as MdStructures);
        setStructuresSaved(true);
        setTimeout(() => setStructuresSaved(false), 2500);
      }
    } finally {
      setSavingStructures(false);
    }
  }

  /** Fetch the prescribed session for every player in parallel, then build
   *  the team PDF locally with @react-pdf/renderer and trigger a download. */
  async function buildAndDownloadPdf() {
    if (pdfBuilding) return;
    setPdfBuilding(true);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) {
        setPdfBuilding(false);
        return;
      }
      const qs = pdfMdContext === "AUTO" ? "" : `?md=${pdfMdContext.replace("MD-", "")}`;
      const results = await Promise.all(
        players.map(async (p) => {
          try {
            const res = await fetch(`/api/coach/player/${p.id}/strength-session${qs}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return { playerName: p.full_name, session: null as StrengthSession | null };
            const json = await res.json();
            return { playerName: p.full_name, session: (json.session ?? null) as StrengthSession | null };
          } catch {
            return { playerName: p.full_name, session: null as StrengthSession | null, error: "Fetch failed" };
          }
        })
      );
      const todayIso = new Date().toISOString().slice(0, 10);
      const data: StrengthSessionPdfData = {
        teamName,
        date: todayIso,
        mdContextRequested: pdfMdContext === "AUTO" ? "Auto-detected" : pdfMdContext,
        sessions: results,
      };
      const blob = await pdf(<StrengthSessionPdf data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MicroPulse-Strength-${teamName.replace(/\s+/g, "_")}-${todayIso}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBuilding(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/coach" className="hover:text-slate-900">
            {t("Coach", "Þjálfari")}
          </Link>
          <span>→</span>
          <span className="text-slate-900 font-medium">{t("Strength", "Styrktaræfing")}</span>
        </div>
        <h1 className="mt-1 text-2xl md:text-3xl font-bold text-slate-900">
          {t("Strength — Micro-dose", "Styrktaræfing — Micro-dose")}
        </h1>
        <p className="mt-2 text-sm text-slate-700 leading-relaxed max-w-3xl">
          {t(
            "Per-player ~20-minute strength sessions tuned to today's signals. " +
            "Micro-dose by design — small, frequent, high-quality exposure. " +
            "Pick a player to see their prescribed session with the adaptation rationale.",
            "Sérstillt ~20-mínútna styrktaræfingar fyrir hvern leikmann, byggðar á daglegum " +
            "gögnum. Micro-dose by design — lítið, oft, hágæða álag. Veldu leikmann til " +
            "að sjá prescribed session með skýringum.",
          )}
        </p>
        <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-900 leading-relaxed">
          <p className="font-semibold mb-1">
            {t("Why micro-dose?", "Hvers vegna micro-dose?")}
          </p>
          <p>
            {t(
              "15-20 min sessions 3-5×/week beat 60 min 2×/week for in-season teams (Rønnestad 2023). " +
              "Preserves strength + power without next-day fatigue carryover. Fits congested calendars. " +
              "Players actually do 20-min sessions.",
              "15-20 mín æfingar 3-5×/viku slá 60 mín 2×/viku á keppnistímabili (Rønnestad 2023). " +
              "Heldur styrk og krafti án þreytu daginn eftir. Hentar þéttum keppnisleikjum. " +
              "Leikmenn kýla raunverulega 20 mín æfingu.",
            )}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={t("Search players…", "Leita að leikmönnum…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="text-slate-600">{t("PDF context:", "PDF samhengi:")}</label>
          <select
            value={pdfMdContext}
            onChange={(e) => setPdfMdContext(e.target.value as MdContext | "AUTO")}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="AUTO">{t("Auto", "Sjálfvalið")}</option>
            <option value="MD-4">MD-4</option>
            <option value="MD-3">MD-3</option>
            <option value="MD-2">MD-2</option>
            <option value="MD-1">MD-1</option>
            <option value="MD+1">MD+1</option>
          </select>
          <button
            type="button"
            onClick={buildAndDownloadPdf}
            disabled={pdfBuilding || players.length === 0}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              pdfBuilding || players.length === 0
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
            title={t(
              "Build a PDF with one page per player — print for the whiteboard or email to players.",
              "Búa til PDF með einni síðu per leikmann — prenta á whiteboard eða senda á leikmenn.",
            )}
          >
            {pdfBuilding
              ? t("Building…", "Byggi…")
              : t(`Download team PDF (${players.length})`, `Sækja team PDF (${players.length})`)}
          </button>
        </div>
      </div>

      {/* Bulk send-to-all panel */}
      <div className="mb-4 rounded-md border-2 border-indigo-200 bg-white p-3">
        {/* Session mode — team default (overridable per send). Both modes honour
            week-setup (MD) + readiness; "standard" skips the per-player screen
            corrective + deficit-ledger emphases + F-V driver. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <span className="text-xs font-semibold text-slate-700">{t("Session mode:", "Æfingahamur:")}</span>
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs">
            {(["individualised", "standard"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSendMode(m)}
                className={`px-2.5 py-1 font-medium transition ${sendMode === m ? "bg-indigo-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {m === "individualised"
                  ? t("Individualised (data + screen)", "Einstaklingsmiðað (gögn + skimun)")
                  : t("Standard (MD template)", "Staðlað (MD-sniðmát)")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={saveTeamDefault}
            disabled={savingDefault}
            className="text-[11px] font-medium text-indigo-700 hover:underline disabled:opacity-50"
          >
            {defaultSaved ? t("✓ Saved as team default", "✓ Vistað sem sjálfgefið") : t("Set as team default", "Gera að sjálfgefnu")}
          </button>
          <span className="w-full text-[11px] text-slate-500">
            {sendMode === "individualised"
              ? t("Each player's session is tuned to readiness + MD, plus their own movement-screen corrective + deficit-ledger emphases.", "Æfing hvers leikmanns er stillt að readiness + MD, ásamt hans eigin skimunar-corrective + halla-áherslum.")
              : t("The MD template, readiness- and MD-tuned, without the per-player screen corrective or ledger emphases.", "MD-sniðmátið, readiness- og MD-stillt, án per-leikmanns skimunar-corrective eða halla-áherslna.")}
          </span>
          {/* Opt-in: fully automatic morning send (no click) in the mode above. */}
          <label className="mt-1 flex w-full items-start gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={autoSend} disabled={savingAuto} onChange={(e) => toggleAutoSend(e.target.checked)} className="mt-0.5" />
            <span>
              <strong className="text-slate-700">{t("Auto-send every morning (opt-in)", "Sjálf-senda á hverjum morgni (valfrjálst)")}</strong>{" "}
              {t(
                "Each active player is sent their session automatically on strength days — no click. It never overwrites a session you already sent that day, and you can re-send / override or switch it off anytime.",
                "Hver virkur leikmaður fær æfinguna sjálfkrafa á styrktardögum — enginn smellur. Það yfirskrifar aldrei æfingu sem þú hefur þegar sent þann dag, og þú getur endursent / hnekkt eða slökkt hvenær sem er.",
              )}
            </span>
          </label>
          {/* Team exercise palette — feeds the individualised / auto build only. */}
          <div className="mt-1 w-full">
            <button
              type="button"
              onClick={() => setPaletteOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 hover:underline"
            >
              <span className={`inline-block transition-transform ${paletteOpen ? "rotate-90" : ""}`}>▸</span>
              {t("Team exercise palette", "Æfingasafn liðsins")}
              <span className="font-normal text-slate-500">
                {(() => {
                  const n = Object.values(paletteSlots).reduce((s, ids) => s + (ids?.length ?? 0), 0);
                  return n > 0
                    ? t(`(${n} chosen — used by individualised sends)`, `(${n} valdar — notaðar í einstaklingsmiðaðar sendingar)`)
                    : t("(none chosen — the built-in default is used)", "(ekkert valið — sjálfgefna sniðmátið er notað)");
                })()}
              </span>
            </button>
            {paletteOpen && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
                  {t(
                    "Pick the power/explosive and strength exercises the individualised (and auto) session may prescribe — the system builds each player's session from THIS pool. Pick both a unilateral and a bilateral lower-body option: the engine chooses between them per player from their symmetry. Leave a slot empty to fall back to the built-in default. This does not affect the Standard mode — you enter that session yourself.",
                    "Veldu afl-/sprengikrafts- og styrktaræfingarnar sem einstaklingsmiðaða (og sjálfvirka) æfingin má nota — kerfið byggir æfingu hvers leikmanns úr ÞESSU safni. Veldu bæði einhliða og tvíhliða valkost fyrir neðri líkama: kerfið velur á milli þeirra fyrir hvern leikmann út frá symmetríu hans. Skildu reit eftir tóman til að nota sjálfgefna sniðmátið. Þetta hefur ekki áhrif á Staðlaða haminn — þá æfingu setur þú inn sjálf(ur).",
                  )}
                </p>
                <div className="space-y-3">
                  {slotOptions.map((grp) => {
                    const chosen = new Set(paletteSlots[grp.slot] ?? []);
                    return (
                      <div key={grp.slot}>
                        <div className="mb-1 text-[11px] font-semibold text-slate-700">
                          {t(grp.label.en, grp.label.is)}
                          <span className="ml-1 font-normal text-slate-400">{chosen.size > 0 ? `· ${chosen.size}` : ""}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {grp.options.map((opt) => {
                            const on = chosen.has(opt.id);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => togglePaletteExercise(grp.slot, opt.id)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                  on
                                    ? "border-indigo-600 bg-indigo-600 text-white"
                                    : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"
                                }`}
                              >
                                {t(opt.nameEN, opt.nameIS)}
                              </button>
                            );
                          })}
                          {grp.options.length === 0 && (
                            <span className="text-[11px] text-slate-400">{t("No library exercises for this slot.", "Engar æfingar í safninu fyrir þennan reit.")}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={savePalette}
                    disabled={savingPalette}
                    className="rounded-md bg-indigo-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                  >
                    {savingPalette ? t("Saving…", "Vista…") : t("Save palette", "Vista safn")}
                  </button>
                  {paletteSaved && <span className="text-[11px] font-medium text-emerald-700">{t("✓ Saved", "✓ Vistað")}</span>}
                </div>

                {/* Per-MD training structure (method) — ties a method to each strength/power day. */}
                {structureOptions.length > 0 && (
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <div className="mb-1 text-[11px] font-semibold text-slate-700">{t("Session structure per MD day", "Uppsetning æfingar per MD-dag")}</div>
                    <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
                      {t(
                        "Tie a training method to each day — the individualised (and auto) session lays that method out from your palette. MD-4 / MD-3 offer strength & power methods; MD-2 / MD-1 offer velocity/explosive methods (power contrast, potentiation cluster) that stay light + fast near the match. Leave a day on Default to keep its built-in structure. MD+1 recovery stays fixed.",
                        "Tengdu æfingaaðferð við hvern dag — einstaklingsmiðaða (og sjálfvirka) æfingin raðar þeirri aðferð úr palette-inu þínu. MD-4 / MD-3 bjóða styrk- og afl-aðferðir; MD-2 / MD-1 bjóða hraða-/sprengikrafts-aðferðir (afl-contrast, potentiation cluster) sem haldast léttar + hraðar nálægt leik. Skildu dag eftir á Sjálfgefið til að halda innbyggðu uppsetningunni. MD+1 endurheimt helst föst.",
                      )}
                    </p>
                    <div className="space-y-1.5">
                      {structureOptions.map((grp) => {
                        const current = mdStructures[grp.md as keyof MdStructures] ?? "";
                        return (
                          <div key={grp.md} className="flex items-center gap-2">
                            <span className="w-12 shrink-0 text-[12px] font-semibold text-slate-700">{grp.md}</span>
                            <select
                              value={current}
                              onChange={(e) => setStructure(grp.md, e.target.value as StructureKey | "")}
                              className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[12px]"
                            >
                              <option value="">
                                {t("Default", "Sjálfgefið")}
                                {grp.defaultKey ? ` — ${t(grp.options.find((o) => o.key === grp.defaultKey)?.label.en ?? grp.defaultKey, grp.options.find((o) => o.key === grp.defaultKey)?.label.is ?? grp.defaultKey)}` : ""}
                              </option>
                              {grp.options.map((o) => (
                                <option key={o.key} value={o.key}>{t(o.label.en, o.label.is)}{o.key === grp.defaultKey ? t(" (default)", " (sjálfgefið)") : ""}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveStructures}
                        disabled={savingStructures}
                        className="rounded-md bg-indigo-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                      >
                        {savingStructures ? t("Saving…", "Vista…") : t("Save structures", "Vista uppsetningar")}
                      </button>
                      {structuresSaved && <span className="text-[11px] font-medium text-emerald-700">{t("✓ Saved", "✓ Vistað")}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {!showBulkConfirm ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-slate-700">
              <strong>{t("Send to whole team:", "Senda á allt liðið:")}</strong>{" "}
              {t(
                `Push today's prescribed session (${pdfMdContext}) into every active player's app.`,
                `Pusha prescribed session dagsins (${pdfMdContext}) í app allra virkra leikmanna.`,
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowBulkConfirm(true)}
              disabled={players.length === 0 || bulkSending}
              className={`ml-auto rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                players.length === 0 || bulkSending
                  ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                  : "bg-indigo-700 text-white hover:bg-indigo-800"
              }`}
            >
              📲 {t(`Send to all (${players.length})`, `Senda á alla (${players.length})`)}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-800">
              {t(
                `Send the ${pdfMdContext} session to all ${players.length} active players? Each gets a push notification + in-app message.`,
                `Senda ${pdfMdContext} æfinguna á alla ${players.length} virku leikmennina? Hver fær push tilkynningu + skilaboð í appinu.`,
              )}
            </p>
            <textarea
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value.slice(0, 280))}
              rows={2}
              placeholder={t(
                "Optional team-wide note (e.g. 'Run this after the field session today').",
                "Valfrjáls liðs-athugasemd (t.d. 'Keyrðu þetta eftir velli æfinguna í dag').",
              )}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={bulkSendToAll}
                disabled={bulkSending}
                className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:bg-indigo-300"
              >
                {bulkSending ? t("Sending…", "Sendi…") : t(`Confirm — send to ${players.length}`, `Staðfesta — senda á ${players.length}`)}
              </button>
              <button
                type="button"
                onClick={() => { setShowBulkConfirm(false); setBulkNote(""); }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                {t("Cancel", "Hætta við")}
              </button>
            </div>
          </div>
        )}
        {bulkResult && (
          <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
            ✓ {t(
              `Sent ${bulkResult.sent} · Skipped ${bulkResult.skipped} · Failed ${bulkResult.failed}`,
              `Sent ${bulkResult.sent} · Sleppt ${bulkResult.skipped} · Mistókst ${bulkResult.failed}`,
            )}
            {bulkResult.skipped > 0 && (
              <span className="ml-1 text-emerald-700">
                {t(
                  "(skipped = off-day, injured, or RECOVERY verdict — handled elsewhere)",
                  "(sleppt = off-day, meidd(ur), eða RECOVERY verdict — höndlað annars staðar)",
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          {search
            ? t("No players match your search.", "Engir leikmenn passa við leitina.")
            : t("No active players on your team yet.", "Engir virkir leikmenn í þínu liði.")}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <li
                key={p.id}
                className="rounded-md border border-slate-200 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition"
                >
                  <span className="font-medium text-slate-900">{p.full_name}</span>
                  <span className="text-xs text-slate-500">
                    {isExpanded ? "▾" : "▸"} {isExpanded ? t("Hide", "Fela") : t("View session", "Sýna æfingu")}
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-200 p-3 bg-slate-50">
                    <PlayerStrengthSessionCard playerId={p.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 text-[10px] text-slate-400 leading-relaxed">
        <p>
          {t(
            "Evidence: Rønnestad 2023 (microdosing), van Dyk 2019 (Nordic), " +
            "Harøy 2019 (Copenhagen), Pareja-Blanco 2017 (VBT), Comfort 2018 (IMTP), " +
            "Tufano 2017 (cluster sets), Liu 2023 (French Contrast).",
            "Heimildir: Rønnestad 2023 (microdosing), van Dyk 2019 (Nordic), " +
            "Harøy 2019 (Copenhagen), Pareja-Blanco 2017 (VBT), Comfort 2018 (IMTP), " +
            "Tufano 2017 (cluster sets), Liu 2023 (French Contrast).",
          )}
        </p>
      </div>
    </div>
  );
}
