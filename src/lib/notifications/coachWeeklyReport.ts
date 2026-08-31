import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "@/lib/email/sendTransactionalEmail";
import { getTeamPlanTier, isEliteTeam } from "@/lib/micropulse/elite";

/**
 * Coach weekly report — proactive-delivery Addition 3.
 *
 * A once-a-week email (Friday) per opted-in coach: a DETERMINISTIC 7-day rollup
 * (readiness colour mix, training load, availability, alerts fired) — a PRO feature —
 * plus, for ELITE teams only, an AI-written narrative that translates the week into
 * plain coaching language. The AI paragraph labels itself as AI, is built STRICTLY
 * from the rollup numbers, and invents nothing.
 *
 * Reporting the canonical readiness colour distribution is READ-ONLY summary — it
 * aligns to v_coach_readiness_today_v8 / readiness_entries.color (the same colour the
 * coach sees) and never writes it. Descriptive; the AI never overrides a verdict.
 */

const AI_MODEL = "claude-sonnet-5";

// ── Deterministic rollup ─────────────────────────────────────────────────────
export type WeeklyRollup = {
  weekStart: string;
  weekEnd: string;
  roster: number;
  readiness: { red: number; yellow: number; green: number; totalDays: number; topRed: Array<{ name: string; redDays: number }> };
  load: { sessions: number; avgRpe: number | null };
  availability: { count: number; out: Array<{ name: string; status: string }> };
  alerts: number;
};

function norm(color: string | null): "red" | "yellow" | "green" | null {
  const c = String(color ?? "").toLowerCase();
  return c === "red" || c === "yellow" || c === "green" ? c : null;
}

export async function buildWeeklyRollup(
  sb: SupabaseClient,
  teamId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyRollup> {
  const { data: playersData } = await sb
    .from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (playersData ?? []) as Array<{ id: string; full_name: string | null }>;
  const nameById = new Map(players.map((p) => [p.id, p.full_name ?? "Player"]));
  const ids = players.map((p) => p.id);

  const rollup: WeeklyRollup = {
    weekStart, weekEnd, roster: ids.length,
    readiness: { red: 0, yellow: 0, green: 0, totalDays: 0, topRed: [] },
    load: { sessions: 0, avgRpe: null },
    availability: { count: 0, out: [] },
    alerts: 0,
  };
  if (ids.length === 0) return rollup;

  // Readiness colour mix over the week (canonical readiness_entries.color, read-only).
  const { data: readRows } = await sb
    .from("readiness_entries").select("player_id, color, entry_date")
    .in("player_id", ids).gte("entry_date", weekStart).lte("entry_date", weekEnd);
  const redByPlayer = new Map<string, number>();
  for (const r of (readRows ?? []) as Array<{ player_id: string; color: string | null }>) {
    const c = norm(r.color);
    if (!c) continue;
    rollup.readiness[c]++;
    rollup.readiness.totalDays++;
    if (c === "red") redByPlayer.set(r.player_id, (redByPlayer.get(r.player_id) ?? 0) + 1);
  }
  rollup.readiness.topRed = [...redByPlayer.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, redDays]) => ({ name: nameById.get(id) ?? "Player", redDays }));

  // Training load — REAL sRPE submissions only (exclude auto_fill / imputed).
  const { data: rpeRows } = await sb
    .from("session_rpe_entries").select("rpe, source")
    .eq("team_id", teamId).gte("session_date", weekStart).lte("session_date", weekEnd);
  const real = ((rpeRows ?? []) as Array<{ rpe: number | null; source: string | null }>)
    .filter((r) => r.rpe != null && !["auto_fill", "imputed"].includes(String(r.source ?? "")));
  rollup.load.sessions = real.length;
  rollup.load.avgRpe = real.length ? Math.round((real.reduce((s, r) => s + (r.rpe ?? 0), 0) / real.length) * 10) / 10 : null;

  // Availability — latest player_injuries status per player, not cleared = out.
  const { data: injRows } = await sb
    .from("player_injuries").select("player_id, status, injury_type, injury_date")
    .in("player_id", ids).order("injury_date", { ascending: false });
  const seen = new Set<string>();
  for (const r of (injRows ?? []) as Array<{ player_id: string; status: string | null; injury_type: string | null }>) {
    if (seen.has(r.player_id)) continue; // first = latest
    seen.add(r.player_id);
    const status = String(r.status ?? "").toLowerCase();
    if (status && status !== "cleared") {
      rollup.availability.out.push({ name: nameById.get(r.player_id) ?? "Player", status: r.status ?? "" });
    }
  }
  rollup.availability.count = rollup.availability.out.length;

  // Alerts fired this week (what the system flagged).
  const { count: alertCount } = await sb
    .from("coach_notification_log").select("id", { count: "exact", head: true })
    .eq("team_id", teamId).eq("kind", "alert").gte("as_of", weekStart).lte("as_of", weekEnd);
  rollup.alerts = alertCount ?? 0;

  return rollup;
}

