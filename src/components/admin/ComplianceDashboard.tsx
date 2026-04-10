"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ---------- types ----------

export type Lang = "IS" | "EN";

type Severity = "critical" | "warning" | "info" | "ok";

interface ComplianceRow {
  player_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  date_of_birth: string | null;
  is_minor: boolean;
  missing_dob: boolean;
  missing_data_processing: boolean;
  minor_nt_without_consent: boolean;
  expired_grants: boolean;
  grants_expiring_soon: boolean;
  consent_revoked_30d: boolean;
  active_memberships: number;
  severity: Severity;
  flag_count: number;
}

type FilterSeverity = "all" | Severity;

// ---------- copy ----------

const COPY = {
  IS: {
    title: "Regluvarsla — yfirlit",
    subtitle:
      "Sjálfvirk gæðaskoðun á eignarrétti gagna. Smelltu á leikmann til að laga.",
    loading: "Hleð gögnum…",
    errorPrefix: "Villa",
    refresh: "Endurhlaða",
    // KPI labels
    kpiPlayers: "Virkir leikmenn",
    kpiCritical: "Alvarleg flögg",
    kpiWarning: "Athugasemdir",
    kpiClean: "Í lagi",
    // Severity labels
    sevCritical: "Alvarlegt",
    sevWarning: "Athugasemd",
    sevInfo: "Upplýsing",
    sevOk: "Í lagi",
    // Filter
    filterAll: "Allt",
    filterCritical: "Alvarleg",
    filterWarning: "Athugasemdir",
    filterInfo: "Upplýsingar",
    filterOk: "Í lagi",
    // Flag labels
    flagMissingDob: "DOB vantar",
    flagMissingDobHelp: "Fæðingardagur ekki skráður — meðhöndlað sem ólögráða",
    flagMissingDp: "Vantar gagnavinnslusamþykki",
    flagMissingDpHelp: "Engin virk data_processing heimild",
    flagMinorNt: "Ólögráða á landsliðsskrá án foreldraheimildar",
    flagMinorNtHelp:
      "Virkur national_team membership en vantar national_team_sharing frá foreldri/forráðamanni",
    flagExpired: "Runnið út",
    flagExpiredHelp: "Eitt eða fleiri data grants eru runnin út",
    flagExpSoon: "Rennur út innan 14 daga",
    flagExpSoonHelp: "Grants sem ljúka innan tveggja vikna",
    flagRevoked30: "Afturkallað síðustu 30 daga",
    flagRevoked30Help: "Samþykki afturkallað nýlega — skoða söguleg gögn",
    // Table headers
    thPlayer: "Leikmaður",
    thTeam: "Lið",
    thSeverity: "Staða",
    thFlags: "Flögg",
    thAction: "Aðgerð",
    open: "Skoða",
    // Empty states
    emptyAll: "Engir leikmenn fundust",
    emptyFiltered: "Engin flögg í þessum flokki — allt í lagi",
    minorBadge: "Ólögráða",
  },
  EN: {
    title: "Compliance — overview",
    subtitle:
      "Automated data-ownership checks. Click a player to remediate.",
    loading: "Loading…",
    errorPrefix: "Error",
    refresh: "Refresh",
    kpiPlayers: "Active players",
    kpiCritical: "Critical flags",
    kpiWarning: "Warnings",
    kpiClean: "Clean",
    sevCritical: "Critical",
    sevWarning: "Warning",
    sevInfo: "Info",
    sevOk: "OK",
    filterAll: "All",
    filterCritical: "Critical",
    filterWarning: "Warnings",
    filterInfo: "Info",
    filterOk: "Clean",
    flagMissingDob: "DOB missing",
    flagMissingDobHelp: "No DOB on file — treated as minor (fail-safe)",
    flagMissingDp: "Missing data-processing consent",
    flagMissingDpHelp: "No active data_processing consent",
    flagMinorNt: "Minor on national-team roster without parental consent",
    flagMinorNtHelp:
      "Active national_team membership but no parent/guardian national_team_sharing consent",
    flagExpired: "Expired grants",
    flagExpiredHelp: "One or more data grants have expired",
    flagExpSoon: "Expiring in 14 days",
    flagExpSoonHelp: "Grants ending within two weeks",
    flagRevoked30: "Revoked in last 30 days",
    flagRevoked30Help: "Consent revoked recently — review historic data",
    thPlayer: "Player",
    thTeam: "Team",
    thSeverity: "Status",
    thFlags: "Flags",
    thAction: "Action",
    open: "Review",
    emptyAll: "No players found",
    emptyFiltered: "No flags in this bucket — all clear",
    minorBadge: "Minor",
  },
} as const;

// ---------- helpers ----------

