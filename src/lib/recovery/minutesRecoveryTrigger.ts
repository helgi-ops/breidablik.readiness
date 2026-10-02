import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAssignment } from "./loader";
import { recommendMinutesRecovery, MD_PLUS_1_SLUG, MD_PLUS_3_SLUG } from "./minutesRecovery";

/**
 * Minutes-driven recovery auto-trigger (MD+1 + MD+3).
 *
 * Complements the Catapult-load trigger (`runRecoveryAutoTrigger`): that one needs a
 * GPS baseline (≥8 daily rows) and only fires MD+1. This one reads `match_player_minutes`
 * — so it works for GPS-less teams and also schedules the MD+3 reload-readiness primer —
 * and assigns the protocol `recommendMinutesRecovery` picks (high/moderate MD+1 → MD+1
 * bundle; full-match MD+3 → MD+3 readiness). Low-minutes/DNP MD+1 is a REBUILD day, so no
 * recovery protocol is assigned (the strength engine handles that via md1Tier).
 *
 * Idempotent (ensureAssignment dedupes on protocol+player+day), so it is safe to run
 * alongside the load trigger and on an hourly cron. Descriptive — never the readiness colour.
 */

export type MinutesTriggerResult = {
  matchesMd1: number;
  matchesMd3: number;
  playersConsidered: number;
  assignmentsCreated: number;
  errors: string[];
};

function sexFromGender(g: string | null | undefined): "male" | "female" | "unknown" {
  const v = String(g ?? "").trim().toUpperCase();
  if (v === "M" || v === "MALE") return "male";
  if (v === "F" || v === "FEMALE") return "female";
  return "unknown";
}