// ── AI narrative (ELITE only) ────────────────────────────────────────────────
const AI_SYSTEM = `You are a football club's head of performance writing a SHORT weekly note for the head coach.
You are given a JSON rollup of the week the system already computed: readiness colour mix (red/yellow/green player-days), training sessions + average RPE, players currently unavailable, and how many threshold alerts fired.
Write STRICTLY from these numbers — never invent values, player names not in the data, tactics, or events. Plain language a non-analyst coach reads at a glance; no sport-science jargon. 2–4 sentences. Note the genuine story of the week (e.g. "a heavier week with more red days mid-week, easing by Friday"). Do not give medical advice or override any readiness verdict.
Return ONLY the paragraph text — no JSON, no markdown, no preamble.`;

/** Returns the AI paragraph, or null on any failure / missing key. Never throws. */
export async function generateWeeklyNarrative(rollup: WeeklyRollup): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 400,
        thinking: { type: "disabled" },
        system: AI_SYSTEM,
        messages: [{ role: "user", content: `Write in English. Weekly rollup (JSON):\n\n${JSON.stringify(rollup)}` }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const txt = String(j?.content?.[0]?.text ?? "").trim();
    return txt || null;
  } catch {
    return null;
  }
}

// ── Email rendering ──────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function renderWeeklyEmail(r: WeeklyRollup, narrative: string | null): { subject: string; text: string; html: string } {
  const subject = `MicroPulse weekly report — ${r.weekStart} to ${r.weekEnd}`;
  const readinessLine = r.readiness.totalDays
    ? `Readiness: ${r.readiness.green} green / ${r.readiness.yellow} yellow / ${r.readiness.red} red player-days.`
    : "Readiness: no check-ins logged this week.";
  const loadLine = r.load.sessions
    ? `Load: ${r.load.sessions} logged sessions${r.load.avgRpe != null ? `, average RPE ${r.load.avgRpe}` : ""}.`
    : "Load: no RPE sessions logged this week.";
  const availLine = r.availability.count
    ? `Unavailable (${r.availability.count}): ${r.availability.out.map((o) => `${o.name} (${o.status})`).join(", ")}.`
    : "Availability: full squad available.";
  const alertsLine = `Threshold alerts fired this week: ${r.alerts}.`;
  const topRedLine = r.readiness.topRed.length
    ? `Most red days: ${r.readiness.topRed.map((t) => `${t.name} (${t.redDays})`).join(", ")}.`
    : "";

  const factLines = [readinessLine, loadLine, availLine, alertsLine, topRedLine].filter(Boolean);
  const text = [
    `MicroPulse weekly report`,
    `${r.weekStart} → ${r.weekEnd}`,
    "",
    ...(narrative ? [`AI summary: ${narrative}`, ""] : []),
    ...factLines,
    "",
    "Descriptive week overview — it never changes a player's readiness verdict. You opted in; manage this in Settings.",
  ].join("\n");

  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#14181c;max-width:600px">
    <h2 style="font-size:18px;margin:0 0 2px">MicroPulse — weekly report</h2>
    <p style="font-size:13px;color:#667;margin:0 0 14px">${esc(r.weekStart)} → ${esc(r.weekEnd)}</p>
    ${narrative ? `<div style="border-left:3px solid #2740e6;background:#f4f6ff;padding:10px 12px;margin:0 0 14px;border-radius:6px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#2740e6;margin:0 0 4px">AI summary</div>
      <p style="font-size:14px;margin:0;color:#223">${esc(narrative)}</p></div>` : ""}
    <ul style="padding-left:18px;margin:0 0 12px;font-size:14px">
      ${factLines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join("")}
    </ul>
    <p style="font-size:12px;color:#667;margin:12px 0 0">Descriptive week overview — it never changes a player's readiness verdict. You opted in; manage this in Settings.</p>
  </div>`;

  return { subject, text, html };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export type WeeklyReportResult = {
  teamsConsidered: number;
  teamsBelowTier: number;
  coachesSent: number;
  coachesSkippedAlreadySent: number;
  aiTeams: number; // teams that got an AI narrative (ELITE)
};

/** dateKey = the Friday the report covers (weekEnd). Idempotent per (coach, 'weekly', weekStart). */
export async function runWeeklyReports(
  sb: SupabaseClient,
  opts: { dateKey: string },
): Promise<WeeklyReportResult> {
  const weekEnd = opts.dateKey;
  const weekStart = (() => { const d = new Date(`${weekEnd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); })();
  const res: WeeklyReportResult = { teamsConsidered: 0, teamsBelowTier: 0, coachesSent: 0, coachesSkippedAlreadySent: 0, aiTeams: 0 };

  const { data: prefs } = await sb
    .from("coach_notification_preferences").select("profile_id").eq("weekly_report", true);
  const prefRows = (prefs ?? []) as Array<{ profile_id: string }>;
  if (prefRows.length === 0) return res;

  const { data: profs } = await sb
    .from("profiles").select("id, team_id").in("id", prefRows.map((r) => r.profile_id));
  const coachesByTeam = new Map<string, string[]>();
  for (const p of (profs ?? []) as Array<{ id: string; team_id: string | null }>) {
    if (!p.team_id) continue;
    const list = coachesByTeam.get(p.team_id) ?? [];
    list.push(p.id);
    coachesByTeam.set(p.team_id, list);
  }

  for (const [teamId, coachIds] of coachesByTeam) {
    res.teamsConsidered++;
    const tier = await getTeamPlanTier(sb, teamId);
    if (tier !== "PRO" && tier !== "ELITE") { res.teamsBelowTier++; continue; }

    const rollup = await buildWeeklyRollup(sb, teamId, weekStart, weekEnd).catch(() => null);
    if (!rollup) continue;

    // AI narrative for ELITE teams only (the deterministic rollup is PRO).
    let narrative: string | null = null;
    if (await isEliteTeam(sb, teamId)) {
      narrative = await generateWeeklyNarrative(rollup);
      if (narrative) res.aiTeams++;
    }
    const email = renderWeeklyEmail(rollup, narrative);

    // Coach emails for this team.
    const emailByCoach = new Map<string, string>();
    const { data: emailRows } = await sb.rpc("get_team_coaches_with_email", { p_team_id: teamId });
    for (const r of (emailRows ?? []) as Array<{ profile_id: string; email: string | null }>) {
      if (r.email) emailByCoach.set(r.profile_id, r.email);
    }

    for (const profileId of coachIds) {
      const { data: already } = await sb
        .from("coach_notification_log").select("id")
        .eq("profile_id", profileId).eq("kind", "weekly").eq("signal_key", weekStart)
        .limit(1).maybeSingle();
      if (already) { res.coachesSkippedAlreadySent++; continue; }

      const to = emailByCoach.get(profileId);
      if (!to) continue;
      try {
        const r = await sendTransactionalEmail({ to, subject: email.subject, text: email.text, html: email.html });
        if (r.ok) {
          res.coachesSent++;
          await sb.from("coach_notification_log").insert({
            profile_id: profileId, team_id: teamId, kind: "weekly", signal_key: weekStart,
            channel: "email", as_of: weekEnd, provider_message_id: r.providerMessageId ?? null,
          });
        }
      } catch (err) {
        console.error("[coach-weekly] email error", err);
      }
    }
  }

  return res;
}
