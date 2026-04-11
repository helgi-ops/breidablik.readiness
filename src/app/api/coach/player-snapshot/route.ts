/**
 * Coach endpoint — full daily snapshot for one player on a specific date.
 *
 * Usage:
 *   GET /api/coach/player-snapshot?playerId=<uuid>&date=YYYY-MM-DD
 *
 * Returns every relevant load, wellness, RPE, ACWR, MLI, Whoop, VBT, context row
 * we have for that player on that day. Used by the coach "Player lookup" card
 * to investigate historical days (e.g. to confirm whether a player was flagged
 * as high injury risk on the day they picked up a knock).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { getSessionLoadBand } from "@/lib/session-rpe/formatters";

export const runtime = "nodejs";

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  user_id: string | null;
  position: string | null;
};

function toMessage(e: unknown) {
  return e instanceof Error ? e.message : "Unknown error";
}

function validDateKey(input: string | null | undefined): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function acwrBand(acwr: number | null | undefined): "OPTIMAL" | "CAUTION" | "RISK" | null {
  if (acwr == null || !Number.isFinite(Number(acwr))) return null;
  const v = Number(acwr);
  if (v >= 1.5) return "RISK";
  if (v >= 1.3 || v < 0.8) return "CAUTION";
  return "OPTIMAL";
}

/**
 * readiness_entries.total_score is stored as a raw SUM of 5 subscores,
 * each 1–5 → range 5–25. Display scale is 0–100 = ((raw - 5) / 20) * 100.
 * Thresholds (matching PlayerClient.tsx neural fatigue logic):
 *   raw ≤ 10 (≤25/100) → RED (very low readiness)
 *   raw ≤ 14 (≤45/100) → AMBER
 *   raw  > 14 (>45/100) → GREEN
 */
function normaliseReadiness(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const r = Number(raw);
  return Math.max(0, Math.min(100, Math.round(((r - 5) / 20) * 100)));
}

function readinessZone(raw: number | null | undefined): "GREEN" | "AMBER" | "RED" | null {
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const v = Number(raw);
  if (v <= 10) return "RED";
  if (v <= 14) return "AMBER";
  return "GREEN";
}

/**
 * Subscore thresholds (all 1–5 where lower = worse):
 *   ≤ 2 → critical (counts as RED driver)
 *   = 3 → borderline (counts as AMBER driver)
 *   ≥ 4 → OK
 */
function subscoreSeverity(v: number | null | undefined): "RED" | "AMBER" | "OK" | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  if (n <= 2) return "RED";
  if (n === 3) return "AMBER";
  return "OK";
}

function sleepDurationSeverity(hours: number | null | undefined): "RED" | "AMBER" | "OK" | null {
  if (hours == null || !Number.isFinite(Number(hours))) return null;
  const h = Number(hours);
  if (h < 6) return "RED"; // < 6 klst er talið klínískt svefnskortur
  if (h < 7) return "AMBER";
  return "OK";
}

type RiskDriver = {
  key: string;
  label: string;
  value: string;
  severity: "RED" | "AMBER";
  explanation: string; // Icelandic narrative
};

type RiskAnalysis = {
  overallSeverity: "LOW" | "ELEVATED" | "HIGH";
  summary: string; // 1-sentence narrative
  drivers: RiskDriver[];
  recommendations: string[]; // coach actions
};

type SessionRpeRow = {
  id: string;
  player_id: string;
  team_id: string | null;
  session_date: string;
  session_type: string;
  session_name: string | null;
  duration_minutes: number;
  rpe: number;
  session_load: number;
  source: string | null;
  notes: string | null;
  submitted_at: string;
};

type ReadinessRow = {
  player_id: string;
  entry_date: string;
  total_score: number | null;
  fatigue_energy: number | null;
  sleep_quality: number | null;
  sleep_duration: number | null;
  stress_mood: number | null;
  muscle_soreness: number | null;
  sore_areas: unknown;
  notes: string | null;
  training_modifier: unknown;
};

type LoadMetricsRow = {
  player_id: string;
  metric_date: string;
  daily_load: number | null;
  acute_load_7d: number | null;
  chronic_load_28d: number | null;
  acwr: number | null;
  load_trend: string | null;
};

