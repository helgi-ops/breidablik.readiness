"use client";

/**
 * Per-test movement observations — the screening form, folded into Analyse &
 * measure so ONE selected test = analyse + measure + tick its structured
 * observations in one place. The coach ticks the selected test's observations
 * (per-finding, L/R, pain); the deficit ledger still aggregates ACROSS every test
 * the player has recorded (a finding seen on several tests → one higher-confidence
 * deficit). Saving MERGES this test's observations into the player's whole-battery
 * assessment form, so switching tests never drops another test's findings.
 *
 * Enforces the compensation-≠-diagnosis rule (a deviation is a hypothesis, not a
 * diagnosis). Screening/training only — never a diagnosis, never the readiness
 * colour; pain / red flags → clinician.
 */
import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import {
  defaultBattery, operationalFor, CATALOGUE_BY_SLUG, DOMAIN_LABEL, HYPOTHESIS_RULE,
  type Observation,
} from "@/lib/micropulse/movementScreen/testCatalogue";
import { buildDeficitLedger, type FiredObservation } from "@/lib/micropulse/movementScreen/deficitLedger";

const BLUE = "#2740e6";
const EXTRA_CONFIRM: Record<string, Bi> = {
  heel_elevated_squat_retest: { en: "Heel-elevated squat retest", is: "Hæl-upphækkuð hnébeygju endurpróf" },
  isolated_hip_abductor_strength: { en: "Isolated hip-abductor strength test", is: "Einangrað mjaðma-fráfærslu styrktarpróf" },
};
const confirmLabel = (slug: string): Bi => CATALOGUE_BY_SLUG[slug]?.name ?? EXTRA_CONFIRM[slug] ?? { en: slug.replace(/_/g, " "), is: slug.replace(/_/g, " ") };

