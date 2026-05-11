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

type PlayerRow = { id: string; full_name: string };

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
          .select("name")
          .eq("id", teamId)
          .maybeSingle();
        if (alive) setTeamName((teamRow as { name: string } | null)?.name ?? "Team");
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