type DailyLoadRow = Record<string, unknown>;
type ExternalLoadRow = Record<string, unknown>;
type MonitoringRow = Record<string, unknown>;
type VbtRow = Record<string, unknown>;

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);

    const playerId = String(url.searchParams.get("playerId") ?? "").trim();
    const date = validDateKey(url.searchParams.get("date"));

    if (!playerId) {
      return NextResponse.json({ ok: false, error: "playerId is required" }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ ok: false, error: "date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    // Load the player, then verify the coach has access to that player's team.
    const { data: playerData, error: playerErr } = await sb
      .from("players")
      .select("id, full_name, team_id, user_id, position")
      .eq("id", playerId)
      .maybeSingle();

    if (playerErr) {
      return NextResponse.json({ ok: false, error: playerErr.message }, { status: 500 });
    }

    const player = (playerData ?? null) as PlayerRow | null;
    if (!player) {
      return NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 });
    }

    await requireCoachAccessForTeam(sb, req, player.team_id ?? null);

    // ── Parallel fetches ───────────────────────────────────────────────
    const [
      rpeEntries,
      readiness,
      loadMetrics,
      dailyLoad,
      externalLoad,
      whoopSnapshot,
      vbtSessions,
      weekPlan,
      scheduleEvents,
      trainingLog,
      // 28-day trailing context for trend/plotting
      rpeTrail28,
      loadMetricsTrail28,
    ] = await Promise.all([
      // 1. All RPE entries for that day (can be multiple per player: training + gym)
      safe(async () => {
        const { data, error } = await sb
          .from("session_rpe_entries")
          .select("id, player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, session_load, source, notes, submitted_at")
          .eq("player_id", playerId)
          .eq("session_date", date)
          .order("submitted_at", { ascending: true });
        if (error) return null;
        return (data ?? []) as SessionRpeRow[];
      }),

      // 2. Readiness / wellness entry
      safe(async () => {
        const { data, error } = await sb
          .from("readiness_entries")
          .select("player_id, entry_date, total_score, fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness, sore_areas, notes, training_modifier")
          .eq("player_id", playerId)
          .eq("entry_date", date)
          .maybeSingle();
        if (error) return null;
        return (data ?? null) as ReadinessRow | null;
      }),

      // 3. Internal load metrics (ACWR, acute, chronic)
      safe(async () => {
        const { data, error } = await sb
          .from("player_load_metrics")
          .select("player_id, metric_date, daily_load, acute_load_7d, chronic_load_28d, acwr, load_trend")
          .eq("player_id", playerId)
          .eq("metric_date", date)
          .maybeSingle();
        if (error) return null;
        return (data ?? null) as LoadMetricsRow | null;
      }),

      // 4. Aggregated daily load
      safe(async () => {
        const { data, error } = await sb
          .from("player_daily_load")
          .select("*")
          .eq("player_id", playerId)
          .eq("date", date)
          .maybeSingle();
        if (error) return null;
        return (data ?? null) as DailyLoadRow | null;
      }),

      // 5. External / GPS / FMP raw load rows (Catapult / manual) — may be multiple sources
      safe(async () => {
        const { data, error } = await sb
          .from("player_external_load_daily")
          .select("*")
          .eq("player_id", playerId)
          .eq("date", date);
        if (error) return null;
        return (data ?? []) as ExternalLoadRow[];
      }),

      // 6. Whoop / athlete monitoring snapshot
      safe(async () => {
        const { data, error } = await sb
          .from("athlete_monitoring_snapshots")
          .select("athlete_id, source, date, recovery_score, hrv, resting_hr, respiratory_rate, sleep_performance, sleep_consistency, sleep_efficiency, total_sleep_millis, workout_strain, average_hr, max_hr")
          .eq("athlete_id", playerId)
          .eq("date", date);
        if (error) return null;
        return (data ?? []) as MonitoringRow[];
      }),

      // 7. VBT sessions on that day (GymAware)
      safe(async () => {
        const { data, error } = await sb
          .from("gymaware_vbt_sessions")
          .select("*")
          .eq("player_id", playerId)
          .gte("session_date", date)
          .lte("session_date", date);
        if (error) return null;
        return (data ?? []) as VbtRow[];
      }),

      // 8. Team week_plans row (day_type: MATCH / TRAINING / OFF / …)
      safe(async () => {
        if (!player.team_id) return null;
        const { data, error } = await sb
          .from("week_plans")
          .select("*")
          .eq("team_id", player.team_id)
          .eq("plan_date", date)
          .maybeSingle();
        if (error) return null;
        return data as Record<string, unknown> | null;
      }),

      // 9. Team schedule events (match vs training notice)
      safe(async () => {
        if (!player.team_id) return null;
        const { data, error } = await sb
          .from("team_schedule_events")
          .select("*")
          .eq("team_id", player.team_id)
          .gte("event_date", date)
          .lte("event_date", date);
        if (error) return null;
        return (data ?? []) as Array<Record<string, unknown>>;
      }),

      // 10. Individual training log entries
      safe(async () => {
        const { data, error } = await sb
          .from("individual_training_log")
          .select("*")
          .eq("player_id", playerId)
          .eq("log_date", date);
        if (error) return null;
        return (data ?? []) as Array<Record<string, unknown>>;
      }),

      // 11. 28-day trailing RPE load for plotting context
      safe(async () => {
        const end = new Date(`${date}T00:00:00Z`);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - 28);
        const startKey = start.toISOString().slice(0, 10);
        const { data, error } = await sb
          .from("session_rpe_entries")
          .select("session_date, session_load, rpe, duration_minutes, session_type")
          .eq("player_id", playerId)
          .gte("session_date", startKey)
          .lte("session_date", date)
          .order("session_date", { ascending: true });
        if (error) return null;
        return (data ?? []) as Array<Record<string, unknown>>;
      }),

      // 12. 28-day trailing ACWR history
      safe(async () => {
        const end = new Date(`${date}T00:00:00Z`);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - 28);
        const startKey = start.toISOString().slice(0, 10);
        const { data, error } = await sb
          .from("player_load_metrics")
          .select("metric_date, daily_load, acute_load_7d, chronic_load_28d, acwr")
          .eq("player_id", playerId)
          .gte("metric_date", startKey)
          .lte("metric_date", date)
          .order("metric_date", { ascending: true });
        if (error) return null;
        return (data ?? []) as Array<Record<string, unknown>>;
      }),
    ]);

    // ── Derived values ────────────────────────────────────────────────
    const dailyRpeLoadTotal = (rpeEntries ?? []).reduce(
      (acc, r) => acc + Number(r.session_load ?? 0),
      0
    );

    const avgRpeForDay = (rpeEntries ?? []).length
      ? Math.round(
          ((rpeEntries ?? []).reduce((acc, r) => acc + Number(r.rpe ?? 0), 0) /
            (rpeEntries ?? []).length) *
            10
        ) / 10
      : null;

    const loadBand = dailyRpeLoadTotal > 0 ? getSessionLoadBand(dailyRpeLoadTotal) : null;
    const acwrValue = loadMetrics?.acwr ?? null;
    const acwrRiskBand = acwrBand(acwrValue);

    // Readiness: DB stores raw 5–25 sum. Present both raw and normalised 0–100.
    const readinessRaw = readiness?.total_score ?? null;
    const readinessNormalised = normaliseReadiness(readinessRaw);
    const readinessBand = readinessZone(readinessRaw);

    const playerName = player.full_name ?? "Leikmaður";

    // ── Detailed risk analysis ────────────────────────────────────────
    const drivers: RiskDriver[] = [];

    // ACWR drivers
    if (acwrRiskBand === "RISK") {
      const acwrNum = Number(acwrValue);
      drivers.push({
        key: "acwr_risk",
        label: "ACWR yfir 1.5",
        value: acwrNum.toFixed(2),
        severity: "RED",
        explanation:
          `Bráðaálag síðustu 7 daga er ${acwrNum.toFixed(2)}x hærra en langtímaálag (28 d). ` +
          `Rannsóknir (Gabbett o.fl.) sýna að ACWR yfir 1.5 tvöfaldar líkurnar á mjúkvefjameiðslum ` +
          `næstu 1–2 vikurnar — sérstaklega hamstrings, quads og nára.`,
      });
    } else if (acwrRiskBand === "CAUTION") {
      const acwrNum = Number(acwrValue);
      if (acwrNum >= 1.3) {
        drivers.push({
          key: "acwr_caution",
          label: "ACWR yfir 1.3",
          value: acwrNum.toFixed(2),
          severity: "AMBER",
          explanation:
            `Bráðaálagið er ${acwrNum.toFixed(2)}x langtímaálag. Þetta er rétt undir high-risk þröskuldinum — ` +
            `enn í "sweet spot" en nauðsynlegt að fylgjast vel með þreytumerkjum.`,
        });
      } else if (acwrNum < 0.8) {
        drivers.push({
          key: "acwr_detraining",
          label: "ACWR undir 0.8",
          value: acwrNum.toFixed(2),
          severity: "AMBER",
          explanation:
            `Bráðaálag er aðeins ${acwrNum.toFixed(2)}x langtímaálag. Þetta bendir til vanálags / ` +
            `detrainingsáhættu — leikmaðurinn er ekki að fá nægilegt þjálfunaráreiti til að viðhalda formi.`,
        });
      }
    }

    // Readiness overall
    if (readinessBand === "RED") {
      drivers.push({
        key: "readiness_red",
        label: "Readiness í rauðu",
        value: `${readinessRaw}/25 (${readinessNormalised}%)`,
        severity: "RED",
        explanation:
          `Heildar readiness score er í rauðu beltinu (≤ 10/25 á hráa skalanum, ≤ 25% á 0–100 skalanum). ` +
          `Á þessu stigi er leikmaðurinn ekki líkamlega eða sálrænt tilbúinn fyrir hátt áreiti — ` +
          `líkurnar á slakri frammistöðu og meiðslum eru marktækt auknar.`,
      });
    } else if (readinessBand === "AMBER") {
      drivers.push({
        key: "readiness_amber",
        label: "Readiness í gulu",
        value: `${readinessRaw}/25 (${readinessNormalised}%)`,
        severity: "AMBER",
        explanation:
          `Heildar readiness er í aðvörunarbili (11–14/25, 26–45%). Þetta er ekki bráð áhætta en ` +
          `bendir til uppsafnaðrar þreytu — æskilegt að lækka ákafann eða stytta tímann.`,
      });
    }

    // Subscore breakdown
    const r = readiness;
    if (r) {
      const fatigueSev = subscoreSeverity(r.fatigue_energy);
      if (fatigueSev === "RED") {
        drivers.push({
          key: "fatigue_low",
          label: "Fatigue / energy mjög lágt",
          value: `${r.fatigue_energy}/5`,
          severity: "RED",
          explanation:
            `Leikmaður gefur sjálfan sig með ${r.fatigue_energy}/5 í orku. Þetta er undir bráðum þreytumörkum. ` +
            `Háákafa session mun líklega leiða til undir-performance og hærri skynjun á erfiði.`,
        });
      } else if (fatigueSev === "AMBER") {
        drivers.push({
          key: "fatigue_mid",
          label: "Fatigue / energy á mörkum",
          value: `${r.fatigue_energy}/5`,
          severity: "AMBER",
          explanation: `Orka er í meðaltali (${r.fatigue_energy}/5). Fylgstu með hvort þetta sé hluti af neikvæðri þróun undanfarna daga.`,
        });
      }

      const sleepQualSev = subscoreSeverity(r.sleep_quality);
      if (sleepQualSev === "RED") {
        drivers.push({
          key: "sleep_quality_low",
          label: "Svefngæði mjög léleg",
          value: `${r.sleep_quality}/5`,
          severity: "RED",
          explanation:
            `Skynjuð svefngæði eru ${r.sleep_quality}/5. Slakur svefn eykur kortisól, dregur úr testósterón-svörun ` +
            `og lækkar neuromuscular functional capacity um 10–20%. Forðastu max-ákafa eða tækni-krefjandi drills.`,
        });
      } else if (sleepQualSev === "AMBER") {
        drivers.push({
          key: "sleep_quality_mid",
          label: "Svefngæði á mörkum",
          value: `${r.sleep_quality}/5`,
          severity: "AMBER",
          explanation: `Svefngæði ${r.sleep_quality}/5 — í lagi en ekki optimal. Mildandi álag mælt með.`,
        });
      }

      const sleepDurSev = sleepDurationSeverity(r.sleep_duration);
      if (sleepDurSev === "RED") {
        drivers.push({
          key: "sleep_duration_low",
          label: "Svefntími undir 6 klst",
          value: `${r.sleep_duration} klst`,
          severity: "RED",
          explanation:
            `Leikmaður svaf aðeins ${r.sleep_duration} klst. Undir 6 klst reglulega tvöfaldar meiðslaáhættu (Milewski et al. 2014). ` +
            `Á þessum degi er skynjuð erfiðleiki hærri en venjulega — plana ætti lægri ákafa eða frí.`,
        });
      } else if (sleepDurSev === "AMBER") {
        drivers.push({
          key: "sleep_duration_mid",
          label: "Svefntími undir 7 klst",
          value: `${r.sleep_duration} klst`,
          severity: "AMBER",
          explanation: `Svefntími (${r.sleep_duration} klst) er undir ákjósanlegu 7–9 klst. Meðal endurheimt.`,
        });
      }

      const stressSev = subscoreSeverity(r.stress_mood);
      if (stressSev === "RED") {
        drivers.push({
          key: "stress_high",
          label: "Mikil streita / lágt skap",
          value: `${r.stress_mood}/5`,
          severity: "RED",
          explanation:
            `Stress/mood skor er ${r.stress_mood}/5. Sálræn álag eykur sympathetic tone, dregur úr HRV og ` +
            `hefur neikvæð áhrif á ákvarðanatöku í leikaðstæðum — sem aftur eykur kollisjónaráhættu.`,
        });
      }

      const soreSev = subscoreSeverity(r.muscle_soreness);
      if (soreSev === "RED") {
        drivers.push({
          key: "soreness_high",
          label: "Mikill vöðvaverkur",
          value: `${r.muscle_soreness}/5`,
          severity: "RED",
          explanation:
            `Vöðvaverkur er ${r.muscle_soreness}/5 — merki um ófullkomna endurheimt eða mikið excentrískt álag. ` +
            `Stutta endurheimt mælt með; forðast háan accel/decel volume í þjálfun í dag.`,
        });
      } else if (soreSev === "AMBER") {
        drivers.push({
          key: "soreness_mid",
          label: "Vöðvaverkur á mörkum",
          value: `${r.muscle_soreness}/5`,
          severity: "AMBER",
          explanation: `Miðlungs vöðvaverkur (${r.muscle_soreness}/5). OK að æfa en haltu HSR undir 90% af base.`,
        });
      }
    }

    // Load band driver
    if (loadBand === "VERY_HIGH") {
      drivers.push({
        key: "load_very_high",
        label: "Dagsálag mjög hátt",
        value: `${dailyRpeLoadTotal} AU`,
        severity: "RED",
        explanation:
          `Heildar sRPE-álag dagsins er ${dailyRpeLoadTotal} AU (Very hard). Þetta er meðal topp-álag og krefst ` +
          `a.m.k. 48 klst endurheimtar áður en annað hátt álag er planalt.`,
      });
    }

    // Overall severity = worst of all drivers
    const hasRed = drivers.some((d) => d.severity === "RED");
    const hasAmber = drivers.some((d) => d.severity === "AMBER");
    const overallSeverity: RiskAnalysis["overallSeverity"] = hasRed ? "HIGH" : hasAmber ? "ELEVATED" : "LOW";

    // Narrative summary
    let summary: string;
    if (overallSeverity === "HIGH") {
      const redCount = drivers.filter((d) => d.severity === "RED").length;
      summary =
        `${playerName} er með ${redCount} rautt flagg${redCount === 1 ? "" : ""} á þessum degi — ` +
        `marktæk meiðslaáhætta. Mælt með lækkuðu álagi eða fríi.`;
    } else if (overallSeverity === "ELEVATED") {
      summary = `${playerName} sýnir væg þreytumerki. Fylgstu með hvort þetta sé einangrað eða hluti af þróun.`;
    } else {
      summary = `${playerName} er í grænu á þessum degi — engin sérstök áhættumerki.`;
    }

    // Recommendations (coach actions) — generated from drivers
    const recommendations: string[] = [];
    if (drivers.some((d) => d.key === "acwr_risk")) {
      recommendations.push("Lækka dagsálag um 20–30% næstu 2–3 daga til að draga ACWR aftur undir 1.3.");
      recommendations.push("Sleppa eða stytta high-intensity blokkir í æfingu (sprettir, smáleikir á hæsta ákafa).");
    }
    if (drivers.some((d) => d.key === "sleep_duration_low" || d.key === "sleep_quality_low")) {
      recommendations.push("Svefnprótokoll: ráðleggja 9 klst í nótt, koffín-cutoff 14:00, engir skjáir 1 klst fyrir svefn.");
    }
    if (drivers.some((d) => d.key === "soreness_high")) {
      recommendations.push("Bæta við 10–15 mín endurheimt (foam roll, stretch, ís / samþjöppun) og draga úr eccentric hlaupum.");
    }
    if (drivers.some((d) => d.key === "fatigue_low")) {
      recommendations.push("Færa dagsins hæsta álag til næsta dags ef mögulegt; nota tæknidrills í staðinn.");
    }
    if (drivers.some((d) => d.key === "stress_high")) {
      recommendations.push("Stuttur samtalsfundur með leikmanni — athuga utanaðkomandi álag (próf, fjölskylda, meiðsli).");
    }
    if (drivers.some((d) => d.key === "load_very_high")) {
      recommendations.push("Næsti dagur: recovery session eða OFF. Athuga að vatns- og próteininntaka sé fullnægjandi.");
    }
    if (recommendations.length === 0 && overallSeverity !== "LOW") {
      recommendations.push("Hlusta á leikmanninn og fylgjast með á næstu æfingu — ekkert bráð aðgerð þörf.");
    }

    const riskAnalysis: RiskAnalysis = { overallSeverity, summary, drivers, recommendations };

    // Legacy compact risk flag list (fyrir header display)
    const riskFlags: string[] = drivers.map((d) =>
      d.severity === "RED" ? `🟥 ${d.label} (${d.value})` : `🟨 ${d.label} (${d.value})`
    );

    // Derive session type mix for the day
    const sessionTypeCount: Record<string, number> = {};
    for (const e of rpeEntries ?? []) {
      sessionTypeCount[e.session_type] = (sessionTypeCount[e.session_type] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      date,
      player: {
        id: player.id,
        full_name: player.full_name,
        team_id: player.team_id,
        position: player.position,
      },
      summary: {
        daily_rpe_load_total: dailyRpeLoadTotal,
        avg_rpe: avgRpeForDay,
        rpe_count: (rpeEntries ?? []).length,
        load_band: loadBand,
        acwr: acwrValue,
        acwr_band: acwrRiskBand,
        acute_load_7d: loadMetrics?.acute_load_7d ?? null,
        chronic_load_28d: loadMetrics?.chronic_load_28d ?? null,
        readiness_total_raw: readinessRaw, // 5–25 scale as stored in DB
        readiness_total: readinessNormalised, // 0–100 display scale
        readiness_band: readinessBand,
        risk_flags: riskFlags,
        session_type_mix: sessionTypeCount,
        has_readiness: !!readiness,
        has_external_load: !!(externalLoad && externalLoad.length),
        has_vbt: !!(vbtSessions && vbtSessions.length),
        has_whoop: !!(whoopSnapshot && whoopSnapshot.length),
      },
      risk_analysis: riskAnalysis,
      context: {
        week_plan: weekPlan ?? null,
        schedule_events: scheduleEvents ?? [],
      },
      rpe: {
        entries: rpeEntries ?? [],
        trail_28d: rpeTrail28 ?? [],
      },
      readiness: readiness ?? null,
      load_metrics: {
        day: loadMetrics ?? null,
        trail_28d: loadMetricsTrail28 ?? [],
      },
      daily_load: dailyLoad ?? null,
      external_load: externalLoad ?? [],
      whoop: whoopSnapshot ?? [],
      vbt: vbtSessions ?? [],
      individual_training_log: trainingLog ?? [],
    });
  } catch (error: unknown) {
    const message = toMessage(error);
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}
