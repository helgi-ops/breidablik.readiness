/**
 * From a Meso week card to the variable's row in the "Load per variable" table (the one place a variable is set):
 * scroll there, flash the row, focus its input. Shared by both Meso tabs. Pure DOM, no state.
 */

export type KpiTableScope = "in" | "pre";

export const kpiTableId = (scope: KpiTableScope) => `kpi-table-${scope}`;
export const kpiRowId = (scope: KpiTableScope, key: string) => `kpi-row-${scope}-${key}`;

/** Scrolls to the variable's row (the whole table when that variable has no row), flashes it, focuses its input. */
export function goToKpiRow(scope: KpiTableScope, key: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(kpiRowId(scope, key)) ?? document.getElementById(kpiTableId(scope));
  if (!el) return;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  el.animate?.([{ backgroundColor: "rgba(39, 64, 230, 0.14)" }, { backgroundColor: "rgba(39, 64, 230, 0)" }], { duration: 1800, easing: "ease-out" });
  el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
}
