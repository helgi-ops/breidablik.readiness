/**
 * BasketballScoutDeck — a PowerPoint (.pptx) scouting deck a coach presents to players at a team
 * meeting. Built client-side from the same opponent-scouting data as the PDF, plus the tagged clips:
 * uploaded short clips are EMBEDDED so they play offline in PowerPoint; external links (Vimeo/YouTube)
 * become clickable "▶ Play" buttons. Descriptive scouting — never the readiness colour or a verdict.
 */

import PptxGenJS from "pptxgenjs";

type Lang = "EN" | "IS";

export type DeckClip = { action: string; made: boolean | null; period: string | null; clock: string | null; videoDataUri?: string | null; externalUrl?: string | null };
export type DeckPlayer = {
  name: string; ppg: number | null; rpg: number | null; apg: number | null; fgPct: number | null; tpPct: number | null; tpaPg?: number | null;
  tags?: string[]; descriptor?: { en: string; is: string } | null; notes?: { offense: string[]; defense: string[] } | null;
};
export type DeckData = {
  opponentName: string; season?: string | null; games?: number | null;
  record?: { wins: number; losses: number } | null;
  ai?: { headline?: string; summary?: string; strengths?: string[]; weaknesses?: string[]; howToDefend?: string[]; howToAttack?: string[] } | null;
  fourFactors?: { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null } | null;
  shotMap?: { label: string; made: number; att: number; pct: number | null }[] | null;
  playtypes?: { label: string; made: number; att: number; pct: number | null; share: number | null }[] | null;
  keyPlayers: DeckPlayer[];
  attack?: { action: string; defender: string; oppPct: number; att: number }[] | null;
  howToDefend?: string[];
  clipsByPlayer?: Record<string, DeckClip[]> | null;
};

