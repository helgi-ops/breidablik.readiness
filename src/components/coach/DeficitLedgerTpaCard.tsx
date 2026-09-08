"use client";

/**
 * Deficit-ledger card for Total Player Analysis. Surfaces the player's latest
 * Movement Screening Assessment as an athlete-axis input: the deviations recorded
 * across the battery are aggregated into higher-confidence deficits (a finding
 * seen on several tests = one corroborated target), tagged across the 8 domains,
 * with the confirmation tests still outstanding. Self-contained (fetches by
 * playerId), silent until an assessment exists.
 *
 * A deficit is a HYPOTHESIS to confirm, not a diagnosis; never the readiness
 * colour; pain / red flags → clinician.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import {
  DOMAIN_LABEL, CATALOGUE_BY_SLUG, HYPOTHESIS_RULE,
} from "@/lib/micropulse/movementScreen/testCatalogue";
import { buildDeficitLedger, type FiredObservation, type LedgerDeficit } from "@/lib/micropulse/movementScreen/deficitLedger";

const BLUE = "#2740e6";
const EXTRA_CONFIRM: Record<string, Bi> = {
  heel_elevated_squat_retest: { en: "Heel-elevated squat retest", is: "Hæl-upphækkuð hnébeygju endurpróf" },
  isolated_hip_abductor_strength: { en: "Isolated hip-abductor strength test", is: "Einangrað mjaðma-fráfærslu styrktarpróf" },
};
const confirmLabel = (slug: string): Bi => CATALOGUE_BY_SLUG[slug]?.name ?? EXTRA_CONFIRM[slug] ?? { en: slug.replace(/_/g, " "), is: slug.replace(/_/g, " ") };

type FormRow = { assessment_date: string; battery: string[]; fired: FiredObservation[] };

export default function DeficitLedgerTpaCard({ playerId, isEN }: { playerId: string; isEN: boolean }) {
  const [row, setRow] = React.useState<FormRow | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  React.useEffect(() => {
    let alive = true;
    if (!playerId) { setRow(null); setLoaded(true); return; }
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
        const res = await fetch(`/api/coach/movement-assessment-form?player_id=${encodeURIComponent(playerId)}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (alive) { setRow(res.ok && j.form ? (j.form as FormRow) : null); setLoaded(true); }
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  const ledger: LedgerDeficit[] = React.useMemo(
    () => (row?.fired?.length ? buildDeficitLedger(row.fired, row.battery ?? []) : []),
    [row],
  );

  if (!loaded || !row || ledger.length === 0) return null; // silent until an assessment exists

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${BLUE}22`, background: `${BLUE}08` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BLUE }}>{T("Movement deficit ledger", "Hreyfi halla-bók")}</p>
        <span className="text-[10px] text-slate-400">{T("assessed", "metið")} {row.assessment_date}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-600">{T("Deviations aggregated across the movement screen — a finding seen on several tests is one corroborated target. An athlete-axis input to the corrective / strength plan.", "Frávik sameinuð yfir hreyfiskimunina — niðurstaða á mörgum prófum er eitt staðfest markmið. Íþrótta-ás innlegg í corrective / styrktar-plan.")}</p>

      <ul className="mt-2 space-y-2">
        {ledger.map((d) => (
          <li key={d.deficitKey} className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${BLUE}22` }}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-semibold text-slate-800">{L(d.label)}</span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${d.confidence === "corroborated" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{d.confidence === "corroborated" ? T("corroborated", "staðfest yfir próf") : T("provisional", "til bráðabirgða")}</span>
              {d.sides.filter((s) => s !== "both").length > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">{d.sides.filter((s) => s !== "both").join("/")}</span>}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">{T("Seen on:", "Sést á:")} {d.supportingTests.map((s) => L(confirmLabel(s))).join(" · ")}</p>
            <div className="mt-1 flex flex-wrap gap-1">{d.domains.map((dm) => <span key={dm} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">{L(DOMAIN_LABEL[dm])}</span>)}</div>
            {d.outstandingConfirmations.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-600">{T("Confirm with:", "Staðfestu með:")} <span className="text-slate-500">{d.outstandingConfirmations.map((s) => L(confirmLabel(s))).join(" · ")}</span></p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[9px] text-slate-500">{L(HYPOTHESIS_RULE)}</p>
    </div>
  );
}
