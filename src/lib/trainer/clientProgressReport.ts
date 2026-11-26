import "server-only";

/**
 * One progress snapshot for a PT client — adherence, readiness trend, strength PRs,
 * volume and internal load — for the client progress report PDF (PtClientReportPdf).
 * Used by the on-demand 4-week report and by the monthly report cron, so both read
 * the same engines as the client/trainer cards (one source, one truth).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computePersonalRecords } from "@/lib/client/personalRecords";
import { computeVolumeLoad } from "@/lib/client/volumeLoad";
import { computeTrainingLoad } from "@/lib/client/trainingLoad";
import type { PtClientReport } from "@/components/trainer/PtClientReportPdf";

export async function buildClientProgressReport(
  sb: SupabaseClient,
  clientId: string,
  period: { start: string; end: string; weeks: number },
): Promise<PtClientReport> {
  const { start, end } = period;

  const { data: player } = await sb.from("players").select("full_name").eq("id", clientId).maybeSingle();
  const clientName = ((player as { full_name?: string | null } | null)?.full_name ?? "—").trim();

  // ── Adherence (individual_training_log over the period) ──
  const { data: logs } = await sb
    .from("individual_training_log")
    .select("completed, skipped, log_date")
    .eq("player_id", clientId)
    .gte("log_date", start)
    .lte("log_date", end);
  const logRows = (logs ?? []) as Array<{ completed: boolean | null; skipped: boolean | null }>;
  const completed = logRows.filter((r) => r.completed).length;
  const skipped = logRows.filter((r) => r.skipped).length;
  const totalLogged = completed + skipped;
  const adherence = { completed, skipped, total: totalLogged, pct: totalLogged > 0 ? Math.round((completed / totalLogged) * 100) : null };

  // ── Readiness trend (readiness_entries over the period, canonical colour) ──
  const { data: rd } = await sb
    .from("readiness_entries")
    .select("entry_date, total_score, color")
    .eq("player_id", clientId)
    .gte("entry_date", start)
    .lte("entry_date", end)
    .order("entry_date", { ascending: true });
  const rdRows = (rd ?? []) as Array<{ entry_date: string; total_score: number | null; color: string | null }>;
  const scores = rdRows.map((r) => r.total_score).filter((s): s is number => typeof s === "number");
  const col = (c: string | null) => String(c ?? "").toUpperCase();
  const readiness = {
    checkIns: rdRows.length,
    avgScore: scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null,
    green: rdRows.filter((r) => col(r.color) === "GREEN").length,
    yellow: rdRows.filter((r) => col(r.color) === "YELLOW").length,
    red: rdRows.filter((r) => col(r.color) === "RED").length,
    series: rdRows.map((r) => ({ date: r.entry_date, score: r.total_score, color: col(r.color) })),
  };

  // ── Strength PRs, volume and internal load (existing engines) ──
  const [prs, volume, training] = await Promise.all([
    computePersonalRecords(sb, clientId),
    computeVolumeLoad(sb, clientId),
    computeTrainingLoad(sb, clientId),
  ]);

  return {
    client: { id: clientId, name: clientName },
    period,
    adherence,
    readiness,
    strength: prs as PtClientReport["strength"],
    volume: volume as PtClientReport["volume"],
    training: training as PtClientReport["training"],
    generatedAt: new Date().toISOString(),
  };
}
