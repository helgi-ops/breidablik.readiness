"use client";

/**
 * MatchMovementPdf — a shareable "how the squad moved vs its norm" report for a
 * single match. Mirrors the on-screen Match Movement (squad + norm) view so the
 * export shows exactly what the coach sees (manifesto: one source, one verdict).
 *
 * "Norm" = each player's own match average (and, for the team headline, the
 * squad's season average). Deviation is framed as distance-from-usual — a
 * descriptive movement read (Niklas: Engine = GPS output, Driver = IMA how) —
 * NOT an injury-risk score. Variant-aware: IMA dims for Pro, GPS dims for
 * Core/Lite (no new data — reuses the computeMatchMovement result).
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { movementDimensions, DIM_DEFS } from "@/lib/micropulse/matchMovement/types";
import type { MatchMovementResult, MatchMovementRow, MovementDimension, MovementFingerprint } from "@/lib/micropulse/matchMovement/types";

function meanFp(rows: MatchMovementRow[], dims: MovementDimension[]): MovementFingerprint {
  const out: MovementFingerprint = {};
  for (const d of dims) {
    const vals = rows.map((r) => r.fingerprint[d.key]).filter((v): v is number => v != null);
    out[d.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

/** % (or points, for pct-kind dims) that `cur` sits away from `base` (the norm). */
function relDev(cur: number | null | undefined, base: number | null | undefined, kind: MovementDimension["kind"]): number | null {
  if (cur == null || base == null) return null;
  return kind === "pct" ? cur - base : base !== 0 ? ((cur - base) / base) * 100 : 0;
}
function sigThreshold(kind: MovementDimension["kind"]): number {
  return kind === "pct" ? 10 : 20;
}
function fmtDev(rel: number | null, kind: MovementDimension["kind"]): string {
  if (rel == null) return "—";
  const m = Math.round(rel);
  const s = m > 0 ? "+" : "";
  return kind === "pct" ? `${s}${m} pts` : `${s}${m}%`;
}
// Neutral, distance-from-usual palette (NOT good/bad): above usual = cobalt,
// below usual = gold, within the usual range = muted.
function devColor(rel: number | null, kind: MovementDimension["kind"]): string {
  if (rel == null) return "#a9a493";
  if (Math.abs(rel) < sigThreshold(kind)) return "#8a8676";
  return rel > 0 ? "#2740e6" : "#b0700f";
}

function fmtDate(iso: string, is: boolean): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString(is ? "is-IS" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 40, fontSize: 9, color: "#221f18", fontFamily: "Helvetica" },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 6, borderBottom: "2 solid #2740e6" },
  brand: { fontSize: 12, fontWeight: 700, color: "#2740e6", letterSpacing: 0.5 },
  meta: { fontSize: 8, color: "#a9a493" },
  h1: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  sub: { fontSize: 9, color: "#6b6658", marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 12, marginBottom: 6, color: "#2740e6" },
  // team summary
  teamRow: { flexDirection: "row", borderBottom: "1 solid #eee", paddingVertical: 4 },
  teamDim: { width: "34%", fontSize: 9 },
  teamVal: { width: "22%", fontSize: 9, textAlign: "right", color: "#6b6658" },
  teamDev: { width: "22%", fontSize: 9, textAlign: "right", fontWeight: 700 },
  teamWord: { width: "22%", fontSize: 8, textAlign: "right", color: "#6b6658" },
  // per-player table
  tHead: { flexDirection: "row", backgroundColor: "#f4f2ec", borderBottom: "1 solid #ddd" },
  tRow: { flexDirection: "row", borderBottom: "0.5 solid #eee" },
  tRowAlt: { flexDirection: "row", borderBottom: "0.5 solid #eee", backgroundColor: "#faf9f6" },
  hdrCell: { padding: 3, fontSize: 7.5, fontWeight: 700 },
  cell: { padding: 3, fontSize: 8, fontWeight: 700, textAlign: "right", fontFamily: "Helvetica" },
  nameCell: { padding: 3, fontSize: 8 },
  legend: { marginTop: 10, fontSize: 7.5, color: "#6b6658", lineHeight: 1.4 },
  defRow: { flexDirection: "row", marginBottom: 2.5 },
  defLabel: { width: "26%", fontSize: 8, fontWeight: 700 },
  defText: { width: "74%", fontSize: 8, color: "#4b4638", lineHeight: 1.35 },
});