const INK = "14181C", COBALT = "2740E6", BONE = "F4F2EC", GREEN = "1C7A4A", AMBER = "DE9328", RED = "A83E28", MUTE = "575C63", CARD = "FFFFFF", EDGE = "DCD8CC";
const CLIP_LABELS: Record<string, { en: string; is: string }> = {
  "3pt_make": { en: "3PT make", is: "3ja hitt" }, "3pt_miss": { en: "3PT miss", is: "3ja miss" }, drive: { en: "Drive", is: "Drive" },
  post_up: { en: "Post-up", is: "Póstur" }, oreb_putback: { en: "OReb put-back", is: "Sóknarfrák." }, assist: { en: "Assist", is: "Stoðsending" },
  turnover: { en: "Turnover", is: "Tapaður bolti" }, other: { en: "Other", is: "Annað" },
};
const d1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : (Math.round(v * 10) / 10).toString());
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 10) / 10}%`);

export async function downloadBasketballScoutDeck(data: DeckData, lang: Lang): Promise<void> {
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const clabel = (a: string) => (is ? CLIP_LABELS[a]?.is ?? a : CLIP_LABELS[a]?.en ?? a);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
  pptx.layout = "W";
  const W = 13.333, M = 0.6;

  // Section header bar used on every content slide.
  const header = (slide: PptxGenJS.Slide, kicker: string, title: string) => {
    slide.background = { color: BONE };
    slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.12, fill: { color: COBALT } });
    slide.addText(kicker.toUpperCase(), { x: M, y: 0.32, w: W - 2 * M, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: COBALT, charSpacing: 2 });
    slide.addText(title, { x: M, y: 0.58, w: W - 2 * M, h: 0.6, fontFace: "Arial", fontSize: 26, bold: true, color: INK });
  };
  const foot = (slide: PptxGenJS.Slide) => slide.addText(t("Descriptive scouting — never a readiness or medical judgement.", "Lýsandi skátun — aldrei readiness- eða læknisfræðilegt mat."), { x: M, y: 7.08, w: W - 2 * M, h: 0.3, fontFace: "Arial", fontSize: 8, color: MUTE, italic: true });

  // ── 1. Title ──
  const s1 = pptx.addSlide();
  s1.background = { color: INK };
  s1.addShape("rect", { x: 0, y: 3.95, w: W, h: 0.06, fill: { color: COBALT } });
  s1.addText(t("TEAM MEETING · SCOUTING REPORT", "LIÐSFUNDUR · SKÁTASKÝRSLA"), { x: M, y: 2.5, w: W - 2 * M, h: 0.4, fontFace: "Arial", fontSize: 14, bold: true, color: "9AA3C9", charSpacing: 3 });
  s1.addText(data.opponentName, { x: M, y: 2.95, w: W - 2 * M, h: 1.0, fontFace: "Arial", fontSize: 48, bold: true, color: "FFFFFF" });
  const sub = [data.record ? `${data.record.wins}–${data.record.losses}` : null, data.games != null ? `${data.games} ${t("games", "leikir")}` : null, data.season || null].filter(Boolean).join("   ·   ");
  s1.addText(sub, { x: M, y: 4.15, w: W - 2 * M, h: 0.4, fontFace: "Arial", fontSize: 16, color: "C7CBE0" });

  // ── 2. Overview (AI headline + strengths/weaknesses) ──
  if (data.ai?.headline || data.ai?.summary || (data.ai?.strengths?.length)) {
    const s = pptx.addSlide(); header(s, t("The matchup", "Viðureignin"), t("How they play", "Hvernig þeir spila"));
    if (data.ai?.headline) s.addText(data.ai.headline, { x: M, y: 1.5, w: W - 2 * M, h: 0.8, fontFace: "Arial", fontSize: 18, bold: true, color: INK });
    const colY = 2.5, colW = (W - 2 * M - 0.4) / 2;
    const bullets = (arr: string[] | undefined, x: number, title: string, color: string) => {
      s.addText(title.toUpperCase(), { x, y: colY, w: colW, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color, charSpacing: 1 });
      s.addText((arr ?? []).slice(0, 5).map((b) => ({ text: b, options: { bullet: true, fontSize: 13, color: INK, paraSpaceAfter: 6 } })), { x, y: colY + 0.35, w: colW, h: 3.8, fontFace: "Arial", valign: "top" });
    };
    bullets(data.ai?.strengths, M, t("Dangerous because", "Hættulegir því"), GREEN);
    bullets(data.ai?.weaknesses, M + colW + 0.4, t("Where they're vulnerable", "Þar sem þeir eru veikir"), AMBER);
    foot(s);
  }

  // ── 3. Four Factors + how they score ──
  if (data.fourFactors || data.playtypes?.length || data.shotMap?.length) {
    const s = pptx.addSlide(); header(s, t("How they score", "Hvernig þeir skora"), t("Four Factors & shot profile", "Four Factors & skotprófíll"));
    let y = 1.5;
    if (data.fourFactors) {
      const ff = data.fourFactors;
      const cells = [["eFG%", pct(ff.efgPct)], ["TO%", pct(ff.toPct)], ["OREB%", pct(ff.orebPct)], ["FTF", d1(ff.ftf)], ["PPP", d1(ff.ppp)]];
      const cw = (W - 2 * M - 0.4 * 4) / 5;
      cells.forEach(([l, v], i) => {
        const x = M + i * (cw + 0.4);
        s.addShape("roundRect", { x, y, w: cw, h: 1.1, rectRadius: 0.06, fill: { color: CARD }, line: { color: EDGE, width: 1 } });
        s.addText(v, { x, y: y + 0.12, w: cw, h: 0.6, align: "center", fontFace: "Arial", fontSize: 24, bold: true, color: INK });
        s.addText(l, { x, y: y + 0.72, w: cw, h: 0.3, align: "center", fontFace: "Arial", fontSize: 11, color: MUTE });
      });
      s.addText(t("How they played US (head-to-head).", "Hvernig þeir spiluðu GEGN OKKUR (innbyrðis)."), { x: M, y: y + 1.15, w: W - 2 * M, h: 0.25, fontFace: "Arial", fontSize: 9, italic: true, color: MUTE });
      y += 1.6;
    }
    if (data.playtypes?.length) {
      s.addText(t("Most-used actions", "Mest notuðu sóknir"), { x: M, y, w: W - 2 * M, h: 0.3, fontFace: "Arial", fontSize: 13, bold: true, color: INK });
      const rows: PptxGenJS.TableRow[] = [[
        { text: t("Action", "Sóknartegund"), options: { bold: true, color: MUTE, fontSize: 10 } },
        { text: t("Made-att", "Hitt-reynt"), options: { bold: true, color: MUTE, fontSize: 10, align: "right" } },
        { text: "%", options: { bold: true, color: MUTE, fontSize: 10, align: "right" } },
        { text: t("Share", "Hlutfall"), options: { bold: true, color: MUTE, fontSize: 10, align: "right" } },
      ]];
      for (const p of data.playtypes.slice(0, 6)) rows.push([
        { text: p.label, options: { fontSize: 11, color: INK } },
        { text: `${p.made}-${p.att}`, options: { fontSize: 11, align: "right", color: INK } },
        { text: pct(p.pct), options: { fontSize: 11, align: "right", color: INK } },
        { text: p.share != null ? `${p.share}%` : "—", options: { fontSize: 11, align: "right", color: MUTE } },
      ]);
      s.addTable(rows, { x: M, y: y + 0.35, w: W - 2 * M, border: { type: "solid", color: EDGE, pt: 0.5 }, fontFace: "Arial" });
    }
    foot(s);
  }

  // ── 4. Key players (top 3, one slide each) ──
  for (const p of data.keyPlayers.slice(0, 3)) {
    const s = pptx.addSlide(); header(s, t("Key player", "Lykilmaður"), p.name);
    s.addText(`${d1(p.ppg)} ${t("PPG", "stig")}   ·   ${d1(p.rpg)} ${t("REB", "frák")}   ·   ${d1(p.apg)} ${t("AST", "stoð")}   ·   ${pct(p.fgPct)} FG   ·   ${pct(p.tpPct)} 3P`, { x: M, y: 1.5, w: W - 2 * M, h: 0.4, fontFace: "Arial", fontSize: 15, bold: true, color: COBALT });
    if (p.descriptor) s.addText(is ? p.descriptor.is : p.descriptor.en, { x: M, y: 2.0, w: W - 2 * M, h: 0.6, fontFace: "Arial", fontSize: 13, color: INK });
    const colW = (W - 2 * M - 0.4) / 2;
    if (p.notes?.offense?.length) {
      s.addText(t("Tendencies", "Tilhneigingar").toUpperCase(), { x: M, y: 2.9, w: colW, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: MUTE, charSpacing: 1 });
      s.addText(p.notes.offense.slice(0, 5).map((b) => ({ text: b, options: { bullet: true, fontSize: 13, color: INK, paraSpaceAfter: 6 } })), { x: M, y: 3.25, w: colW, h: 3.2, fontFace: "Arial", valign: "top" });
    }
    if (p.notes?.defense?.length) {
      s.addText(t("When defending — attack them", "Í vörn — sæktu á þá").toUpperCase(), { x: M + colW + 0.4, y: 2.9, w: colW, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: AMBER, charSpacing: 1 });
      s.addText(p.notes.defense.slice(0, 5).map((b) => ({ text: b, options: { bullet: true, fontSize: 13, color: INK, paraSpaceAfter: 6 } })), { x: M + colW + 0.4, y: 3.25, w: colW, h: 3.2, fontFace: "Arial", valign: "top" });
    }
    foot(s);
  }

  // ── 5. How to defend / where to attack ──
  if (data.howToDefend?.length || data.attack?.length) {
    const s = pptx.addSlide(); header(s, t("The game plan", "Leikáætlunin"), t("Defend & attack", "Vörn & sókn"));
    const colW = (W - 2 * M - 0.4) / 2;
    if (data.howToDefend?.length) {
      s.addText(t("How to defend them", "Hvernig á að verjast þeim").toUpperCase(), { x: M, y: 1.5, w: colW, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: GREEN, charSpacing: 1 });
      s.addText(data.howToDefend.slice(0, 6).map((b) => ({ text: b, options: { bullet: true, fontSize: 13, color: INK, paraSpaceAfter: 7 } })), { x: M, y: 1.85, w: colW, h: 4.8, fontFace: "Arial", valign: "top" });
    }
    if (data.attack?.length) {
      s.addText(t("Where to attack", "Hvar á að sækja").toUpperCase(), { x: M + colW + 0.4, y: 1.5, w: colW, h: 0.3, fontFace: "Arial", fontSize: 11, bold: true, color: RED, charSpacing: 1 });
      const rows: PptxGenJS.TableRow[] = [[
        { text: t("Action", "Sóknartegund"), options: { bold: true, color: MUTE, fontSize: 10 } },
        { text: t("Go at", "Sæktu á"), options: { bold: true, color: MUTE, fontSize: 10 } },
        { text: t("Concedes", "Gefur"), options: { bold: true, color: MUTE, fontSize: 10, align: "right" } },
      ]];
      for (const a of data.attack.slice(0, 7)) rows.push([
        { text: clabel(a.action), options: { fontSize: 11, color: INK } },
        { text: a.defender, options: { fontSize: 11, color: INK } },
        { text: `${a.oppPct}%`, options: { fontSize: 11, align: "right", color: RED } },
      ]);
      s.addTable(rows, { x: M + colW + 0.4, y: 1.85, w: colW, border: { type: "solid", color: EDGE, pt: 0.5 }, fontFace: "Arial" });
    }
    foot(s);
  }

  // ── 6. Film — one slide per clip (embedded video or a Play link) ──
  const clipEntries: Array<{ player: string; clip: DeckClip }> = [];
  for (const [player, clips] of Object.entries(data.clipsByPlayer ?? {})) for (const clip of clips) clipEntries.push({ player, clip });
  if (clipEntries.length) {
    const divider = pptx.addSlide(); divider.background = { color: INK };
    divider.addShape("rect", { x: 0, y: 3.55, w: W, h: 0.06, fill: { color: COBALT } });
    divider.addText(t("FILM", "MYNDSKEIÐ"), { x: M, y: 3.0, w: W - 2 * M, h: 0.9, fontFace: "Arial", fontSize: 40, bold: true, color: "FFFFFF" });
    divider.addText(t(`${clipEntries.length} tagged clips`, `${clipEntries.length} merkt skeið`), { x: M, y: 3.9, w: W - 2 * M, h: 0.4, fontFace: "Arial", fontSize: 15, color: "C7CBE0" });
  }
  for (const { player, clip } of clipEntries) {
    const s = pptx.addSlide();
    const cap = [clabel(clip.action), clip.made == null ? null : (clip.made ? t("make", "hitt") : "miss"), [clip.period, clip.clock].filter(Boolean).join(" ")].filter(Boolean).join("  ·  ");
    header(s, player, cap || t("Clip", "Skeið"));
    if (clip.videoDataUri) {
      s.addMedia({ type: "video", data: clip.videoDataUri, x: 2.4, y: 1.5, w: 8.5, h: 4.78 });
    } else if (clip.externalUrl) {
      s.addShape("roundRect", { x: 4.9, y: 3.0, w: 3.5, h: 1.1, rectRadius: 0.08, fill: { color: COBALT }, line: { color: COBALT, width: 1 } });
      s.addText(t("▶  Play clip", "▶  Spila skeið"), { x: 4.9, y: 3.0, w: 3.5, h: 1.1, align: "center", valign: "middle", fontFace: "Arial", fontSize: 18, bold: true, color: "FFFFFF", hyperlink: { url: clip.externalUrl } });
      s.addText(t("Opens in your browser (needs internet).", "Opnast í vafra (þarf nettengingu)."), { x: M, y: 4.3, w: W - 2 * M, h: 0.3, align: "center", fontFace: "Arial", fontSize: 10, color: MUTE, italic: true });
    }
    foot(s);
  }

  await pptx.writeFile({ fileName: `${data.opponentName.replace(/\s+/g, "-")}-scouting-deck.pptx` });
}
