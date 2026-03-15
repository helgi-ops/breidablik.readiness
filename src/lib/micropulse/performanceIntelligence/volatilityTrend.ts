export type VolatilityTrendPoint = {
  date: string;
  volatility: number;
};

/**
 * Build a normalized 7-day volatility trend series.
 */
export function buildVolatilityTrend(values: Array<{ date: string; volatility?: number | null }>): VolatilityTrendPoint[] {
  return [...values]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-7)
    .map((row) => ({
      date: String(row.date).slice(0, 10),
      volatility: Math.max(0, Math.min(100, Number.isFinite(row.volatility as number) ? (row.volatility as number) : 0)),
    }));
}
