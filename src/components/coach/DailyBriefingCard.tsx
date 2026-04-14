"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DailyBriefingCard
// ─────────────────────────────────────────────────────────────────────────────
//
// Closes the Communicate step of Gabbett's (2020) monitoring cycle
// (Collect → Analyse → Communicate → Decide). MicroPulse already collects and
// analyses — this card is the one auto-generated morning view the coach opens
// first, bringing together readiness + planned session + ACWR + flagged
// players so they don't have to click across three screens to assemble the
// picture themselves.
//
// Placement: top of Today tab, ABOVE the Command Center. Minimal prop
// surface — everything it needs is already computed by the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// ── Types (loose — we only read fields we care about) ──────────────────────

type FinalColor = "red" | "yellow" | "green";

type BriefingRow = {
  player_id: string;
  full_name: string;
  entry_date?: string | null;
  final_color?: FinalColor | null;
  total_score?: number | null;
  _yesterday_z?: number | null;
  _z_today?: number | null;
  planned_day_type?: string | null;
  planned_focus?: string | null;
  md_day?: string | null;
  _needs_review?: boolean;
  _neural_bias_applied?: boolean;
  _adaptation?: {
    protectTissue?: "ACHILLES" | "HAMSTRING" | "PATELLAR" | null;
    recoveryBias?: boolean;
    swapBallistic?: boolean;
  } | null;
};

type PlayerCompositeEntry = {
  compositeScore: number;
  concernLevel: "none" | "low" | "moderate" | "high";
  fatigueType: string | null;
  playerLoadSpike: number | null;
  loadRatio: number | null;
};

type ComplianceCounts = { submitted: number; imputed: number; missing: number };

type ComplianceSummary = {
  checkin: ComplianceCounts;
  rpe: ComplianceCounts;
};

type TeamSignalLike = {
  n_players?: number | null;
  n_full?: number | null;
  n_reduced?: number | null;
  n_recovery?: number | null;
} | null;

export type DailyBriefingCardProps = {
  today: string; // ISO yyyy-mm-dd
  lang: "IS" | "EN";
  rows: BriefingRow[];
  playerComposites: Record<string, PlayerCompositeEntry>;
  complianceSummary?: ComplianceSummary | null;
  mdDayToday?: string | number | null;
  teamSignal?: TeamSignalLike;
  dayStateLabel?: string | null; // e.g. "Medium training"
};

// ── Copy (IS / EN) ─────────────────────────────────────────────────────────

