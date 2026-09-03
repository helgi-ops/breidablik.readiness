"use client";

/**
 * Player physical story — the whole-page synthesis card at the top of the Power Curve player tab.
 * Reads the ALREADY-COMPUTED outputs of the cards below (role-demand fit, power curve, season
 * trend, movement style) and composes one coherent layered read via the pure playerPhysicalStory
 * engine (rules compute — not AI). Level 0 verdict → Level 1 facts (each tagged + links to its
 * card) → Level 2 "Show the full read" (reconciles the tensions). Descriptive — never touches the
 * readiness colour, the load target, or the daily decision. EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { buildPhysicalStory, type StoryInput, type PhysicalStory, type Conf } from "@/lib/micropulse/playerPhysicalStory";

const CONF_LABEL: Record<Conf, { en: string; is: string }> = {
  high: { en: "high", is: "há" }, medium: { en: "medium", is: "miðlungs" }, low: { en: "low", is: "lág" },
};

const mapConf = (c: unknown): Conf | undefined => (c === "high" ? "high" : c === "moderate" || c === "medium" ? "medium" : c === "low" ? "low" : undefined);

function scrollToCard(anchor: string) {
  const el = document.getElementById(anchor);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("ring-2", "ring-[#2740e6]"); setTimeout(() => el.classList.remove("ring-2", "ring-[#2740e6]"), 1600); }
}

export default function PhysicalStoryCard({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [story, setStory] = React.useState<PhysicalStory | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!playerId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
        const h = { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" as const };
        const j = async (url: string) => { try { const r = await fetch(url, h); return r.ok ? await r.json() : null; } catch { return null; } };
        const [roleR, curveR, seasonR, styleR] = await Promise.all([
          j(`/api/coach/role-demand-fit?playerId=${playerId}`),
          j(`/api/coach/load/peak-period?player=${playerId}`),
          j(`/api/coach/player/${playerId}/season-trends`),
          j(`/api/coach/load/movement-style?player=${playerId}`),
        ]);
        if (!alive) return;

        // ── Map each route's own enums onto the engine's input shape ──
        const input: StoryInput = {};
        const read = roleR?.read;
        if (read) {
          const band = read.engine?.band;
          input.role = {
            roleLabel: read.roleLabel ?? null,
            engineBand: band === "elite" ? "elite" : band === "solid" ? "solid" : band === "below" ? "low" : "unknown",
            driverFit: read.driver?.fit === "fits" ? "fits" : read.driver?.fit === "atypical" ? "stretches" : "unknown",
            outputRead: read.output?.read === "productive" ? "above" : read.output?.read === "at_norm" ? "at" : read.output?.read === "under" ? "below" : "unknown",
            watch: Array.isArray(read.watch) ? read.watch.map((w: { label?: { en: string; is: string } }) => w.label).filter(Boolean) : [],
            confidence: mapConf(read.confidence),
            smallGroup: false, // set from the position group size below
          };
        }
        const shapes = curveR?.shapes as Record<string, { retentionPct: number | null; longPercentile: number | null; shape: string }> | undefined;
        if (shapes) {
          const sh = shapes.player_load ?? shapes.distance ?? shapes.hsr ?? Object.values(shapes)[0];
          if (sh) input.powerCurve = { retentionPct: sh.retentionPct ?? null, rankPct: sh.longPercentile ?? null, confidence: sh.shape === "insufficient" ? "low" : "medium" };
        }
        const t = seasonR?.trends;
        if (t) input.season = {
          hsrTrend: t.hsr?.trend ?? null, imaTrend: t.imaDensity?.trend ?? null,
          forward: t.direction?.forward ?? null, backward: t.direction?.backward ?? null, lateral: t.direction?.lateral ?? null,
          confidence: mapConf(t.confidence),
        };
        if (styleR?.hasData && styleR?.style?.label) input.style = { label: styleR.style.label, confidence: mapConf(styleR?.style?.confidence) ?? "medium" };
        // Small position group → hedge the "unusual for the role" claim (the CF n≈2–3 caveat).
        const nPlayers = styleR?.positionRef?.nPlayers;
        if (input.role) input.role.smallGroup = (typeof nPlayers === "number" && nPlayers <= 4) || input.role.confidence === "low";

        setStory(buildPhysicalStory(input));
      } catch { if (alive) setStory(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{is ? "Set saman söguna…" : "Assembling the story…"}</div>;
  if (!story || !story.hasData) return null;

  return (
    <div className="rounded-xl border-2 border-[#2740e6]/25 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#2740e6]">{is ? "Heildarmynd" : "The whole picture"}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{is ? "vissa" : "conf"}: {is ? CONF_LABEL[story.confidence].is : CONF_LABEL[story.confidence].en}</span>
      </div>

      {/* Level 0 — verdict */}
      <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">{is ? story.verdict.is : story.verdict.en}</p>

      {/* Level 1 — facts, each tagged with (and linking to) its source card */}
      <ul className="mt-2 space-y-1.5">
        {story.facts.map((f, i) => (
          <li key={i} className="text-[13px] text-slate-700">
            • {is ? f.text.is : f.text.en}{" "}
            <button onClick={() => scrollToCard(f.anchor)} className="align-baseline rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200 hover:text-[#2740e6]">
              {is ? f.source.is : f.source.en} ↓
            </button>
          </li>
        ))}
      </ul>

      {story.smallGroupNote && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">⚠ {is ? story.smallGroupNote.is : story.smallGroupNote.en}</p>
      )}

      {/* Level 2 — reconcile the tensions (never jump 0 → 2) */}
      {story.reconciliations.length > 0 && (
        <>
          <button onClick={() => setOpen((s) => !s)} className="mt-3 text-xs font-medium text-[#2740e6] hover:underline">
            {open ? (is ? "Fela heildar-lestur" : "Hide the full read") : (is ? "Sýna heildar-lestur" : "Show the full read")}
          </button>
          {open && (
            <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Að samræma kortin" : "Reconciling the cards"}</div>
              {story.reconciliations.map((r, i) => <p key={i} className="text-[12px] text-slate-700">{is ? r.is : r.en}</p>)}
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-[10px] text-slate-400">{is ? "Reglur reikna — ekki gervigreind. Sett saman úr kortunum að neðan; snertir aldrei readiness-litinn." : "Rules compute — not AI. Assembled from the cards below; never touches the readiness colour."}</p>
    </div>
  );
}
