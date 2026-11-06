"use client";

/**
 * PeriodizationBlockPdf — a scheduled mesocycle as a match-anchored calendar.
 *
 * Summary first: the block in one line, the match unit as plain facts (+ the IMA axis where the
 * feed carries it), the weekly progressive-overload table (training total as % of one match, per
 * dimension), and the MD microcycle template. Then session-by-session Mon–Sun tables for the whole
 * block — absolute DIST/HSR/LOAD, day-type row tints (the day-type word is always printed), rest days as
 * dashes, a friendly (MD-0) alternating Sat/Sun.
 *
 * Numbers scale from the scope's own match unit; a starting point, never a norm (Little & Buchheit).
 * Descriptive — never the readiness colour.
 *
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import type { CalendarBlock, CalType, Bi } from "@/lib/micropulse/periodization/index";
import { BrandPage, Bullets, C, Chip, FactRow, Provenance, Section, StatGrid, TONE, Table, Verdict, clean, fb, fh, renderPdfBlob, saveBlob, type Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";
export type PeriodizationBlockPayload = { teamName: string; block: CalendarBlock; generatedAt?: string; isKinexon?: boolean };

/** Day-type → kit tone (row tint + label colour). The day-type label is always printed next to it. */
const CAL_TONE: Record<CalType, Tone | null> = { mechanical: "red", locomotive: "green", mixed: "cobalt", activation: "neutral", topup: "rtp", match: "amber", rest: null };
/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");

