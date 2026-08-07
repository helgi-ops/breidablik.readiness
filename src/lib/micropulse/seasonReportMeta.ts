/**
 * Season-report source binding — pure helpers shared by the Team Match Insights page
 * (tab gating), the season-report API (which per-match table to read) and the PDF
 * (title / filename / provenance).
 *
 * The season report is a per-match-aggregated tactical read, and it is bound to the
 * SELECTED data provider so it can never silently export a different source than the
 * coach is looking at: StatsBomb → sb_team_match_stats, Wyscout → team_match_stats.
 * Descriptive context only — it never touches the readiness colour.
 */

export type SeasonSource = "statsbomb" | "wyscout";

export function seasonReportSourceLabel(source: SeasonSource): string {
  return source === "statsbomb" ? "StatsBomb" : "Wyscout";
}

/** Human provenance line for the report header/badge, per language. */
export function seasonReportProvenance(source: SeasonSource, lang: "EN" | "IS"): string {
  if (source === "statsbomb") return lang === "IS" ? "StatsBomb — per-leik (season)" : "StatsBomb — per-match (season)";
  return lang === "IS" ? "Wyscout Team-Stats (season)" : "Wyscout Team-Stats (season)";
}

/** Is the report generatable for this source? Needs that provider's season data. */
export function seasonReportAvailable(source: SeasonSource, providers: { wyscout: boolean; statsbomb: boolean } | null | undefined): boolean {
  if (!providers) return false;
  return source === "statsbomb" ? !!providers.statsbomb : !!providers.wyscout;
}

/** Bilingual hint shown on the disabled PDF button when the source has no season data. */
export function seasonReportMissingHint(source: SeasonSource, lang: "EN" | "IS"): string {
  if (source === "statsbomb") {
    return lang === "IS"
      ? "Hladdu upp StatsBomb Match Stats skránni til að búa til þessa skýrslu."
      : "Upload your StatsBomb Match Stats export to generate this.";
  }
  return lang === "IS"
    ? "Hladdu upp Wyscout Team → Stats skránni til að búa til þessa skýrslu."
    : "Upload your Wyscout Team → Stats export to generate this.";
}

/** Filename suffix so the two provider reports never collide on disk. */
export function seasonReportFileSuffix(source: SeasonSource): string {
  return source;
}
