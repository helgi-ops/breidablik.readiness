"use client";

/**
 * Left/right asymmetry to review (strength-day-rules brief §4b, 2026-11-23), on the coach's strength page.
 *
 * A gap ≥ 10% no longer swaps the lift on its own. Each player with a gap is listed with one tap:
 *   "One leg at a time" → the engine swaps to the one-leg lift for 28 days;
 *   "Keep two-leg"      → the lift stays (e.g. the kicking leg, an old injury the physio knows).
 * Every tap is logged (asymmetry_reviews) and today's automatic session is rebuilt.
 * Layered read: one sentence → the players and their gap → the rule and the study behind "Show details".
 * Never the readiness colour. Renders nothing when no player has a gap.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Item = {
  playerId: string;
  name: string;
  pct: number;
  source: "VALD" | "IMA CoD";
  weaker: "L" | "R" | null;
  review: { decision: "swap" | "keep"; decidedAt: string } | null;
};

const accessToken = async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;

async function fetchItems(): Promise<Item[]> {
  const tk = await accessToken();
  if (!tk) return [];
  try {
    const res = await fetch("/api/coach/asymmetry-review", { headers: { Authorization: `Bearer ${tk}` } });
    const j = await res.json();
    return res.ok ? (j.items as Item[]) : [];
  } catch {
    return [];
  }
}

export default function AsymmetryReviewCard({ lang }: { lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const t = (en: string, isText: string) => (is ? isText : en);
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchItems().then((x) => { if (alive) setItems(x); });
    return () => { alive = false; };
  }, [tick]);

  const decide = async (it: Item, decision: "swap" | "keep") => {
    const tk = await accessToken();
    if (!tk) return;
    setBusy(it.playerId);
    setError(null);
    try {
      const res = await fetch("/api/coach/asymmetry-review", {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: it.playerId, decision, asymPct: it.pct, source: it.source }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  if (!items || items.length === 0) return null;
  const waiting = items.filter((i) => !i.review).length;
  const side = (s: Item["weaker"]) => (s === "L" ? t("left weaker", "vinstri veikari") : s === "R" ? t("right weaker", "hægri veikari") : "");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-[15px] font-bold text-slate-900">{t("Left/right gap to review", "Munur vinstri/hægri til yfirferðar")}</h2>
      <p className="mt-1 text-[13px] font-semibold text-slate-800">
        {waiting > 0
          ? t(
              `${waiting} player${waiting === 1 ? " has" : "s have"} a left/right gap of 10% or more. The lift stays two-leg until you confirm.`,
              `${waiting} ${waiting === 1 ? "leikmaður er" : "leikmenn eru"} með 10% mun eða meira á milli fóta. Lyftan helst á tveimur fótum þar til þú staðfestir.`,
            )
          : t("Every gap is reviewed. Decisions hold 28 days.", "Búið að fara yfir allan mun. Ákvarðanir gilda í 28 daga.")}
      </p>
      <ul className="mt-3 divide-y divide-slate-100">
        {items.map((it) => (
          <li key={it.playerId} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-slate-900">{it.name}</span>
              <span className="block text-[12px] text-slate-500">
                {Math.round(it.pct)}% · {it.source === "VALD" ? t("strength test (VALD)", "styrkpróf (VALD)") : t("turns in training (GPS)", "snúningar á æfingu (GPS)")}
                {it.weaker ? ` · ${side(it.weaker)}` : ""}
              </span>
              {it.review && (
                <span className="block text-[12px] text-slate-600">
                  {it.review.decision === "swap"
                    ? t(`One leg at a time since ${it.review.decidedAt.slice(0, 10)}`, `Einn fótur í einu frá ${it.review.decidedAt.slice(0, 10)}`)
                    : t(`Kept two-leg on ${it.review.decidedAt.slice(0, 10)}`, `Haldið á tveimur fótum ${it.review.decidedAt.slice(0, 10)}`)}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy === it.playerId || it.review?.decision === "swap"}
                onClick={() => decide(it, "swap")}
                className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                {t("One leg at a time", "Einn fótur í einu")}
              </button>
              <button
                type="button"
                disabled={busy === it.playerId || it.review?.decision === "keep"}
                onClick={() => decide(it, "keep")}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-40"
              >
                {t("Keep two-leg", "Halda tveimur fótum")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[12px] text-red-700">{error}</p>}
      <button type="button" onClick={() => setDetails((d) => !d)} className="mt-2 text-[12px] font-semibold text-primary">
        {details ? t("Hide details", "Fela nánar") : t("Show details", "Sýna nánar")}
      </button>
      {details && (
        <div className="mt-2 space-y-1 text-[12px] text-slate-600">
          <p>{t(
            "A gap can come from many things: the kicking leg, an old injury, a poor test. So the session does not change until you or the physio have looked. \"One leg at a time\" swaps the main lift to its one-leg version and starts with the weaker side; it holds 28 days, then the player is up for review again if the gap is still there.",
            "Munur getur komið af mörgu: sparkfæti, gömlum meiðslum, lélegu prófi. Því breytist æfingin ekki fyrr en þú eða sjúkraþjálfari hafið skoðað. „Einn fótur í einu“ skiptir aðallyftunni í einfóta útgáfu og byrjar á veikari hliðinni; það gildir í 28 daga og leikmaðurinn kemur aftur til yfirferðar ef munurinn er enn til staðar.",
          )}</p>
          <p>{t(
            "Where the % comes from: the larger of the NordBord / ForceFrame / jump test gap (last 120 days) and the turn-count gap in training (GPS, last 14 days). Bishop 2020: a gap of about 10–15% can matter for performance and injury. The 10% line and the 28 days are MicroPulse's rule.",
            "Hvaðan % kemur: stærri munurinn af NordBord / ForceFrame / stökkprófi (síðustu 120 dagar) og mun á snúningum á æfingu (GPS, síðustu 14 dagar). Bishop 2020: um 10–15% munur getur skipt máli fyrir getu og meiðsli. 10% línan og 28 dagarnir eru regla MicroPulse.",
          )}</p>
        </div>
      )}
    </section>
  );
}