const L = {
  EN: { plan: "Periodization Plan", block: "Week Block", anchored: "match-anchored · individualised to", team: "the squad", doc: "Periodization plan",
    tag: "Recommended from the team's own data - the coach decides and overrides",
    unitTitle: "The match is the unit",
    unitLead: "One near-full match (median, ≥80 min) - the multiple every training week is scaled from.",
    dist: "Distance", hsr: "HSR (V5+V6)", load: "Player Load", accdec: "Acc + Dec",
    accB: "Acc B2–3", decB: "Dec B2–3", strideL: "Stride", dirL: "IMA dir", rhieL: "RHIE", symL: "Symmetry", metL: "Met power",
    fwd: "fwd", lat: "lat", back: "back", imaLead: "Mechanical / IMA - the same match unit on the movement axis (present where the feed carries it).",
    rampHold: "The weekly load — standard week", rampNarrHold: "A competitive block holds the standard week every week: no step between weeks, the week moves with the fixtures and any light week the coach picks (Malone 2015; Oliveira 2019; observational). Running axes stay at or under the match; mechanical work over-shoots it by design.", holdRead: (hi: number) => `Weekly running volume holds the standard week, up to ${hi}% of one match`,
    ramp: "Progressive overload — weekly ramp", rampNarr: "Each KPI ramps at its own rate — volume (distance, Player Load) climbs fastest, HSR + stride slowest with the tightest ceilings (hamstring exposure; Malone 2017, Gabbett 2016) — up to a peak, with a deload in pre-season. Running axes build TO match and hold there; mechanical work over-shoots the match by design. The note under each week says what held it.",
    week: "Week", intent: "Intent", running: "Running dist", mech: "Mechanical", rest: "Rest days", light: "Light week", deload: "Deload", match: "match",
    theWeek: "The week — matchday-anchored microcycle", weekNarr: "Built around a weekly friendly (MD-0) that alternates Saturday / Sunday. After the match: a light top-up (MD+1), then a full day off (MD+2). Sessions are spaced so there are never more than three in a row — often just two — with HSR (Locomotive) and mechanical work on separate days to protect the posterior chain. A pre-season deload week adds rest.",
    md: "MD", dayType: "Day-type", whatItIs: "What it is",
    sbs: "Session-by-session — the full block", sbsNarr: "Absolute per-session targets, scaled from the match unit by the day-type and the week multiplier. DIST and HSR in metres; LOAD in Player Load (AU). Rest days shown as dashes.",
    day: "Day", focus: "Focus", footer: "MicroPulse — Periodization Plan",
    summary: (n: number, who: string) => `A ${n}-week block, match-anchored for ${who}.`,
    peak: (hi: number, wk: number) => `Weekly running volume peaks at ${hi}% of one match in week ${wk}`, deloadIn: (w: string) => `deload in week ${w}`, lightIn: (w: string) => `light week in week ${w}`, restTotal: (n: number) => `${n} rest days in total`,
    foot: "Descriptive planning — never sets the readiness colour, never overrides the daily decision. Targets scale from the scope's own match unit (median of near-full matches ≥80 min) by each day-type's share of the match and the week multiplier; a data-anchored starting point, not a norm to obey (Little & Buchheit). No single \"% of match\" — mechanical over-shoots, HSR/sprint fall short (Figueiredo). Cites: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." },
  IS: { plan: "Tímabilsáætlun", block: "vikna lota", anchored: "leik-fest · einstaklingsmiðað fyrir", team: "liðið", doc: "Tímabilsáætlun",
    tag: "Ráðlagt út frá eigin gögnum liðsins - þjálfarinn ákveður og hnekkir",
    unitTitle: "Leikurinn er einingin",
    unitLead: "Einn næstum-heill leikur (miðgildi, ≥80 mín) - margfeldið sem hver æfingavika skalar frá.",
    dist: "Vegalengd", hsr: "Háhraði (V5+V6)", load: "Player Load", accdec: "Acc + Dec",
    accB: "Acc B2–3", decB: "Dec B2–3", strideL: "Skref", dirL: "IMA stefna", rhieL: "RHIE", symL: "Samhverfa", metL: "Efnaafl",
    fwd: "fram", lat: "hlið", back: "aftur", imaLead: "Vélrænt / IMA - sama leikviðmið á hreyfi-ásnum (þar sem gögnin ná).",
    rampHold: "Vikuálag — staðalvika", rampNarrHold: "Keppnislota heldur staðalvikunni allar vikur: ekkert þrep milli vikna, vikan breytist með leikjunum og léttri viku ef þjálfarinn velur hana (Malone 2015; Oliveira 2019; athugunarrannsóknir). Hlaupa-ásarnir haldast við eða undir leik; vélrænt fer yfir leikinn viljandi.", holdRead: (hi: number) => `Vikulegt hlaupamagn heldur staðalvikunni, allt að ${hi}% af einum leik`,
    ramp: "Stígandi álag — vikuleg þróun", rampNarr: "Hvert mæligildi hækkar á sínum hraða — magn (vegalengd, Player Load) hraðast, háhraði + skref hægast með þéttustu þökin (aftanlæris-áhætta; Malone 2017, Gabbett 2016) — upp að toppi, með niðurtröppun í undirbúningi. Hlaupa-ásarnir byggja AÐ leik og halda þar; vélrænt fer yfir leikinn viljandi. Nótan undir hverri viku segir hvað hélt henni.",
    week: "Vika", intent: "Markmið", running: "Hlaup vegal.", mech: "Vélrænt", rest: "Hvíldard.", light: "Létt vika", deload: "Niðurtröppun", match: "leik",
    theWeek: "Vikan — leikdags-fest microcycle", weekNarr: "Byggt um vikulegan æfingaleik (MD-0) sem skiptist á laugardag / sunnudag. Eftir leik: létt áfylling (MD+1), svo heill frídagur (MD+2). Æfingar dreifðar svo aldrei eru fleiri en þrjár í röð — oft bara tvær — með háhraða (Locomotive) og vélrænu á sitt hvorum degi til að vernda afturkeðjuna. Niðurtröppunarvika í undirbúningi bætir við hvíld.",
    md: "MD", dayType: "Dagsgerð", whatItIs: "Hvað það er",
    sbs: "Æfing fyrir æfingu — öll lotan", sbsNarr: "Alger mörk per æfingu, skalað frá leikviðmiðinu eftir dagsgerð og vikumargfeldi. VEGAL og HÁHRAÐI í metrum; ÁLAG í Player Load (AU). Hvíldardagar sýndir sem strik.",
    day: "Dagur", focus: "Áhersla", footer: "MicroPulse — Tímabilsáætlun",
    summary: (n: number, who: string) => `${n} vikna lota, leik-fest fyrir ${who}.`,
    peak: (hi: number, wk: number) => `Vikulegt hlaupamagn nær hámarki ${hi}% af einum leik í viku ${wk}`, deloadIn: (w: string) => `niðurtröppun í viku ${w}`, lightIn: (w: string) => `létt vika í viku ${w}`, restTotal: (n: number) => `${n} hvíldardagar alls`,
    foot: "Lýsandi áætlun — setur aldrei readiness-litinn, hnekkir aldrei daglegu ákvörðuninni. Álagsmörk skala frá eigin leikviðmiði (miðgildi næstum-heilla leikja ≥80 mín) eftir hlutdeild hverrar dagsgerðar og vikumargfeldi; gagna-festur upphafspunktur, ekki viðmið til að hlýða (Little & Buchheit). Ekkert eitt „%-af-leik“ — vélrænt fer yfir, háhraði/sprettur ná ekki (Figueiredo). Vitnar í: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." },
} as const;

