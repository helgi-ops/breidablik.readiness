/**
 * Titan published-sheet URL guard (pure — safe to import anywhere, incl. tests/client).
 *
 * The only URL the server will fetch for auto-sync is a Google "Publish to web" CSV link on
 * docs.google.com over https. This is an SSRF guard: a stored URL can never point the server at an
 * internal or arbitrary host.
 */
export function isAllowedTitanSheetUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (u.hostname !== "docs.google.com") return false;
  const isCsv = u.searchParams.get("output") === "csv"
    || u.searchParams.get("format") === "csv"
    || /tqx=out:csv/.test(u.search)
    || u.pathname.endsWith("/export");
  return u.pathname.includes("/spreadsheets/") && (isCsv || u.searchParams.has("gid"));
}
