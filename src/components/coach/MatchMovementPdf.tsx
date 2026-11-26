"use client";

/**
 * MatchMovementPdf — a shareable "how the squad moved vs its norm" report for a
 * single match. Mirrors the on-screen Match Movement (squad + norm) view so the
 * export shows exactly what the coach sees (manifesto: one source, one verdict).
 *
 * Explainability-first layout (landscape, shared MicroPulse PDF kit):
 *   rule-based verdict (how many dimensions sat outside the usual range) → the 2-3
 *   biggest squad deviations as plain facts → the squad table → the AI summary
 *   (labelled AI) → each player vs own norm → what the dimensions mean + how to read it.
 *
 * "Norm" = each player's own match average (and, for the team headline, the
 * squad's season average). Deviation is framed as distance-from-usual — a
 * descriptive movement read (Niklas: Engine = GPS output, Driver = IMA how) —
 * NOT an injury-risk score. Variant-aware: IMA dims for Pro, GPS dims for
 * Core/Lite (no new data — reuses the computeMatchMovement result).
 *
 * Squad numbers come from `squadVsUsual` (touchline warm-up rows out, as on screen);
 * "outside the usual range" is `significanceThreshold` — long runs 50%, accel:decel 30%, others 20%.
 */

import type { ReactNode } from "react";
import { Document, Text, View } from "@react-pdf/renderer";
import { movementDimensions, DIM_DEFS, significanceThreshold } from "@/lib/micropulse/matchMovement/types";
import type { MatchMovementResult, MovementDimension } from "@/lib/micropulse/matchMovement/types";
import { squadVsUsual, relDeviation, longRunsLine } from "@/lib/micropulse/matchMovement/squadSummary";
import { AiBox, BrandPage, C, Card, FactRow, KeyValues, Provenance, Section, Table, Verdict, fb, renderPdfBlob, saveBlob } from "@/components/pdf/brand";
function fmtDev(rel: number | null, kind: MovementDimension["kind"]): string {
  if (rel == null) return "—";
  const m = Math.round(rel);
  const s = m > 0 ? "+" : "";
  return kind === "pct" ? `${s}${m} pts` : `${s}${m}%`;
}
// Neutral, distance-from-usual palette (NOT good/bad): above usual = cobalt,
// below usual = gold, within the usual range = muted. Kit tokens only.
function devColor(rel: number | null, key: string): string {
  if (rel == null) return C.faint;
  if (Math.abs(rel) < significanceThreshold(key)) return C.mute;
  return rel > 0 ? C.cobalt : C.amberText;
}

