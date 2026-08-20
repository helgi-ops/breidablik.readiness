"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/form-vs-state — Readiness-Adjusted Tactical Output (differentiator #2), own page.
 *
 * Separates "he's out of form" from "he was physically compromised": reads a player's recent
 * per-match tactical output (OBV) against his readiness colour on each match date + context.
 * A tactical-output read (StatsBomb), NOT physical — so it is NOT GPS-gated. Advisory /
 * descriptive; it never touches the readiness colour or the daily decision.
 */

import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import FormVsStatePanel from "@/components/coach/FormVsStatePanel";

export default function FormVsStatePage() {
  const [lang] = useLang();
  const is = lang === "IS";
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Form vs ástand" : "Form vs State"}</h1>
      <PagePurpose
        tutorial="form-vs-state"
        en="Separates two things coaches confuse: “he's out of form” vs “he was physically compromised.” Reads a player's tactical output (OBV) against his readiness colour and match context, and tags whether a trend is a genuine form change or a state/context artifact. An analysis lens — never the readiness verdict."
        is="Aðskilur tvennt sem þjálfarar rugla saman: „hann er í lélegu formi“ vs „hann var líkamlega skertur“. Les tæknilegt úttak (OBV) leikmanns í ljósi readiness-litarins og leiksamhengis, og merkir hvort þróun sé raunveruleg form-breyting eða ástands-/samhengis-skekkja. Greinandi linsa — aldrei readiness-dómurinn."
      />
      <div className="mt-4">
        <FormVsStatePanel standalone />
      </div>
    </div>
  );
}
