// app/dev-coach-dashboard/page.tsx (innan í handler)
// ATH: laga table/view names: "player_daily_signals" og "team_decisions" að þínu schema.

import { computeTeamDecision } from "@/lib/decision/engine";
import { supabase } from "@/lib/supabaseClient";

async function generateToday(teamId: string, decisionDate: string) {
  // 1) Fetch players
  const { data: playersRaw, error: pErr } = await supabase
    .from("player_daily_signals") // <-- CHANGE THIS
    .select("player_id, z, z_prev, is_medical")
    .eq("team_id", teamId)
    .eq("date", decisionDate);

  if (pErr) throw pErr;

  // 2) Fetch yesterday context
  const yday = new Date(decisionDate);
  yday.setDate(yday.getDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);

  const { data: ctx, error: cErr } = await supabase
    .from("training_session_context")
    .select("hsr_m, acc_dec_total, total_distance_m, max_velocity_pct, intensity")
    .eq("team_id", teamId)
    .eq("session_date", ydayStr)
    .maybeSingle();

  if (cErr) throw cErr;

  // 3) Compute decision
  const result = computeTeamDecision(playersRaw ?? [], ctx ?? { intensity: null });

  // 4) Upsert team decision (YOUR TABLE)
  const { error: dErr } = await supabase
    .from("team_decisions") // <-- CHANGE THIS
    .upsert({
      team_id: teamId,
      decision_date: decisionDate,
      system_decision: result.team_action,
      decision_score: result.decision_score,
      reasons: result.reasons,
    }, { onConflict: "team_id,decision_date" });

  if (dErr) throw dErr;

  // 5) Upsert exceptions
  const payload = (result.exceptions ?? []).map(e => ({
    team_id: teamId,
    decision_date: decisionDate,
    player_id: e.player_id,
    action: e.action,
    reason_codes: e.reason_codes,
  }));

  if (payload.length) {
    const { error: xErr } = await supabase
      .from("decision_exceptions")
      .upsert(payload, { onConflict: "team_id,decision_date,player_id" });

    if (xErr) throw xErr;
  }

  return result;
}