const COPY = {
  IS: {
    title: "Daily briefing",
    subtitle: "Auto-unnin morgunskýrsla — það sem þú þarft að vita í dag",
    headlineWatch: (n: number) =>
      n === 0 ? "Enginn þarf sérstaka athygli í dag" : n === 1 ? "Fylgstu með 1 leikmanni" : `Fylgstu með ${n} leikmönnum`,
    tileReadiness: "Readiness",
    tilePlanned: "Planned",
    tileLoad: "Load",
    tileAttention: "Attention",
    readinessFull: "tilbúnir",
    readinessReduced: "dregið úr",
    readinessRecovery: "hvíld",
    spikeLabel: "hækkað PL",
    loadMonitor: "monitor",
    loadNormal: "í lagi",
    attentionAlert: "alert",
    attentionMonitor: "monitor",
    attentionNone: "allt í lagi",
    topAttention: "Top attention today",
    compliance: "Compliance",
    checkin: "Check-in",
    rpe: "RPE",
    noPlanned: "Engin áætlun skráð",
    mdBadge: (md: string) => md,
    noRows: "Engin readiness gögn í dag ennþá.",
    teamPulse: "Team pulse",
    avgReadiness: "Meðal readiness",
    fatigueMix: "Þreytumunstur",
    mech: "vélrænt",
    metab: "efnaskipti",
    global: "heild",
    noFatigue: "engin þreyta skráð",
    trendUp: "↑ batnar vs í gær",
    trendDown: "↓ versnar vs í gær",
    trendFlat: "= stöðugt vs í gær",
    chipScore: "Skor",
    chipComp: "Comp",
    chipPl: "PL",
    reasons: {
      redReadiness: "RAUTT readiness",
      yellowReadiness: "GULT readiness",
      lowScore: (n: number) => `skor ${n}/25`,
      compositeHigh: "há composite load",
      compositeMod: "hækkuð composite",
      needsReview: "needs review",
      neuralBias: "neural bias",
      plSpike: (ratio: number) => `PL ${ratio.toFixed(2)}×`,
      protectTissue: (t: string) => `vernda ${t.toLowerCase()}`,
      recoveryBias: "recovery bias",
      mechFatigue: "vélrænt álag",
      metabFatigue: "efnaskiptaálag",
      globalFatigue: "heildarþreyta",
    },
  },
  EN: {
    title: "Daily briefing",
    subtitle: "Auto-generated morning view — what you need to know today",
    headlineWatch: (n: number) =>
      n === 0 ? "No players need special attention today" : n === 1 ? "Watch 1 player" : `Watch ${n} players`,
    tileReadiness: "Readiness",
    tilePlanned: "Planned",
    tileLoad: "Load",
    tileAttention: "Attention",
    readinessFull: "full",
    readinessReduced: "reduced",
    readinessRecovery: "recovery",
    spikeLabel: "PL spike",
    loadMonitor: "monitor",
    loadNormal: "normal",
    attentionAlert: "alert",
    attentionMonitor: "monitor",
    attentionNone: "all clear",
    topAttention: "Top attention today",
    compliance: "Compliance",
    checkin: "Check-in",
    rpe: "RPE",
    noPlanned: "No plan on file",
    mdBadge: (md: string) => md,
    noRows: "No readiness data yet today.",
    teamPulse: "Team pulse",
    avgReadiness: "Avg readiness",
    fatigueMix: "Fatigue mix",
    mech: "mech",
    metab: "metab",
    global: "global",
    noFatigue: "no fatigue flagged",
    trendUp: "↑ improving vs yesterday",
    trendDown: "↓ declining vs yesterday",
    trendFlat: "= stable vs yesterday",
    chipScore: "Score",
    chipComp: "Comp",
    chipPl: "PL",
    reasons: {
      redReadiness: "RED readiness",
      yellowReadiness: "YELLOW readiness",
      lowScore: (n: number) => `score ${n}/25`,
      compositeHigh: "high composite load",
      compositeMod: "elevated composite",
      needsReview: "needs review",
      neuralBias: "neural bias",
      plSpike: (ratio: number) => `PL ${ratio.toFixed(2)}×`,
      protectTissue: (t: string) => `protect ${t.toLowerCase()}`,
      recoveryBias: "recovery bias",
      mechFatigue: "mechanical fatigue",
      metabFatigue: "metabolic fatigue",
      globalFatigue: "global fatigue",
    },
  },
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateHeader(iso: string, lang: "IS" | "EN"): string {
  const d = new Date(iso + "T00:00:00");
  const locale = lang === "IS" ? "is-IS" : "en-GB";
  return d.toLocaleDateString(locale, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatFocus(row: BriefingRow | undefined, lang: "IS" | "EN"): string {
  if (!row) return COPY[lang].noPlanned;
  // Prefer explicit focus ("FORCE", "NEURAL / VELOCITY", ...) → fall back
  // to planned_day_type ("TRAIN", "RECOVERY", "GAME", "OFF").
  const focus = (row.planned_focus ?? "").trim();
  if (focus) return focus;
  const dayType = (row.planned_day_type ?? "").trim();
  return dayType || COPY[lang].noPlanned;
}

type AttentionLevel = "alert" | "monitor" | "ok";

type AttentionItem = {
  playerId: string;
  name: string;
  level: AttentionLevel;
  reasons: string[];
  // Numeric context for inline chips on the attention row — lets the coach
  // read the "why" without opening the player modal.
  score: number | null;
  composite: number | null;
  plSpike: number | null;
  fatigueType: string | null;
};

function buildAttentionList(
  rows: BriefingRow[],
  playerComposites: Record<string, PlayerCompositeEntry>,
  lang: "IS" | "EN",
): AttentionItem[] {
  const r = COPY[lang].reasons;
  const out: AttentionItem[] = [];

  for (const row of rows) {
    const reasons: string[] = [];
    let level: AttentionLevel = "ok";

    const col = row.final_color ?? null;
    if (col === "red") {
      reasons.push(r.redReadiness);
      level = "alert";
    } else if (col === "yellow") {
      reasons.push(r.yellowReadiness);
      if (level === "ok") level = "monitor";
    } else if ((row.total_score ?? 99) <= 12) {
      reasons.push(r.lowScore(row.total_score ?? 0));
      if (level === "ok") level = "monitor";
    }

    const comp = playerComposites[String(row.player_id)];
    if (comp) {
      if (comp.concernLevel === "high") {
        reasons.push(r.compositeHigh);
        level = "alert";
      } else if (comp.concernLevel === "moderate") {
        reasons.push(r.compositeMod);
        if (level === "ok") level = "monitor";
      }
      if (comp.playerLoadSpike != null && comp.playerLoadSpike >= 1.6) {
        reasons.push(r.plSpike(comp.playerLoadSpike));
        level = "alert";
      } else if (comp.playerLoadSpike != null && comp.playerLoadSpike >= 1.15 && level === "ok") {
        reasons.push(r.plSpike(comp.playerLoadSpike));
        level = "monitor";
      }
      const ft = comp.fatigueType ?? null;
      if (ft === "global_fatigue") reasons.push(r.globalFatigue);
      else if (ft === "mechanical_fatigue") reasons.push(r.mechFatigue);
      else if (ft === "metabolic_fatigue") reasons.push(r.metabFatigue);
    }

    if (row._neural_bias_applied) {
      reasons.push(r.neuralBias);
      if (level === "ok") level = "monitor";
    }

    const prot = row._adaptation?.protectTissue ?? null;
    if (prot) {
      reasons.push(r.protectTissue(prot));
      if (level === "ok") level = "monitor";
    }
    if (row._adaptation?.recoveryBias) {
      reasons.push(r.recoveryBias);
      if (level === "ok") level = "monitor";
    }

    if (row._needs_review) {
      reasons.push(r.needsReview);
      if (level === "ok") level = "monitor";
    }

    if (level !== "ok" && reasons.length > 0) {
      // Dedupe reasons preserving order
      const seen = new Set<string>();
      const unique = reasons.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
      out.push({
        playerId: String(row.player_id),
        name: row.full_name,
        level,
        reasons: unique,
        score: row.total_score ?? null,
        composite: comp?.compositeScore ?? null,
        plSpike: comp?.playerLoadSpike ?? null,
        fatigueType: comp?.fatigueType ?? null,
      });
    }
  }

  // Sort: alert before monitor, then by reason count desc
  out.sort((a, b) => {
    if (a.level !== b.level) return a.level === "alert" ? -1 : 1;
    return b.reasons.length - a.reasons.length;
  });

  return out;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DailyBriefingCard(props: DailyBriefingCardProps) {
  const {
    today,
    lang,
    rows,
    playerComposites,
    complianceSummary = null,
    mdDayToday = null,
    teamSignal = null,
    dayStateLabel = null,
  } = props;

  const t = COPY[lang];

  const attention = useMemo(
    () => buildAttentionList(rows, playerComposites, lang),
    [rows, playerComposites, lang],
  );

  const alertCount = attention.filter((x) => x.level === "alert").length;
  const monitorCount = attention.filter((x) => x.level === "monitor").length;
  const watchCount = alertCount + monitorCount;

  const plannedRow = rows[0]; // all rows on same day share planned_*
  const focusLabel = formatFocus(plannedRow, lang);

  // Count high-load signals across team
  const spikeCount = useMemo(
    () =>
      Object.values(playerComposites).filter(
        (c) => c.playerLoadSpike != null && c.playerLoadSpike >= 1.15,
      ).length,
    [playerComposites],
  );

  // ── Team pulse — single-glance aggregate across the squad ─────────────
  // Answers three morning-briefing questions:
  //   1) How does the team feel on average?  (avg total_score / 25)
  //   2) Is that better or worse than yesterday?  (z-delta from _z_today vs _yesterday_z)
  //   3) What kind of fatigue dominates?  (counts by fatigueType)
  const teamPulse = useMemo(() => {
    const scores = rows
      .map((r) => (typeof r.total_score === "number" ? r.total_score : null))
      .filter((x): x is number => x != null);
    const avgScore = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

    // Trend vs yesterday — compare daily z-scores if the dashboard
    // has hydrated them onto the row (DevCoachDashboardClient sets both).
    const deltas = rows
      .map((r) => {
        const zy = typeof r._yesterday_z === "number" ? r._yesterday_z : null;
        const zt = typeof r._z_today === "number" ? r._z_today : null;
        return zy != null && zt != null ? zt - zy : null;
      })
      .filter((x): x is number => x != null);
    const meanDelta = deltas.length
      ? deltas.reduce((a, b) => a + b, 0) / deltas.length
      : null;
    const trend: "up" | "down" | "flat" | null =
      meanDelta == null ? null
        : meanDelta > 0.1 ? "up"
        : meanDelta < -0.1 ? "down"
        : "flat";

    // Fatigue breakdown from playerComposites
    let mech = 0, metab = 0, global = 0;
    for (const c of Object.values(playerComposites)) {
      if (c.fatigueType === "mechanical_fatigue") mech++;
      else if (c.fatigueType === "metabolic_fatigue") metab++;
      else if (c.fatigueType === "global_fatigue") global++;
    }
    const fatigueTotal = mech + metab + global;

    return { avgScore, trend, mech, metab, global, fatigueTotal };
  }, [rows, playerComposites]);

  const nFull = Number(teamSignal?.n_full ?? 0);
  const nReduced = Number(teamSignal?.n_reduced ?? 0);
  const nRecovery = Number(teamSignal?.n_recovery ?? 0);
  const nPlayers = Number(teamSignal?.n_players ?? rows.length);

  const dateHeader = formatDateHeader(today, lang);

  // ── Badge de-duplication ──────────────────────────────────────────────
  // On a training day the three badges carry distinct info:
  //   MD-badge ("MD-3") · day state ("Medium training") · focus ("FORCE")
  // On OFF/OTHER days they collapse to the same word, which creates visual
  // noise (see screenshot 14.04: OTHER · OFF DAY · OFF). We therefore:
  //   - hide MD-badge when it's "OTHER" / "UNKNOWN" / empty
  //   - hide dayStateLabel when it's the same word as focus (case-insensitive)
  //     or when focus already signals OFF/RECOVERY (those are self-explanatory)
  const mdRaw = mdDayToday ? String(mdDayToday).trim() : "";
  const isUninformativeMd = !mdRaw || /^(other|unknown|—|-)$/i.test(mdRaw);
  const mdLabel = isUninformativeMd ? null : mdRaw;

  const focusNormalized = focusLabel.trim().toLowerCase();
  const dayStateNormalized = (dayStateLabel ?? "").trim().toLowerCase();
  const focusImpliesRest = /^(off|off day|recovery|hvíld)/i.test(focusLabel.trim());
  const dayStateRedundant =
    !dayStateNormalized ||
    dayStateNormalized === focusNormalized ||
    dayStateNormalized.includes(focusNormalized) ||
    focusNormalized.includes(dayStateNormalized) ||
    focusImpliesRest;
  const displayDayStateLabel = dayStateRedundant ? null : dayStateLabel;

  // ── Render ────────────────────────────────────────────────────────────
  if (!rows.length) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="py-4 text-sm text-slate-500">{t.noRows}</CardContent>
      </Card>
    );
  }

  const headlineTone =
    alertCount > 0
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : monitorCount > 0
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold">
              {t.title}
            </div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900 capitalize">
              {dateHeader}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{t.subtitle}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mdLabel ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {mdLabel}
              </span>
            ) : null}
            {displayDayStateLabel ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {displayDayStateLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              {focusLabel}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline */}
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${headlineTone}`}>
          {t.headlineWatch(watchCount)}
          {alertCount > 0 ? (
            <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-rose-700">
              {alertCount} {t.attentionAlert}
            </span>
          ) : null}
          {monitorCount > 0 ? (
            <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              {monitorCount} {t.attentionMonitor}
            </span>
          ) : null}
        </div>

        {/* 4 quick-glance tiles */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tileReadiness}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums text-emerald-700">{nFull}</span>
              <span className="text-xs text-slate-500">/ {nPlayers} {t.readinessFull}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <span className="text-amber-700">{nReduced} {t.readinessReduced}</span>
              <span className="text-slate-300">·</span>
              <span className="text-rose-700">{nRecovery} {t.readinessRecovery}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tilePlanned}
            </div>
            <div className="mt-1 truncate text-base font-semibold text-slate-900" title={focusLabel}>
              {focusLabel}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {(() => {
                const parts: string[] = [];
                if (mdLabel) parts.push(mdLabel);
                const dayType = plannedRow?.planned_day_type?.trim();
                // Skip redundant dayType — e.g. focus "OFF" with day_type "OFF"
                if (dayType && dayType.toLowerCase() !== focusNormalized) parts.push(dayType);
                return parts.join(" · ");
              })()}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tileLoad}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  spikeCount >= 3
                    ? "text-rose-700"
                    : spikeCount > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {spikeCount}
              </span>
              <span className="text-xs text-slate-500">{t.spikeLabel}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {spikeCount > 0 ? t.loadMonitor : t.loadNormal}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tileAttention}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  alertCount > 0
                    ? "text-rose-700"
                    : monitorCount > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {watchCount}
              </span>
              <span className="text-xs text-slate-500">
                {watchCount === 0 ? t.attentionNone : ""}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              {alertCount > 0 ? (
                <span className="text-rose-700">{alertCount} {t.attentionAlert}</span>
              ) : null}
              {alertCount > 0 && monitorCount > 0 ? <span className="text-slate-300">·</span> : null}
              {monitorCount > 0 ? (
                <span className="text-amber-700">{monitorCount} {t.attentionMonitor}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Team pulse — aggregated signals across the squad */}
        <div className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.teamPulse}
            </span>
            {teamPulse.trend ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  teamPulse.trend === "up"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : teamPulse.trend === "down"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {teamPulse.trend === "up"
                  ? t.trendUp
                  : teamPulse.trend === "down"
                  ? t.trendDown
                  : t.trendFlat}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700">
            {teamPulse.avgScore != null ? (
              <span>
                <span className="text-slate-500">{t.avgReadiness}: </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {teamPulse.avgScore.toFixed(1)}
                </span>
                <span className="text-slate-400"> / 25</span>
              </span>
            ) : null}
            <span>
              <span className="text-slate-500">{t.fatigueMix}: </span>
              {teamPulse.fatigueTotal === 0 ? (
                <span className="text-emerald-700">{t.noFatigue}</span>
              ) : (
                <span className="space-x-2">
                  {teamPulse.mech > 0 ? (
                    <span className="font-medium text-amber-700">
                      {teamPulse.mech} {t.mech}
                    </span>
                  ) : null}
                  {teamPulse.metab > 0 ? (
                    <span className="font-medium text-orange-700">
                      {teamPulse.metab} {t.metab}
                    </span>
                  ) : null}
                  {teamPulse.global > 0 ? (
                    <span className="font-medium text-rose-700">
                      {teamPulse.global} {t.global}
                    </span>
                  ) : null}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Top attention list — enriched with numeric chips so the coach
            sees the actual numbers (score, composite, PL spike) inline. */}
        {attention.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.topAttention}
            </div>
            <ul className="space-y-1.5">
              {attention.slice(0, 5).map((item) => {
                const tone =
                  item.level === "alert"
                    ? "border-rose-200 bg-rose-50"
                    : "border-amber-200 bg-amber-50";
                const dot =
                  item.level === "alert" ? "bg-rose-500" : "bg-amber-500";

                // Chip tone logic mirrors the rest of the dashboard's
                // thresholds so coaches see consistent colouring across screens.
                const scoreChipCls =
                  item.score == null
                    ? null
                    : item.score <= 12
                    ? "border-rose-300 bg-white text-rose-700"
                    : item.score <= 17
                    ? "border-amber-300 bg-white text-amber-700"
                    : "border-slate-200 bg-white text-slate-700";
                const compChipCls =
                  item.composite == null
                    ? null
                    : item.composite >= 0.68
                    ? "border-rose-300 bg-white text-rose-700"
                    : item.composite >= 0.40
                    ? "border-orange-300 bg-white text-orange-700"
                    : item.composite >= 0.15
                    ? "border-slate-200 bg-white text-slate-700"
                    : null; // hide when none/very low — not informative
                const plChipCls =
                  item.plSpike == null || item.plSpike < 1.15
                    ? null
                    : item.plSpike >= 1.6
                    ? "border-rose-300 bg-white text-rose-700"
                    : "border-amber-300 bg-white text-amber-700";
                const fatigueChipLabel =
                  item.fatigueType === "mechanical_fatigue"
                    ? t.reasons.mechFatigue
                    : item.fatigueType === "metabolic_fatigue"
                    ? t.reasons.metabFatigue
                    : item.fatigueType === "global_fatigue"
                    ? t.reasons.globalFatigue
                    : null;

                return (
                  <li
                    key={item.playerId}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${tone}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-900">
                          {item.name}
                        </span>
                        {scoreChipCls ? (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${scoreChipCls}`}>
                            {t.chipScore} {item.score}/25
                          </span>
                        ) : null}
                        {compChipCls && item.composite != null ? (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${compChipCls}`}>
                            {t.chipComp} {item.composite.toFixed(2)}
                          </span>
                        ) : null}
                        {plChipCls && item.plSpike != null ? (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${plChipCls}`}>
                            {t.chipPl} {item.plSpike.toFixed(2)}×
                          </span>
                        ) : null}
                        {fatigueChipLabel ? (
                          <span className="rounded-full border border-indigo-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                            {fatigueChipLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        {item.reasons.join(" · ")}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {attention.length > 5 ? (
              <div className="mt-1.5 text-[11px] text-slate-400">
                +{attention.length - 5} more
              </div>
            ) : null}
          </div>
        )}

        {/* Compliance strip */}
        {complianceSummary && (() => {
          const ci = complianceSummary.checkin;
          const rp = complianceSummary.rpe;
          const ciSubmitted = ci.submitted;
          const ciTotal = ci.submitted + ci.imputed + ci.missing;
          const rpSubmitted = rp.submitted;
          const rpTotal = rp.submitted + rp.imputed + rp.missing;
          const hasMissing = ci.missing > 0 || rp.missing > 0;
          return (
            <div
              className={`rounded-xl border px-4 py-2.5 text-xs ${
                hasMissing
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <span className="font-semibold">{t.compliance}:</span>{" "}
              <span>
                {t.checkin} {ciSubmitted}/{ciTotal}
              </span>
              <span className="mx-2 text-slate-300">·</span>
              <span>
                {t.rpe} {rpSubmitted}/{rpTotal}
              </span>
              {ci.missing > 0 ? (
                <span className="ml-2 text-amber-700">✗ {ci.missing} {t.checkin.toLowerCase()}</span>
              ) : null}
              {rp.missing > 0 ? (
                <span className="ml-2 text-amber-700">✗ {rp.missing} {t.rpe.toLowerCase()}</span>
              ) : null}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
