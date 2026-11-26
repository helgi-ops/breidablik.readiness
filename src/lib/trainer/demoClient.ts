/**
 * The demo client — one "Demo client" seeded on every new personal-trainer practice
 * (seed_pt_demo_client, migration 20261121120000) so the dashboard and charts have
 * real content in the first ten minutes. players.is_demo marks it.
 *
 * It is shown (badged "Demo") but never counted: not in the dashboard verdict and
 * facts, not in reminders, not in monthly reports. Every place that counts or
 * targets clients runs its rows through these helpers.
 */

export type DemoFlagged = { is_demo?: boolean | null; isDemo?: boolean | null };

/** True for the seeded demo client. */
export function isDemoClient(row: DemoFlagged | null | undefined): boolean {
  return row?.is_demo === true || row?.isDemo === true;
}

/** The real clients only (drops the demo client). */
export function realClients<T extends DemoFlagged>(rows: readonly T[]): T[] {
  return rows.filter((r) => !isDemoClient(r));
}

/** Display name: the demo client is named in the viewer's language. */
export function clientDisplayName(row: DemoFlagged & { name?: string | null; full_name?: string | null }, lang: "EN" | "IS"): string {
  if (isDemoClient(row)) return lang === "IS" ? "Sýnisviðskiptavinur" : "Demo client";
  return (row.name ?? row.full_name ?? "").trim() || "—";
}
