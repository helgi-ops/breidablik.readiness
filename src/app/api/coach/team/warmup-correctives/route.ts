/**
 * GET /api/coach/team/warmup-correctives
 *
 * Per-team individualised prehab for the pitch-session warm-up (Move 2, Slice 3).
 * For each rostered, NON-injured player it runs the same reconciled-ledger corrective
 * path the per-player Correctives tab uses — collectDeficits → reconcile →
 * planCompensations → prescribeForCompensations — honouring the anchor rule (a
 * movement source, not VALD alone) and coach overrides / medical routing. Returns
 * the flattened primary correctives per player so the coach can fold them into the
 * team warm-up.
 *
 * Screening / training only — descriptive, never a diagnosis, never the readiness
 * colour. Injured / RTP players are excluded (their prehab lives in the rehab plan).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { collectDeficits } from "@/lib/micropulse/unifiedDeficits/collect";
import { reconcile, planCompensations } from "@/lib/micropulse/unifiedDeficits/reconcile";
import { prescribeForCompensations } from "@/lib/micropulse/movementScreen/correctives/mapping";
import { loadCustomCorrectives } from "@/lib/micropulse/movementScreen/correctives/customLoader";
import type { SessionCorrective } from "@/lib/micropulse/strengthProgramming/types";

export const runtime = "nodejs";

const INJURED = new Set(["injured", "rehabilitation", "rtp_training"]);

export async function GET(req: NextRequest) {
  const sb = getSupabaseServer();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  // Roster (active) + latest injury status + team custom correctives (one query each).
  const [{ data: roster }, { data: injRows }, custom] = await Promise.all([
    sb.from("players").select("id, full_name").eq("team_id", teamId).or("is_active.is.null,is_active.eq.true"),
    sb.from("player_injuries").select("player_id, status, updated_at").eq("team_id", teamId).order("updated_at", { ascending: false }),
    loadCustomCorrectives(sb, teamId),
  ]);

  const injured = new Set<string>();
  const seenInj = new Set<string>();
  for (const r of (injRows ?? []) as Array<{ player_id: string; status: string }>) {
    const pid = String(r.player_id ?? "");
    if (!pid || seenInj.has(pid)) continue; // desc → first row is latest
    seenInj.add(pid);
    if (INJURED.has(String(r.status ?? "").toLowerCase())) injured.add(pid);
  }

  const players = ((roster ?? []) as Array<{ id: string; full_name: string | null }>).filter((p) => !injured.has(String(p.id)));

  const results = await Promise.all(
    players.map(async (p) => {
      const playerId = String(p.id);
      try {
        const { rows, overrides } = await collectDeficits(sb, playerId);
        const reconciled = reconcile(rows, overrides);
        const anchorComps = planCompensations(reconciled);
        // Anchor rule: a plan needs a movement source (screen/form/region/IMA/clinical) —
        // VALD alone never builds it.
        const anchored = anchorComps.length > 0 && reconciled.some(
          (d) => !d.medicalReferral && d.overridden !== "dismiss" && d.sources.some((s) => s.source !== "vald"),
        );
        if (!anchored) return { playerId, name: (p.full_name ?? "").trim() || "?", correctives: [] as SessionCorrective[] };

        const prescription = prescribeForCompensations(anchorComps, custom);
        if (!prescription) return { playerId, name: (p.full_name ?? "").trim() || "?", correctives: [] as SessionCorrective[] };
        const weeks = Math.round(prescription.reScreenInDays / 7);
        // Primary, non-King items only — the concise warm-up set (mirrors fetchScreenCorrectives).
        const correctives: SessionCorrective[] = prescription.phases.flatMap((g) =>
          g.items
            .filter((e) => e.tier !== "secondary" && e.source !== "king")
            .map((e) => ({
              slug: e.slug,
              nameEN: e.name.en, nameIS: e.name.is,
              doseEN: e.dose.en, doseIS: e.dose.is,
              cueEN: e.cue.en, cueIS: e.cue.is,
              sourceNoteEN: `Deficit ledger · re-screen in ~${weeks} wks`,
              sourceNoteIS: `Hallaskrá · endurskima eftir ~${weeks} vk`,
            })),
        );
        return { playerId, name: (p.full_name ?? "").trim() || "?", correctives };
      } catch {
        return { playerId, name: (p.full_name ?? "").trim() || "?", correctives: [] as SessionCorrective[] };
      }
    }),
  );

  const withPlan = results.filter((r) => r.correctives.length > 0);
  return NextResponse.json({
    ok: true,
    players: withPlan,
    coverage: { screened: withPlan.length, roster: players.length },
  });
}