const nfmt = (n: number | null) => (n == null ? "-" : n.toLocaleString("en-US"));

function BlockDoc({ payload, lang }: { payload: PeriodizationBlockPayload; lang: Lang }) {
  // Kinexon is indoor LPS, not Catapult IMA — relabel the "/ IMA" movement-axis lead.
  const t = payload.isKinexon
    ? { ...L[lang], imaLead: lang === "IS" ? "Vélrænt - sama leikviðmið á hreyfi-ásnum (þar sem gögnin ná)." : "Mechanical - the same match unit on the movement axis (present where the feed carries it)." }
    : L[lang];
  const bi = (b: Bi) => tx(lang === "IS" ? b.is : b.en);
  const { block } = payload; const u = block.unit;
  const who = block.scopeName === "__team__" ? t.team : `${block.scopeName}${block.scopePos ? ` (${block.scopePos})` : ""}`;
  const dom = (d: { fwd: number; back: number; lat: number }) => { const m = Math.max(d.fwd, d.back, d.lat); const w = m === d.fwd ? t.fwd : m === d.lat ? t.lat : t.back; return `${w} ${Math.round(m * 100)}%`; };
  const dayIma = (d: typeof block.weeks[number]["days"][number]) => {
    const p: string[] = [];
    if (d.accHiEff != null) p.push(`${t.accB} ${d.accHiEff}`);
    if (d.decHiEff != null) p.push(`${t.decB} ${d.decHiEff}`);
    if (d.stride != null) p.push(`${t.strideL} ${d.stride}`);
    if (d.dir) p.push(`${t.dirL}: ${dom(d.dir)}`);
    return p.join("  ·  ");
  };
  const hasMech = u.accHiEff != null || u.stride != null;
  const imaChips: Array<{ n: string; l: string }> = [];
  if (u.accHiEff != null) imaChips.push({ n: nfmt(u.accHiEff), l: t.accB });
  if (u.decHiEff != null) imaChips.push({ n: nfmt(u.decHiEff), l: t.decB });
  if (u.stride != null) imaChips.push({ n: nfmt(u.stride), l: t.strideL });
  if (u.dirFwd != null && u.dirBack != null && u.dirLat != null) imaChips.push({ n: dom({ fwd: u.dirFwd, back: u.dirBack, lat: u.dirLat }), l: t.dirL });
  if (u.rhie != null) imaChips.push({ n: nfmt(u.rhie), l: t.rhieL });
  if (u.symmetry != null) imaChips.push({ n: `${u.symmetry}`, l: t.symL });
  if (u.metPower != null) imaChips.push({ n: `${u.metPower}`, l: t.metL });

  // Layer 0 — a rule-built one-line read of the block (from the same week rows the tables print).
  const run = block.weeks.map((w) => w.pctRunning).filter((v): v is number => v != null);
  const peakIdx = block.weeks.reduce((bi_, w, i) => ((w.pctRunning ?? -1) > (block.weeks[bi_]?.pctRunning ?? -1) ? i : bi_), 0);
  const deloads = block.weeks.filter((w) => w.isDeload && !w.isLight).map((w) => String(w.index + 1));
  const lights = block.weeks.filter((w) => w.isLight).map((w) => String(w.index + 1));
  const restTotal = block.weeks.reduce((a, w) => a + w.restDays, 0);
  const body = [run.length ? (block.hold ? t.holdRead(Math.max(...run)) : t.peak(Math.max(...run), peakIdx + 1)) : "", deloads.length ? t.deloadIn(deloads.join(", ")) : "", lights.length ? t.lightIn(lights.join(", ")) : "", t.restTotal(restTotal)].filter(Boolean).join("; ") + ".";

  return (
    <Document>
      {/* PAGE 1 — overview */}
      <BrandPage
        doc={t.doc}
        context={payload.teamName}
        kicker={t.plan}
        title={`${t.plan} - ${block.numWeeks}-${t.block}`}
        subtitle={`${bi(block.phase)} · ${t.anchored} ${who}${payload.generatedAt ? ` · ${payload.generatedAt.slice(0, 10)}` : ""}`}
        chips={[{ text: bi(block.phase) }, { text: `${block.numWeeks} ${lang === "IS" ? "vikur" : "weeks"}`, tone: "cobalt" }]}
        note={t.footer}
      >
        <Verdict tone="neutral" label={t.tag} headline={tx(t.summary(block.numWeeks, who))} body={tx(body)} />

        {/* Layer 1 — the match unit */}
        <Section title={t.unitTitle} hint={tx(t.unitLead)} mt={2}>
          <FactRow
            facts={[
              { value: `${nfmt(u.dist)} m`, label: t.dist },
              { value: `${nfmt(u.hsr)} m`, label: t.hsr },
              { value: `${nfmt(u.load)} AU`, label: t.load },
              { value: nfmt(u.accdec), label: t.accdec },
            ]}
          />
          {imaChips.length > 0 && (
            <>
              <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: -3, marginBottom: 5 }]}>{tx(t.imaLead)}</Text>
              <StatGrid cols={Math.max(4, Math.min(7, imaChips.length))} items={imaChips.map((c) => ({ label: tx(c.l), value: tx(c.n) }))} />
            </>
          )}
        </Section>

        {/* Layer 2 — progressive-overload table */}
        <Section title={tx(block.hold ? t.rampHold : t.ramp)} hint={tx(block.hold ? t.rampNarrHold : t.rampNarr)}>
          <Table
            cols={[
              { label: t.week, width: 50 }, { label: t.intent, flex: 1 },
              { label: t.running, width: 62, align: "right" }, { label: "HSR", width: 46, align: "right" },
              { label: t.mech, width: 62, align: "right", strong: true }, { label: t.rest, width: 52, align: "right" },
            ]}
            rowTone={(i) => (block.weeks[i]?.isDeload ? "amber" : null)}
            rows={block.weeks.map((w) => [
              `${t.week} ${w.index + 1}`,
              <View key="i">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={[fb(600), { fontSize: 8.5 }]}>{bi(w.intent)}</Text>
                  {w.isDeload && (w.isLight ? t.light : t.deload) !== bi(w.intent) ? <Chip text={w.isLight ? t.light : t.deload} tone="amber" /> : null}
                </View>
                {w.capNote ? <Text style={[fb(400), { fontSize: 7, color: C.mute, marginTop: 1 }]}>{bi(w.capNote)}</Text> : null}
              </View>,
              w.pctRunning != null ? `${w.pctRunning}%` : "-",
              w.pctHsr != null ? `${w.pctHsr}%` : "-",
              w.pctMech != null ? `${w.pctMech}%` : "-",
              String(w.restDays),
            ])}
          />
        </Section>

        {/* Microcycle template */}
        <Section title={tx(t.theWeek)} hint={tx(t.weekNarr)}>
          <Table
            cols={[{ label: t.md, width: 50 }, { label: t.dayType, width: 120 }, { label: t.whatItIs, flex: 1 }]}
            rows={block.legend.map((g) => [
              <Text key="m" style={[fh(700), { fontSize: 8.5, color: C.cobalt }]}>{tx(g.md)}</Text>,
              <Text key="l" style={[fb(600), { fontSize: 8.5 }]}>{bi(g.label)}</Text>,
              <Text key="w" style={[fb(400), { fontSize: 8.25, color: C.mute, lineHeight: 1.35 }]}>{bi(g.what)}</Text>,
            ])}
          />
        </Section>

        {/* Session-by-session — flows on from the template (each week kept whole on a page) */}
        <Section title={tx(t.sbs)} hint={tx(t.sbsNarr)}>
          {block.weeks.map((w) => (
            <View key={w.index} wrap={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <Text style={[fh(700), { fontSize: 11 }]}>{`${t.week} ${w.index + 1} - ${bi(w.intent)}`}</Text>
                  {w.isDeload && (w.isLight ? t.light : t.deload) !== bi(w.intent) ? <Chip text={w.isLight ? t.light : t.deload} tone="amber" /> : null}
                </View>
                <Text style={[fb(400), { fontSize: 8, color: C.mute }]}>{tx(`${t.match} ${bi(w.matchDow)} · ×${w.mult.toFixed(2)}`)}</Text>
              </View>
              <Table
                dense
                size={8}
                cols={[
                  { label: t.day, width: 30 }, { label: t.md, width: 36 }, { label: t.dayType, width: 78 }, { label: t.focus, flex: 1 },
                  { label: "DIST", width: 44, align: "right" }, { label: "HSR", width: 38, align: "right" }, { label: "LOAD", width: 40, align: "right", strong: true },
                ]}
                rowTone={(i) => { const d = w.days[i]; return d ? CAL_TONE[d.type] : null; }}
                rows={w.days.map((d) => {
                  const tone = CAL_TONE[d.type];
                  const col = tone ? TONE[tone].text : C.mute;
                  return [
                    bi(d.dow),
                    <Text key="m" style={[fh(700), { fontSize: 7.5, color: col }]}>{tx(d.md)}</Text>,
                    <Text key="l" style={[fb(600), { fontSize: 8, color: col }]}>{bi(d.label)}</Text>,
                    <View key="f">
                      <Text style={[fb(400), { fontSize: 7.75, lineHeight: 1.3 }]}>{bi(d.focus)}</Text>
                      {hasMech && d.type !== "rest" && dayIma(d) !== "" ? <Text style={[fb(400), { fontSize: 6.75, color: C.mute, marginTop: 1 }]}>{tx(dayIma(d))}</Text> : null}
                    </View>,
                    d.dist == null ? "-" : nfmt(d.dist),
                    d.hsr == null ? "-" : nfmt(d.hsr),
                    d.load == null ? "-" : nfmt(d.load),
                  ];
                })}
              />
            </View>
          ))}
        </Section>
        {block.notes.length > 0 && <View style={{ marginTop: 2 }} wrap={false}><Bullets items={block.notes.map((n) => bi(n))} size={8} /></View>}
        <Provenance>{tx(t.foot)}</Provenance>
      </BrandPage>
    </Document>
  );
}

export async function downloadPeriodizationBlockPdf(payload: PeriodizationBlockPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <BlockDoc payload={payload} lang={lang} />);
  const name = payload.block.scopeName === "__team__" ? payload.teamName : payload.block.scopeName;
  saveBlob(blob, `${name.replace(/\s+/g, "-")}-periodization-block.pdf`);
}