export async function downloadMatchMovementPdf(
  result: MatchMovementResult,
  squadMatch: string,
  teamName: string,
  lang: "IS" | "EN",
) {
  const is = lang === "IS";
  const dims = movementDimensions(result.variant);
  const matchRows = result.rows.filter((r) => r.match_date === squadMatch);
  const squadThis = meanFp(matchRows, dims);
  const squadNorm = meanFp(result.rows, dims); // season average = the squad's usual
  const playerRows = matchRows
    .filter((r) => Object.values(r.fingerprint).some((v) => v != null))
    .sort((a, b) => a.name.localeCompare(b.name));

  const nameW = "24%";
  const colW = `${Math.round(76 / Math.max(1, dims.length))}%`;
  const generated = new Date().toLocaleDateString(is ? "is-IS" : "en-US");

  const blob = await pdf(
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.brandRow}>
          <Text style={s.brand}>MicroPulse</Text>
          <Text style={s.meta}>{teamName} · {is ? "búið til" : "generated"} {generated}</Text>
        </View>

        <Text style={s.h1}>{is ? "Leikhreyfing — liðið vs venjan" : "Match Movement — squad vs norm"}</Text>
        <Text style={s.sub}>
          {fmtDate(squadMatch, is)} · {playerRows.length} {is ? "leikmenn" : "players"} · {result.variant === "gps" ? (is ? "GPS-hreyfing (Core/Lite)" : "GPS movement (Core/Lite)") : (is ? "IMA-hreyfing (Pro)" : "IMA movement (Pro)")}
        </Text>

        {/* Team headline: squad this match vs the squad's usual */}
        <Text style={s.sectionTitle}>{is ? "Hvernig liðið hreyfði sig vs venjan" : "How the squad moved vs its usual"}</Text>
        <View>
          {dims.map((d) => {
            const cur = squadThis[d.key] ?? null;
            const base = squadNorm[d.key] ?? null;
            const rel = relDev(cur, base, d.kind);
            const sig = rel != null && Math.abs(rel) >= sigThreshold(d.kind);
            const word = rel == null ? "" : rel > 0 ? (is ? d.moreIS : d.moreEN) : (is ? d.lessIS : d.lessEN);
            return (
              <View key={d.key} style={s.teamRow}>
                <Text style={s.teamDim}>{is ? d.is : d.en}</Text>
                <Text style={s.teamVal}>{cur != null ? cur.toFixed(d.kind === "ratio" ? 2 : 1) : "—"}<Text style={{ color: "#c9c4b6" }}> / {base != null ? base.toFixed(d.kind === "ratio" ? 2 : 1) : "—"}</Text></Text>
                <Text style={[s.teamDev, { color: devColor(rel, d.kind) }]}>{fmtDev(rel, d.kind)}</Text>
                <Text style={s.teamWord}>{sig ? word : (is ? "eins og venjulega" : "as usual")}</Text>
              </View>
            );
          })}
        </View>

        {/* Per-player deviation from each player's own norm */}
        <Text style={s.sectionTitle}>{is ? "Hver leikmaður vs sín eigin venja (% frávik)" : "Each player vs own norm (% deviation)"}</Text>
        <View>
          <View style={s.tHead}>
            <Text style={[s.hdrCell, { width: nameW }]}>{is ? "Leikmaður" : "Player"}</Text>
            {dims.map((d) => (
              <Text key={d.key} style={[s.hdrCell, { width: colW, textAlign: "right" }]}>{is ? d.is : d.en}</Text>
            ))}
          </View>
          {playerRows.map((r, i) => {
            const norm = result.playerAverages[r.player_id] ?? {};
            return (
              <View key={r.player_id} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
                <Text style={[s.nameCell, { width: nameW }]}>{r.name}</Text>
                {dims.map((d) => {
                  const rel = relDev(r.fingerprint[d.key], norm[d.key], d.kind);
                  return <Text key={d.key} style={[s.cell, { width: colW, color: devColor(rel, d.kind) }]}>{fmtDev(rel, d.kind)}</Text>;
                })}
              </View>
            );
          })}
        </View>

        {/* Explainability — the same plain per-dimension definitions the coach
            sees on screen, so the export explains its numbers (manifesto). */}
        <Text style={s.sectionTitle}>{is ? "Hvað mælikvarðarnir þýða" : "What the dimensions mean"}</Text>
        {dims.map((d) => {
          const def = DIM_DEFS[d.key];
          return (
            <View key={d.key} style={s.defRow}>
              <Text style={s.defLabel}>{is ? d.is : d.en}</Text>
              <Text style={s.defText}>{def ? (is ? def.is : def.en) : ""}</Text>
            </View>
          );
        })}
        <Text style={s.legend}>
          {is
            ? "Lestur: hver mælikvarði er borinn saman við venju leikmannsins (eða liðsins). Frávik = fjarlægð frá venju, EKKI meiðslaáhætta. Kóbalt = yfir venju, gull = undir venju, dauft = innan venjulegs bils. „Venja“ = meðaltal leikmanns yfir leiki. Engine (GPS) = hversu mikið; Driver (IMA) = hvernig hann hreyfist. Staðlað á mínútu. Reglur reikna — ekki AI. Buchheit 2014 (persónuleg viðmið), di Prampero 2015."
            : "How to read it: each dimension is compared to the player's (or squad's) usual. Deviation = distance from usual, NOT an injury-risk score. Cobalt = above usual, gold = below usual, muted = within the usual range. \"Norm\" = the player's match average. Engine (GPS) = how much; Driver (IMA) = how they move. Normalised per minute. Rules compute — not AI. Buchheit 2014 (personal norms), di Prampero 2015."}
        </Text>
      </Page>
    </Document>,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `match-movement-${squadMatch}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