function fmtDate(iso: string, is: boolean): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString(is ? "is-IS" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const fv = (v: number | null | undefined, d: MovementDimension) => (v != null ? v.toFixed(d.kind === "ratio" ? 2 : 1) : "—");

function MovementDoc({ result, squadMatch, teamName, lang, aiSummary }: { result: MatchMovementResult; squadMatch: string; teamName: string; lang: "IS" | "EN"; aiSummary?: string }) {
  const is = lang === "IS";
  const dims = movementDimensions(result.variant);
  // Squad this match vs the squad's usual (warm-up rows out, estimates out of the usual).
  const sq = squadVsUsual(result, squadMatch);
  const playerRows = sq.counted;
  const lrLine = longRunsLine(sq.longRuns, is);
  const generated = new Date().toLocaleDateString(is ? "is-IS" : "en-US");
  const variantLabel = result.variant === "gps" ? (is ? "GPS-hreyfing (Core/Lite)" : "GPS movement (Core/Lite)") : (is ? "IMA-hreyfing (Pro)" : "IMA movement (Pro)");

  // Squad rows — the same numbers as the on-screen team headline.
  const squad = sq.dims.map(({ d, cur, base, rel, flagged: sig }) => {
    const word = rel == null ? "" : rel > 0 ? (is ? d.moreIS : d.moreEN) : (is ? d.lessIS : d.lessEN);
    return { d, cur, base, rel, sig, word: sig ? word : (is ? "eins og venjulega" : "as usual") };
  });

  // Layer 0 — rule-based verdict: how many dimensions sat outside the usual range.
  const off = squad.filter((x) => x.sig).sort((a, b) => Math.abs((b.rel ?? 0) / significanceThreshold(b.d.key)) - Math.abs((a.rel ?? 0) / significanceThreshold(a.d.key)));
  const known = squad.filter((x) => x.rel != null).length;
  const headline = off.length === 0
    ? (is ? `Liðið hreyfði sig eins og venjulega - allir ${known} mælikvarðar innan venjulegs bils.` : `The squad moved as usual - all ${known} dimensions within the usual range.`)
    : is
      ? `Liðið hreyfði sig öðruvísi en venjulega á ${off.length} af ${known} mælikvörðum: ${off.slice(0, 2).map((x) => `${x.word} (${fmtDev(x.rel, x.d.kind)})`).join(", ")}.`
      : `The squad moved differently from usual on ${off.length} of ${known} dimensions: ${off.slice(0, 2).map((x) => `${x.word} (${fmtDev(x.rel, x.d.kind)})`).join(", ")}.`;
  const verdictBody = is
    ? "Frávik = fjarlægð frá venju liðsins (tímabils-meðaltal), EKKI meiðslaáhætta. Reglur reikna - ekki AI."
    : "Deviation = distance from the squad's usual (season average), NOT an injury-risk score. Rules compute - not AI.";
  const confidence = `${playerRows.length} ${is ? "leikmenn" : "players"} · ${result.matchDates.length} ${is ? "leikir í venju" : "matches in the norm"}`;

  // Layer 1 — the biggest squad deviations as plain facts (fall back to the largest moves).
  const factSrc = (off.length ? off : [...squad].filter((x) => x.rel != null).sort((a, b) => Math.abs((b.rel ?? 0) / significanceThreshold(b.d.key)) - Math.abs((a.rel ?? 0) / significanceThreshold(a.d.key)))).slice(0, 3);
  const facts = factSrc.map((x) => ({
    value: fmtDev(x.rel, x.d.kind),
    label: is ? x.d.is : x.d.en,
    sub: `${x.word} · ${fv(x.cur, x.d)} / ${fv(x.base, x.d)}`,
    tone: x.sig ? ((x.rel ?? 0) > 0 ? ("cobalt" as const) : ("amber" as const)) : undefined,
  }));

  const devCell = (rel: number | null, d: MovementDimension) => (
    <Text style={[fb(600), { fontSize: 8.5, color: devColor(rel, d.key), textAlign: "right" }]}>{fmtDev(rel, d.kind)}</Text>
  );

  return (
    <Document>
      <BrandPage
        orientation="landscape"
        doc={is ? "Leikhreyfing" : "Match movement"}
        context={teamName}
        kicker={is ? "Liðið vs venjan" : "Squad vs norm"}
        title={is ? "Leikmanna-hreyfing — liðið vs venjan" : "Player Match Movement — squad vs norm"}
        subtitle={`${fmtDate(squadMatch, is)} · ${playerRows.length} ${is ? "leikmenn" : "players"} · ${variantLabel} · ${is ? "búið til" : "generated"} ${generated}`}
        chips={[{ text: variantLabel }]}
        note={is ? "Lýsandi hreyfi-lestur, ekki meiðslaáhætta. Reglur reikna; AI útskýrir." : "Descriptive movement read, not an injury-risk score. Rules compute; AI explains."}
      >
        <Verdict label={is ? "Hreyfing liðsins" : "Squad movement"} headline={headline} body={verdictBody} confidence={confidence} />
        {facts.length ? <FactRow facts={facts} /> : null}

        {/* Team headline: squad this match vs the squad's usual */}
        <Section title={is ? "Hvernig liðið hreyfði sig vs venjan" : "How the squad moved vs its usual"} hint={is ? "Gildi í þessum leik / venja liðsins (tímabils-meðaltal)." : "Value this match / the squad's usual (season average)."} wrap={false}>
          <Table
            cols={[
              { label: is ? "Mælikvarði" : "Dimension", flex: 2 },
              { label: is ? "Leikur / venja" : "Match / usual", flex: 1, align: "right" },
              { label: is ? "Frávik" : "Deviation", flex: 1, align: "right" },
              { label: is ? "Lestur" : "Read", flex: 1.6, align: "right" },
            ]}
            rows={squad.map((x) => [
              is ? x.d.is : x.d.en,
              <Text key="v" style={[fb(400), { fontSize: 8.5, textAlign: "right" }]}>{fv(x.cur, x.d)}<Text style={{ color: C.faint }}>{` / ${fv(x.base, x.d)}`}</Text></Text>,
              devCell(x.rel, x.d),
              <Text key="w" style={[fb(400), { fontSize: 8.25, color: C.mute, textAlign: "right" }]}>{x.word}</Text>,
            ])}
            dense
          />
          {lrLine ? <Text style={[fb(400), { fontSize: 8.5, color: C.ink, marginTop: 5 }]}>{lrLine}</Text> : null}
        </Section>

        {/* AI summary — the same narrative the "Explain" button writes on screen.
            Labelled as AI and written from the numbers (manifesto). */}
        {aiSummary ? (
          <View wrap={false}>
            <AiBox
              label={is ? "AI-SAMANTEKT - SKRIFUÐ ÚR TÖLUNUM, EKKI LÆKNISFRÆÐILEGT MAT" : "AI SUMMARY - WRITTEN FROM THE NUMBERS, NOT A MEDICAL JUDGEMENT"}
              body={aiSummary}
              cites={is ? "Skrifað úr tölunum í þessari skýrslu — ekki læknisfræðilegt mat. Reglur reikna; AI útskýrir." : "Written from the numbers in this report — not a medical judgement. Rules compute; AI explains."}
            />
          </View>
        ) : null}

        {/* Per-player deviation from each player's own norm */}
        <Section title={is ? "Hver leikmaður vs sín eigin venja (% frávik)" : "Each player vs own norm (% deviation)"} hint={is ? "Kóbalt = yfir venju, gull = undir venju, dauft = innan venjulegs bils." : "Cobalt = above usual, gold = below usual, muted = within the usual range."}>
          <Table
            cols={[{ label: is ? "Leikmaður" : "Player", flex: 1.6 }, ...dims.map((d) => ({ label: is ? d.is : d.en, flex: 1, align: "right" as const }))]}
            rows={playerRows.map((r) => {
              const norm = result.playerAverages[r.player_id] ?? {};
              return [r.name, ...dims.map((d) => devCell(relDeviation(r.fingerprint[d.key], norm[d.key], d.kind), d))];
            })}
            dense
          />
          {sq.notCounted.length ? (
            <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: 5 }]}>
              {(is ? "Ekki talið með (upphitun á hliðarlínu, ekki leikhreyfing): " : "Not counted (touchline warm-up, not match movement): ") + sq.notCounted.map((r) => r.name).join(", ") + "."}
            </Text>
          ) : null}
        </Section>

        {/* Explainability — the same plain per-dimension definitions the coach
            sees on screen, so the export explains its numbers (manifesto). */}
        <Section title={is ? "Hvað mælikvarðarnir þýða" : "What the dimensions mean"} wrap={false}>
          <Card>
            <KeyValues
              labelWidth={190}
              rows={dims.map((d) => {
                const def = DIM_DEFS[d.key];
                return [is ? d.is : d.en, <Text key={d.key} style={[fb(400), { fontSize: 8.5, flex: 1, lineHeight: 1.35 }]}>{def ? (is ? def.is : def.en) : ""}</Text>] as [string, ReactNode];
              })}
            />
            <Provenance>
              {is
                ? "Lestur: hver mælikvarði er borinn saman við venju leikmannsins (eða liðsins). Frávik = fjarlægð frá venju, EKKI meiðslaáhætta. Kóbalt = yfir venju, gull = undir venju, dauft = innan venjulegs bils (20% frá venju; vinstri/hægri 10 stig). Hröðun : Hemlun er hlutfall tveggja talna og sveiflast meira, svo það telst öðruvísi við 30%. Löng hlaup sveiflast um 30% milli leikja að eðlisfari, svo þau teljast öðruvísi fyrst við 50%; þau segja hve lengi hann hélt áfram að hlaupa, ekki hve hratt. „Venja“ = meðaltal leikmanns yfir leiki. Engine (GPS) = hversu mikið; Driver (IMA) = hvernig hann hreyfist. Staðlað á mínútu. Reglur reikna — ekki AI. Gregson 2010 (leikir sveiflast mikið, svo hver leikur er borinn saman við hans venju), di Prampero 2015."
                : "How to read it: each dimension is compared to the player's (or squad's) usual. Deviation = distance from usual, NOT an injury-risk score. Cobalt = above usual, gold = below usual, muted = within the usual range (20% from usual; left/right 10 pts). Accel : Decel is a ratio of two counts and swings more, so it counts as different at 30%. Long runs swing about 30% between matches by nature, so they count as different only at 50%; they say how long he kept running, not how fast. \"Norm\" = the player's match average. Engine (GPS) = how much; Driver (IMA) = how they move. Normalised per minute. Rules compute — not AI. Gregson 2010 (matches vary a lot, so each is read against his own usual), di Prampero 2015."}
            </Provenance>
          </Card>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadMatchMovementPdf(
  result: MatchMovementResult,
  squadMatch: string,
  teamName: string,
  lang: "IS" | "EN",
  aiSummary?: string,
) {
  const blob = await renderPdfBlob(() => <MovementDoc result={result} squadMatch={squadMatch} teamName={teamName} lang={lang} aiSummary={aiSummary} />);
  saveBlob(blob, `match-movement-${squadMatch}.pdf`);
}
