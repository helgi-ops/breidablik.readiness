"use client";

/**
 * Programme Library "Speed & power" tab: one tab, four qualities — the same four a player can pick as a goal
 * (top speed, acceleration, braking, jump). Each quality shows its method library and three plans with a PDF.
 * Coach-only reference: nothing here is sent to a player.
 *
 * Lota 4: the coach picks a level per quality and can swap exercises; both are saved for the team
 * (`/api/coach/team/quality-plan-prefs`). If saving is not possible (no team, FREE lock), the choices still work on
 * this screen and the page says they are not saved.
 */

import { useCallback, useEffect, useState } from "react";
import SpeedMethodLibrary from "@/components/trainer/SpeedMethodLibrary";
import QualityMethodLibrary from "@/components/trainer/QualityMethodLibrary";
import { QUALITY_LIBRARIES } from "@/lib/micropulse/goalPlan/qualityLibrary";
import { GOAL_QUALITIES, type Bi, type GoalQuality } from "@/lib/micropulse/goalPlan/types";
import { DEFAULT_LEVEL, type TrainingLevel } from "@/lib/micropulse/goalPlan/levels";
import { PLANNED, type SwapChoices, type SwapSlotKey } from "@/lib/micropulse/goalPlan/swaps";
import { authFetch } from "@/lib/client/authFetch";

type Lang = "IS" | "EN";

const PILL: Record<GoalQuality, Bi> = {
  top_speed: { en: "Top speed", is: "Hámarkshraði" },
  acceleration: { en: "Acceleration", is: "Hröðun" },
  braking: { en: "Braking", is: "Bremsun" },
  jump: { en: "Jump", is: "Stökk" },
};

type Pref = { level: TrainingLevel; swaps: SwapChoices; updatedAt: string | null; updatedBy: string | null };
type Prefs = Record<GoalQuality, Pref>;
/** loading → saved (team prefs read) | local (cannot save: choices hold on this screen only). */
type Store = "loading" | "saved" | "local";

const API = "/api/coach/team/quality-plan-prefs";
const EMPTY: Pref = { level: DEFAULT_LEVEL, swaps: {}, updatedAt: null, updatedBy: null };
const emptyPrefs = (): Prefs => ({ top_speed: EMPTY, acceleration: EMPTY, braking: EMPTY, jump: EMPTY });

function when(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SpeedPowerLibrary({ lang }: { lang: Lang }) {
  const [q, setQ] = useState<GoalQuality>("top_speed");
  const [prefs, setPrefs] = useState<Prefs>(emptyPrefs);
  const [store, setStore] = useState<Store>("loading");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const IS = lang === "IS";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(API, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { prefs?: Partial<Record<GoalQuality, Pref>> };
        if (!alive) return;
        setPrefs((prev) => {
          const next = { ...prev };
          for (const k of GOAL_QUALITIES) if (j.prefs?.[k]) next[k] = { ...EMPTY, ...j.prefs[k] };
          return next;
        });
        setStore("saved");
      } catch {
        if (alive) setStore("local");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(
    async (quality: GoalQuality, patch: { level?: TrainingLevel; swaps?: SwapChoices }) => {
      // The screen changes at once; the team copy follows.
      setPrefs((prev) => ({ ...prev, [quality]: { ...prev[quality], ...patch } }));
      if (store !== "saved") return;
      setSaving(true);
      setSaveErr(false);
      try {
        const res = await authFetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quality, ...patch }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { pref?: Pref | null };
        if (j.pref) {
          const pref = j.pref;
          setPrefs((prev) => ({ ...prev, [quality]: { ...EMPTY, ...pref } }));
        }
      } catch {
        setSaveErr(true);
      } finally {
        setSaving(false);
      }
    },
    [store],
  );

  const cur = prefs[q];
  // No changes until the team's saved choices are read, so a quick click is never lost.
  const busy = saving || store === "loading";
  const setLevel = (lv: TrainingLevel) => void save(q, { level: lv });
  const onSwap = (slot: SwapSlotKey, option: string) => {
    const next: SwapChoices = { ...cur.swaps };
    if (option === PLANNED) delete next[slot];
    else next[slot] = option;
    void save(q, { swaps: next });
  };

  const status = (() => {
    if (store === "loading") return null;
    if (store === "local") {
      return IS
        ? "Ekki vistað fyrir liðið: stig og skipti gilda aðeins á þessum skjá."
        : "Not saved for the team: level and swaps only hold on this screen.";
    }
    if (saveErr) return IS ? "Tókst ekki að vista síðustu breytingu. Reyndu aftur." : "Could not save the last change. Try again.";
    if (saving) return IS ? "Vista…" : "Saving…";
    const base = IS ? "Stig og skipti eru vistuð fyrir liðið." : "Level and swaps are saved for the team.";
    if (!cur.updatedAt) return base;
    const by = cur.updatedBy ? (IS ? ` af ${cur.updatedBy}` : ` by ${cur.updatedBy}`) : "";
    return `${base} ${IS ? "Síðast breytt" : "Last changed"}${by} ${when(cur.updatedAt, lang)}.`;
  })();

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label={IS ? "Eiginleiki" : "Quality"}>
        {GOAL_QUALITIES.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === q}
            onClick={() => setQ(k)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              k === q ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {L(PILL[k])}
          </button>
        ))}
      </div>
      {status && (
        <p className={`-mt-3 mb-4 text-xs ${saveErr ? "text-red-700" : "text-slate-500"}`} role="status">
          {status}
        </p>
      )}
      {q === "top_speed" ? (
        <SpeedMethodLibrary lang={lang} level={cur.level} onLevel={setLevel} levelBusy={busy} swaps={cur.swaps} onSwap={onSwap} />
      ) : (
        <QualityMethodLibrary
          key={q}
          lib={QUALITY_LIBRARIES[q]}
          lang={lang}
          level={cur.level}
          onLevel={setLevel}
          levelBusy={busy}
          swaps={cur.swaps}
          onSwap={onSwap}
        />
      )}
    </div>
  );
}
