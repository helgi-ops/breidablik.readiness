/**
 * Bridge: a movement-screen finding → the matching DB staged-loading REHAB
 * PROTOCOL (recovery_protocols) that carries the clinical staged exercises. The
 * screen routes the coach to the right protocol (whose stages a clinician gates
 * by pain + symmetry); it does NOT rewrite that protocol. Routed by the same
 * tendon key the tendon-loading layer already uses.
 *
 * Rehab-support only — the staged protocol is clinician-gated; pain / diagnosis →
 * clinician. Never a diagnosis, never the readiness colour. Pure data module.
 */
import type { Bi } from "../registry";
import type { CompensationKey } from "./registry";
import { tendonsForCompensations, type TendonKey } from "./tendonLoading";

export type RehabProtocolLink = {
  /** recovery_protocols.slug of the staged-loading protocol. */
  slug: string;
  /** Coach page that reviews + sends the protocol. */
  coachPath: string;
  title: Bi;
  /** Plain "why this protocol" for the coach. */
  why: Bi;
  tendon: TendonKey;
};

/** Tendon → its DB staged-loading protocol (only tendons that have one). */
const TENDON_PROTOCOL: Partial<Record<TendonKey, RehabProtocolLink>> = {
  patellar: {
    slug: "jumpers_knee_staged_loading",
    coachPath: "/coach/jumpers-knee",
    title: { en: "Jumper's Knee — Staged Tendon Loading", is: "Jumper's Knee — þrepaskipt sina-álag" },
    why: { en: "Landing / absorption findings point to the patellar tendon.", is: "Lendingar- / deyfingar-niðurstöður benda á hnéskeljar-sinina." },
    tendon: "patellar",
  },
  achilles: {
    slug: "achilles_tendinopathy_staged_loading",
    coachPath: "/coach/achilles-tendinopathy",
    title: { en: "Achilles Tendinopathy — Staged Loading", is: "Achilles tendinopathía — þrepaskipt álag" },
    why: { en: "Ankle-dorsiflexion / reactive findings point to the Achilles tendon.", is: "Ökkla-dorsiflexion / viðbragðs-niðurstöður benda á Achilles-sinina." },
    tendon: "achilles",
  },
  adductor: {
    slug: "adductor_related_groin_staged_loading",
    coachPath: "/coach/adductor-groin",
    title: { en: "Adductor / Groin — Staged Loading", is: "Aðfærslu / nára — þrepaskipt álag" },
    why: { en: "A groin / adductor picture points to the adductor staged-loading protocol.", is: "Nára- / aðfærslu-mynd bendir á aðfærslu þrepaskipt álag." },
    tendon: "adductor",
  },
};

/** All slugs this bridge can suggest (for the server existence check). */
export const REHAB_PROTOCOL_SLUGS: string[] = Object.values(TENDON_PROTOCOL).map((p) => p.slug);

/** Candidate staged-loading protocols a set of screen findings points to. */
export function rehabProtocolsForCompensations(compKeys: CompensationKey[]): RehabProtocolLink[] {
  const tendons = [...new Set(tendonsForCompensations(compKeys))];
  return tendons.map((t) => TENDON_PROTOCOL[t]).filter((p): p is RehabProtocolLink => !!p);
}
