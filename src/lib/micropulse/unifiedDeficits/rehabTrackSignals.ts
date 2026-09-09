/**
 * Rehab-track writer — a player on an active injury rehab track writes CONFIRMED,
 * MEDICAL deficits into the ledger. Per the medical wall, injury deficits are
 * clinician-owned: they surface on the ledger (with the rehab track as the lever)
 * and are EXCLUDED from the coach's auto-plan (reconcile marks medical → no feeds,
 * no compensations). Reads the active injury flag (player_injuries) and maps it to
 * the rehab track + the qualities that track concerns. Pure classifier + a server
 * loader. Descriptive — never the readiness colour; pain / red flags → clinician.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { QualityKey } from "./quality";
import type { DeficitRow } from "./reconcile";

export type RehabTrackClass = { track: string; label: Bi; qualities: QualityKey[] };

/** Classify a free-text injury into its rehab track + the qualities it concerns. */
export function classifyRehabTrack(injuryText: string): RehabTrackClass | null {
  const n = injuryText.toLowerCase();
  if (/patell|jumper|anterior knee/.test(n)) return { track: "jumpers_knee", label: { en: "Jumper's-knee rehab", is: "Jumper's-knee endurhæfing" }, qualities: ["landing_valgus"] };
  if (/\bacl\b|cruciate/.test(n)) return { track: "acl_knee", label: { en: "ACL rehab", is: "ACL endurhæfing" }, qualities: ["landing_valgus", "landing_stability", "limb_asymmetry"] };
  if (/achill/.test(n)) return { track: "achilles", label: { en: "Achilles rehab", is: "Achilles endurhæfing" }, qualities: ["eccentric_absorption"] };
  if (/calf|gastroc|soleus/.test(n)) return { track: "calf", label: { en: "Calf-strain rehab", is: "Kálfa-tognunar endurhæfing" }, qualities: ["eccentric_absorption"] };
  if (/hamstring/.test(n)) return { track: "hamstring", label: { en: "Hamstring rehab", is: "Aftanlæris endurhæfing" }, qualities: ["posterior_chain_length", "limb_asymmetry"] };
  if (/adductor|groin/.test(n)) return { track: "adductor_groin", label: { en: "Adductor / groin rehab", is: "Aðfærslu / nára endurhæfing" }, qualities: ["adductor_capacity"] };
  if (/low.?back|lumbar|\blbp\b|\bl[1-5]\b|lumbo|sciatic|disc/.test(n)) return { track: "low_back", label: { en: "Low-back rehab", is: "Mjóbaks-endurhæfing" }, qualities: ["trunk_antirotation"] };
  return null;
}

/** Pure: an active injury → its confirmed, medical rehab-track deficit rows. */
export function rehabTrackDeficits(injuryText: string, opts: { since?: string | null } = {}): DeficitRow[] {
  const cls = classifyRehabTrack(injuryText);
  if (!cls) return [];
  const detail = (en: string, is: string): Bi => ({
    en: `${en}${opts.since ? ` · since ${opts.since}` : ""}`,
    is: `${is}${opts.since ? ` · síðan ${opts.since}` : ""}`,
  });
  return cls.qualities.map((quality) => ({
    quality,
    source: "rehab_track" as const,
    status: "confirmed" as const,
    confidence: 0.9,
    provenance: detail(`Under ${cls.label.en} (clinician)`, `Í ${cls.label.is} (klíníker)`),
    evidenceGrade: "moderate" as const,
    medical: true, // clinician-owned — surfaces, but out of the coach's auto-plan
  }));
}

/** Server: read the active injury and derive the rehab-track deficit rows. */
export async function loadRehabTrackDeficitRows(sb: SupabaseClient, playerId: string): Promise<DeficitRow[]> {
  const { data } = await sb
    .from("player_injuries")
    .select("injury_type, body_part, injury_date, status")
    .eq("player_id", playerId)
    .neq("status", "cleared")
    .order("injury_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const r = data as { injury_type?: string | null; body_part?: string | null; injury_date?: string | null } | null;
  if (!r) return [];
  const text = `${r.injury_type ?? ""} ${r.body_part ?? ""}`.trim();
  return rehabTrackDeficits(text, { since: r.injury_date ?? null });
}