const isoAddDays = (iso: string, d: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

export async function runMinutesRecoveryTrigger(
  sb: SupabaseClient,
  args: { todayIso?: string } = {},
): Promise<MinutesTriggerResult> {
  const todayIso = args.todayIso ?? new Date().toISOString().slice(0, 10);
  const result: MinutesTriggerResult = {
    matchesMd1: 0, matchesMd3: 0, playersConsidered: 0, assignmentsCreated: 0, errors: [],
  };

  // Protocol ids for the two slugs this trigger can assign.
  const { data: protos, error: protoErr } = await sb
    .from("recovery_protocols").select("id, slug")
    .in("slug", [MD_PLUS_1_SLUG, MD_PLUS_3_SLUG]).eq("active", true);
  if (protoErr) { result.errors.push(`Protocol lookup failed: ${protoErr.message}`); return result; }
  const idBySlug = new Map((protos ?? []).map((p) => [p.slug as string, p.id as string]));

  // Matches that put a team at MD+1 (yesterday) or MD+3 (3 days ago) today.
  const md1Date = isoAddDays(todayIso, -1);
  const md3Date = isoAddDays(todayIso, -3);
  const { data: matches, error: matchErr } = await sb
    .from("match_schedule").select("team_id, match_date")
    .in("match_date", [md1Date, md3Date]);
  if (matchErr) { result.errors.push(`Match scan failed: ${matchErr.message}`); return result; }
  if (!matches || matches.length === 0) return result;

  // Due times today (morning of MD+1 / MD+3).
  const md1Due = new Date(`${todayIso}T00:00:00Z`); md1Due.setUTCHours(8, 0, 0, 0);
  const md3Due = new Date(`${todayIso}T00:00:00Z`); md3Due.setUTCHours(9, 0, 0, 0);

  // Team gender → sex (cached per team).
  const teamIds = [...new Set(matches.map((m) => m.team_id as string).filter(Boolean))];
  const sexByTeam = new Map<string, "male" | "female" | "unknown">();
  if (teamIds.length) {
    const { data: teams } = await sb.from("teams").select("id, gender").in("id", teamIds);
    for (const t of (teams ?? []) as Array<{ id: string; gender: string | null }>) {
      sexByTeam.set(t.id, sexFromGender(t.gender));
    }
  }

  for (const m of matches as Array<{ team_id: string; match_date: string }>) {
    const mdContext = m.match_date === md1Date ? "MD+1" : "MD+3";
    if (mdContext === "MD+1") result.matchesMd1 += 1; else result.matchesMd3 += 1;
    const sex = sexByTeam.get(m.team_id) ?? "unknown";
    const dueAt = (mdContext === "MD+1" ? md1Due : md3Due).toISOString();

    const { data: mins, error: minErr } = await sb
      .from("match_player_minutes")
      .select("player_id, minutes_played, is_dnp")
      .eq("team_id", m.team_id).eq("match_date", m.match_date);
    if (minErr) { result.errors.push(`Minutes read failed (${m.team_id} ${m.match_date}): ${minErr.message}`); continue; }
    if (!mins || mins.length === 0) continue;

    // Optional GPS/IMA dose: this match's Player Load vs the player's own 28-day mean. Lets a high
    // mechanical dose escalate a partial-minutes player (handled in recommendMinutesRecovery). GPS-less
    // teams have no rows → dose stays null → minutes-only, unchanged.
    const doseByPlayer = new Map<string, "high" | "mid" | "low">();
    {
      const since = isoAddDays(m.match_date, -27);
      const { data: plRows } = await sb
        .from("player_external_load_daily")
        .select("player_id, total_player_load, date")
        .eq("team_id", m.team_id).eq("source", "catapult")
        .gte("date", since).lte("date", m.match_date);
      const matchPl = new Map<string, number>();
      const hist = new Map<string, { sum: number; count: number }>();
      for (const r of (plRows ?? []) as Array<{ player_id: string; total_player_load: number | null; date: string }>) {
        const pl = Number(r.total_player_load ?? 0);
        if (!Number.isFinite(pl) || pl <= 0) continue;
        if (r.date === m.match_date) matchPl.set(r.player_id, pl);
        else { const a = hist.get(r.player_id) ?? { sum: 0, count: 0 }; a.sum += pl; a.count += 1; hist.set(r.player_id, a); }
      }
      for (const [pid, pl] of matchPl) {
        const h = hist.get(pid);
        if (!h || h.count < 5) continue; // need a baseline to call it high/low
        const mean = h.sum / h.count;
        doseByPlayer.set(pid, pl >= mean * 1.15 ? "high" : pl <= mean * 0.85 ? "low" : "mid");
      }
    }

    // Optional CMJ (objective jump) for THIS MD day vs the player's pre-match baseline. When logged it
    // OVERRIDES the minutes/load proxy inside recommendMinutesRecovery. Absent → proxy only (unchanged).
    const minuteIds = mins.map((r) => r.player_id as string);
    const cmjPctByPlayer = new Map<string, number>();
    {
      const baseStart = isoAddDays(m.match_date, -42);
      const mdDate = isoAddDays(m.match_date, mdContext === "MD+1" ? 1 : 3);
      const { data: fd } = await sb
        .from("vald_forcedecks_results")
        .select("microplayer_id, test_timestamp, jump_height_cm, is_valid")
        .eq("team_id", m.team_id).eq("test_type", "CMJ").in("microplayer_id", minuteIds)
        .gte("test_timestamp", `${baseStart}T00:00:00Z`).lte("test_timestamp", `${mdDate}T23:59:59Z`).limit(4000);
      const byP = new Map<string, { base: number[]; day: number[] }>();
      for (const r of (fd ?? []) as Array<{ microplayer_id: string; test_timestamp: string; jump_height_cm: number | null; is_valid: boolean | null }>) {
        if (r.is_valid === false || r.jump_height_cm == null) continue;
        const d = String(r.test_timestamp).slice(0, 10); const id = String(r.microplayer_id);
        const acc = byP.get(id) ?? { base: [], day: [] };
        if (d < m.match_date) acc.base.push(Number(r.jump_height_cm));
        else if (d === mdDate) acc.day.push(Number(r.jump_height_cm));
        byP.set(id, acc);
      }
      const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
      for (const [id, v] of byP) {
        const b = v.base.length >= 3 ? median(v.base) : null;
        const day = median(v.day);
        if (b != null && b > 0 && day != null) cmjPctByPlayer.set(id, Math.round(((day - b) / b) * 1000) / 10);
      }
    }

    // Only prescribe to active players.
    const playerIds = mins.map((r) => r.player_id as string);
    const { data: activeRows } = await sb
      .from("players").select("id").eq("is_active", true).in("id", playerIds);
    const activeSet = new Set((activeRows ?? []).map((p) => p.id as string));

    for (const r of mins as Array<{ player_id: string; minutes_played: number | null; is_dnp: boolean | null }>) {
      if (!activeSet.has(r.player_id)) continue;
      result.playersConsidered += 1;
      const plan = recommendMinutesRecovery({
        mdContext, minutes: r.minutes_played, isDnp: r.is_dnp ?? false, sex,
        mechanicalDose: doseByPlayer.get(r.player_id) ?? null,
        cmjJhPct: cmjPctByPlayer.get(r.player_id) ?? null,
      });
      if (!plan || !plan.protocolSlug) continue; // rebuild / cleared → no protocol
      const protocolId = idBySlug.get(plan.protocolSlug);
      if (!protocolId) { result.errors.push(`Missing protocol ${plan.protocolSlug}`); continue; }

      const res = await ensureAssignment(sb, {
        protocolId,
        playerId: r.player_id,
        teamId: m.team_id,
        dueAt,
        triggerReason: mdContext === "MD+1" ? "auto_minutes_md1" : "auto_minutes_md3",
        triggerMetadata: {
          minutes: r.minutes_played, is_dnp: r.is_dnp ?? false,
          tier: plan.tier, action: plan.action, md_context: mdContext,
          driver: plan.driver, mechanical_dose: doseByPlayer.get(r.player_id) ?? null,
          cmj_jh_pct: cmjPctByPlayer.get(r.player_id) ?? null,
        },
      });
      if (res.created) result.assignmentsCreated += 1;
    }
  }

  return result;
}