function severityBadge(sev: Severity, lang: Lang) {
  const t = COPY[lang];
  switch (sev) {
    case "critical":
      return { label: t.sevCritical, className: "bg-red-100 text-red-700 border-red-200" };
    case "warning":
      return { label: t.sevWarning, className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "info":
      return { label: t.sevInfo, className: "bg-blue-100 text-blue-700 border-blue-200" };
    case "ok":
    default:
      return { label: t.sevOk, className: "bg-green-100 text-green-700 border-green-200" };
  }
}

function flagChips(row: ComplianceRow, lang: Lang) {
  const t = COPY[lang];
  const chips: Array<{ label: string; title: string; tone: "red" | "amber" | "blue" }> = [];
  if (row.minor_nt_without_consent)
    chips.push({ label: t.flagMinorNt, title: t.flagMinorNtHelp, tone: "red" });
  if (row.missing_data_processing)
    chips.push({ label: t.flagMissingDp, title: t.flagMissingDpHelp, tone: "red" });
  if (row.missing_dob)
    chips.push({ label: t.flagMissingDob, title: t.flagMissingDobHelp, tone: "amber" });
  if (row.expired_grants)
    chips.push({ label: t.flagExpired, title: t.flagExpiredHelp, tone: "amber" });
  if (row.consent_revoked_30d)
    chips.push({ label: t.flagRevoked30, title: t.flagRevoked30Help, tone: "amber" });
  if (row.grants_expiring_soon)
    chips.push({ label: t.flagExpSoon, title: t.flagExpSoonHelp, tone: "blue" });
  return chips;
}

// ---------- component ----------

export default function ComplianceDashboard({
  lang = "IS",
  onOpenPlayer,
}: {
  lang?: Lang;
  onOpenPlayer: (playerId: string, fullName: string) => void;
}) {
  const t = COPY[lang];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [filter, setFilter] = useState<FilterSeverity>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: e } = await supabase.rpc("admin_compliance_flags");
    if (e) {
      setError(`${t.errorPrefix}: ${e.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as ComplianceRow[]);
    }
    setLoading(false);
  }, [t.errorPrefix]);

  useEffect(() => {
    load();
  }, [load]);

  // KPI counters
  const kpi = useMemo(() => {
    const total = rows.length;
    let critical = 0;
    let warning = 0;
    let clean = 0;
    for (const r of rows) {
      if (r.severity === "critical") critical++;
      else if (r.severity === "warning") warning++;
      else if (r.severity === "ok") clean++;
    }
    return { total, critical, warning, clean };
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows.filter((r) => r.severity !== "ok");
    return rows.filter((r) => r.severity === filter);
  }, [rows, filter]);

  // ---------- render ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
        {t.loading}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          {t.refresh}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label={t.kpiPlayers} value={kpi.total} tone="zinc" />
        <KpiCard label={t.kpiCritical} value={kpi.critical} tone="red" />
        <KpiCard label={t.kpiWarning} value={kpi.warning} tone="amber" />
        <KpiCard label={t.kpiClean} value={kpi.clean} tone="green" />
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: t.filterAll },
            { key: "critical", label: t.filterCritical },
            { key: "warning", label: t.filterWarning },
            { key: "info", label: t.filterInfo },
            { key: "ok", label: t.filterOk },
          ] as Array<{ key: FilterSeverity; label: string }>
        ).map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                active
                  ? "rounded-full border px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              }
              style={active ? { background: "#005a2b", borderColor: "#005a2b" } : {}}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left">{t.thPlayer}</th>
              <th className="px-4 py-3 text-left">{t.thTeam}</th>
              <th className="px-4 py-3 text-left">{t.thSeverity}</th>
              <th className="px-4 py-3 text-left">{t.thFlags}</th>
              <th className="px-4 py-3 text-right">{t.thAction}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">
                  {filter === "all" && rows.length === 0 ? t.emptyAll : t.emptyFiltered}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const badge = severityBadge(r.severity, lang);
              const chips = flagChips(r, lang);
              return (
                <tr key={r.player_id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">{r.full_name}</span>
                      {r.is_minor && (
                        <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                          {t.minorBadge}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{r.team_name ?? "–"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {chips.length === 0 && (
                        <span className="text-xs text-zinc-400">–</span>
                      )}
                      {chips.map((c, i) => {
                        const tone =
                          c.tone === "red"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : c.tone === "amber"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200";
                        return (
                          <span
                            key={i}
                            title={c.title}
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${tone}`}
                          >
                            {c.label}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onOpenPlayer(r.player_id, r.full_name)}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      {t.open}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- KPI card ----------

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "zinc" | "red" | "amber" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "green"
          ? "border-green-200 bg-green-50"
          : "border-zinc-200 bg-white";
  const valueClass =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "green"
          ? "text-green-700"
          : "text-zinc-900";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