export default function MovementObservations({ playerId, slug }: { playerId: string; slug: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const L = (b: Bi) => (is ? b.is : b.en);
  const T = (en: string, isT: string) => (is ? isT : en);

  // The whole battery drives ledger aggregation; the UI shows only the selected test.
  const batterySlugs = React.useMemo(() => defaultBattery().filter((x) => operationalFor(x.slug)).map((x) => x.slug), []);
  const op = React.useMemo(() => operationalFor(slug), [slug]);

  // checked[`${testSlug}:${obsKey}`] = set of sides ("L"/"R"/"both") — across ALL tests.
  const [checked, setChecked] = React.useState<Record<string, Set<"L" | "R" | "both">>>({});
  const [pain, setPain] = React.useState<Record<string, number>>({}); // per testSlug
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  // Load the player's latest saved form (all tests) so ticking one test keeps the rest.
  React.useEffect(() => {
    setChecked({}); setPain({}); setMsg(null); setSavedAt(null);
    if (!playerId) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/coach/movement-assessment-form?player_id=${encodeURIComponent(playerId)}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await res.json().catch(() => ({}));
      if (!alive || !res.ok || !j.form) return;
      const fired = (j.form.fired ?? []) as FiredObservation[];
      const next: Record<string, Set<"L" | "R" | "both">> = {};
      for (const f of fired) { const k = `${f.testSlug}:${f.observationKey}`; (next[k] ??= new Set()).add(f.side ?? "both"); }
      setChecked(next);
      setPain((j.form.results?.pain ?? {}) as Record<string, number>);
      setSavedAt(j.form.assessment_date ?? null);
    })();
    return () => { alive = false; };
  }, [playerId, token]);

  const toggle = (testSlug: string, ob: Observation, side: "L" | "R" | "both") => {
    const k = `${testSlug}:${ob.key}`;
    setChecked((s) => {
      const n = { ...s };
      const set = new Set(n[k] ?? []);
      if (set.has(side)) set.delete(side); else set.add(side);
      if (set.size) n[k] = set; else delete n[k];
      return n;
    });
  };

  const fired: FiredObservation[] = React.useMemo(() => {
    const out: FiredObservation[] = [];
    for (const [k, sides] of Object.entries(checked)) {
      const [testSlug, observationKey] = k.split(":");
      for (const side of sides) out.push({ testSlug, observationKey, side });
    }
    return out;
  }, [checked]);

  const ledger = React.useMemo(() => buildDeficitLedger(fired, batterySlugs), [fired, batterySlugs]);

  const save = async () => {
    if (!playerId) return;
    setSaving(true); setMsg(null);
    try {
      const results = { pain, checked: Object.fromEntries(Object.entries(checked).map(([k, v]) => [k, [...v]])) };
      const res = await fetch("/api/coach/movement-assessment-form", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ player_id: playerId, battery: batterySlugs, results, fired }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsg(T("Saved ✓ — findings feed the deficit ledger.", "Vistað ✓ — niðurstöður fæða halla-bókina."));
      setSavedAt(new Date().toISOString().slice(0, 10));
    } catch (e) { setMsg(T("Save failed", "Vistun brást") + ": " + (e instanceof Error ? e.message : "error")); }
    finally { setSaving(false); }
  };

  if (!playerId) return null;

  // Observations for the SELECTED test only (the ledger below still spans every test).
  const selectedTicks = op ? op.observations.reduce((n, ob) => n + ((checked[`${slug}:${ob.key}`]?.size ?? 0) > 0 ? 1 : 0), 0) : 0;

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">{L(HYPOTHESIS_RULE)}</p>

      {/* Selected test's structured observations */}
      {op ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">{T("Structured observations", "Skipulögð frávik")}</p>
            {selectedTicks > 0 && <span className="text-[10px] text-slate-400">{T(`${selectedTicks} ticked on this test`, `${selectedTicks} hökuð á þessu prófi`)}</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">{L(op.challenges)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-600">{T("Pain (0–10):", "Verkur (0–10):")}</span>
            <input type="number" min={0} max={10} value={pain[slug] ?? ""} onChange={(e) => setPain((s) => ({ ...s, [slug]: Number(e.target.value) }))} className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-[12px]" />
            {(pain[slug] ?? 0) >= 4 && <span className="text-[10px] font-semibold text-[#a83e28]">{T("pain → clinician", "verkur → klíníker")}</span>}
          </div>
          <ul className="mt-2 space-y-1.5">
            {op.observations.map((ob) => {
              const k = `${slug}:${ob.key}`;
              const sides = checked[k] ?? new Set();
              return (
                <li key={ob.key} className="text-[12px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {ob.sided ? (
                      <>
                        <span className="font-medium text-slate-700">{L(ob.observation)}</span>
                        {(["L", "R"] as const).map((sd) => (
                          <label key={sd} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            <input type="checkbox" checked={sides.has(sd)} onChange={() => toggle(slug, ob, sd)} />{sd}
                          </label>
                        ))}
                      </>
                    ) : (
                      <label className="inline-flex items-center gap-1.5">
                        <input type="checkbox" checked={sides.has("both")} onChange={() => toggle(slug, ob, "both")} />
                        <span className="font-medium text-slate-700">{L(ob.observation)}</span>
                      </label>
                    )}
                    {ob.poseMeasurable && <span className="rounded bg-emerald-50 px-1 text-[9px] text-emerald-700">{T("pose", "pose")}</span>}
                  </div>
                  <p className="ml-0.5 text-[10px] text-slate-400">→ {T("investigate:", "kanna:")} {L(ob.investigate)}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500">{T("No structured observation checklist for this test — capture it with the measured findings and the AI read above; its deficits still show in the ledger.", "Enginn skipulagður frávika-listi fyrir þetta próf — fangaðu það með mældu niðurstöðunum og AI-lestrinum að ofan; hallar þess sjást samt í halla-bókinni.")}</p>
      )}

      {/* Live deficit ledger — aggregates across EVERY test recorded for the player */}
      <div className="rounded-xl border p-4" style={{ borderColor: `${BLUE}22`, background: `${BLUE}08` }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BLUE }}>{T("Deficit ledger (live, all tests)", "Halla-bók (rauntíma, öll próf)")}</p>
        {ledger.length === 0 ? (
          <p className="mt-1 text-[12px] text-slate-500">{T("Tick the observations above — a finding seen across tests aggregates into one higher-confidence deficit here.", "Hakaðu við frávik að ofan — niðurstaða sem sést yfir próf sameinast í eina hærri-vissu halla hér.")}</p>
        ) : (
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
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving || fired.length === 0} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
          {saving ? T("Saving…", "Vista…") : T(`Save observations (${fired.length} finding${fired.length === 1 ? "" : "s"})`, `Vista frávik (${fired.length})`)}
        </button>
        {savedAt && <span className="text-[10px] text-slate-400">{T("Last saved:", "Síðast vistað:")} {savedAt}</span>}
        {msg && <span className="text-[11px] text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
